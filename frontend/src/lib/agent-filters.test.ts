import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRegistryListRequest,
  effectiveSortBy,
  MAX_TAGS,
  parseAgentFilters,
  resetFilters,
  sameView,
  serializeAgentFilters,
  setStatusMode,
  shownStatuses,
  toggleValue,
  AGENT_STATUSES,
  type AgentFilters,
} from './agent-filters';

describe('parseAgentFilters', () => {
  it('gives the default view for an empty query', () => {
    const filters = parseAgentFilters({});
    assert.deepEqual(filters.statuses, ['Online']);
    assert.equal(filters.pageSize, 10);
    assert.equal(filters.lastCheckedAfter, '');
    assert.equal(filters.query, '');
    assert.equal(filters.sortBy, '');
  });

  it('drops unknown values and keeps the canonical order', () => {
    const filters = parseAgentFilters({ status: ['Invalid', 'nope', 'Online'] });
    assert.deepEqual(filters.statuses, ['Online', 'Invalid']);
  });

  it('lets one bad parameter fall back without wiping the others', () => {
    const filters = parseAgentFilters({ limit: '999', policyId: 'abc' });
    assert.equal(filters.pageSize, 10);
    assert.equal(filters.policyId, 'abc');
  });

  it('keeps a capability name verbatim, spaces included', () => {
    const filters = parseAgentFilters({ capability: 'foo ', capabilityVersion: ' 1.0' });
    assert.equal(filters.capabilityName, 'foo ');
    assert.equal(filters.capabilityVersion, ' 1.0');
  });

  it('ignores a capability version without a capability name', () => {
    assert.equal(parseAgentFilters({ capabilityVersion: '1.0' }).capabilityVersion, '');
  });

  it('de-duplicates tags and caps how many a link can carry', () => {
    const tags = Array.from({ length: MAX_TAGS + 5 }, (_, index) => `tag-${index}`);
    const filters = parseAgentFilters({ tags: ['a', 'a', ' ', ...tags] });
    assert.equal(filters.tags.length, MAX_TAGS);
    assert.equal(filters.tags[0], 'a');
    assert.equal(filters.tags.includes(' '), false);
  });

  it('rejects an impossible or future health-check date', () => {
    assert.equal(parseAgentFilters({ lastCheckedAfter: '2026-02-30' }).lastCheckedAfter, '');
    assert.equal(parseAgentFilters({ lastCheckedAfter: '9999-01-01' }).lastCheckedAfter, '');
    assert.equal(
      parseAgentFilters({ lastCheckedAfter: '2024-03-01' }).lastCheckedAfter,
      '2024-03-01',
    );
  });

  it('still reads the deprecated minHealthCheckDate from old links', () => {
    assert.equal(
      parseAgentFilters({ minHealthCheckDate: '2024-03-01' }).lastCheckedAfter,
      '2024-03-01',
    );
  });

  it('drops resolveToLatestVersion without an asset identifier', () => {
    assert.equal(
      parseAgentFilters({ resolveToLatestVersion: 'true' }).resolveToLatestVersion,
      false,
    );
  });
});

describe('serializeAgentFilters', () => {
  it('round-trips a view through the URL', () => {
    const view = parseAgentFilters({
      status: ['Online', 'Offline'],
      tags: ['x', 'y'],
      capability: 'foo ',
      limit: '25',
    });
    assert.deepEqual(parseAgentFilters(serializeAgentFilters(view)), view);
  });

  it('leaves defaults out of the URL', () => {
    assert.deepEqual(serializeAgentFilters(parseAgentFilters({})), {});
  });
});

describe('sameView and resetFilters', () => {
  it('compares views by what they show', () => {
    const view = parseAgentFilters({ tags: ['x'] });
    assert.equal(sameView(view, parseAgentFilters({ tags: 'x' })), true);
    assert.equal(sameView(view, resetFilters(view)), false);
  });

  it('keeps the page size on reset', () => {
    assert.equal(resetFilters(parseAgentFilters({ limit: '50', tags: 'x' })).pageSize, 50);
  });
});

describe('toggleValue', () => {
  it('keeps the canonical order', () => {
    assert.deepEqual(toggleValue(AGENT_STATUSES, ['Invalid'], 'Online', true), [
      'Online',
      'Invalid',
    ]);
    assert.deepEqual(toggleValue(AGENT_STATUSES, ['Online', 'Invalid'], 'Online', false), [
      'Invalid',
    ]);
  });
});

describe('search text and sort in the URL', () => {
  it('reads the search text, trimmed and capped like the API', () => {
    assert.equal(parseAgentFilters({ q: '  weather  ' }).query, 'weather');
    assert.equal(parseAgentFilters({ q: 'x'.repeat(121) }).query, '');
  });

  it('keeps a valid sort and drops an unknown one', () => {
    assert.equal(parseAgentFilters({ sortBy: 'score' }).sortBy, 'score');
    assert.equal(parseAgentFilters({ sortBy: 'nope' }).sortBy, '');
  });

  it('treats relevance as the default, so a search has one URL', () => {
    const explicit = parseAgentFilters({ q: 'x', sortBy: 'relevance' });
    assert.equal(explicit.sortBy, '');
    assert.deepEqual(serializeAgentFilters(explicit), { q: 'x' });
  });

  it('drops a price sort without a price unit', () => {
    assert.equal(parseAgentFilters({ sortBy: 'price' }).sortBy, '');
    assert.equal(parseAgentFilters({ sortBy: 'price', priceUnit: 'lovelace' }).sortBy, 'price');
  });

  it('round-trips search, sort and every new filter', () => {
    const view = parseAgentFilters({
      q: 'weather',
      sortBy: 'price',
      excludeStatus: ['Invalid'],
      pricingType: 'Fixed',
      priceUnit: 'lovelace',
      minPrice: '100',
      maxPrice: '5000000',
      minUptime: '95.5',
      onlyOnline: 'true',
      lastCheckedAfter: '2024-03-01',
      registeredAfter: '2024-01-01',
      registeredBefore: '2024-06-30',
    });
    assert.deepEqual(parseAgentFilters(serializeAgentFilters(view)), view);
  });
});

describe('effectiveSortBy', () => {
  const view = (patch: Partial<AgentFilters>) => ({ ...parseAgentFilters({}), ...patch });

  it('sorts a search by relevance and a plain list in the registry order by default', () => {
    assert.equal(effectiveSortBy(view({ query: 'x' })), 'relevance');
    assert.equal(effectiveSortBy(view({})), undefined);
  });

  it('never sends relevance without search text or price without a unit', () => {
    assert.equal(effectiveSortBy(view({ sortBy: 'relevance' })), undefined);
    assert.equal(effectiveSortBy(view({ sortBy: 'price' })), undefined);
    assert.equal(effectiveSortBy(view({ sortBy: 'price', priceUnit: 'u' })), 'price');
  });

  it('keeps an explicit sort while searching', () => {
    assert.equal(effectiveSortBy(view({ query: 'x', sortBy: 'score' })), 'score');
  });
});

describe('the new filters', () => {
  it('only allows a unit and amounts with Fixed (or unset) pricing', () => {
    const free = parseAgentFilters({ pricingType: 'Free', priceUnit: 'lovelace', minPrice: '1' });
    assert.equal(free.priceUnit, '');
    assert.equal(free.minPrice, '');
    assert.equal(parseAgentFilters({ minPrice: '1' }).minPrice, '', 'amounts need a unit');
  });

  it('rejects malformed amounts and a maximum below the minimum', () => {
    assert.equal(parseAgentFilters({ priceUnit: 'u', minPrice: '1.5' }).minPrice, '');
    assert.equal(parseAgentFilters({ priceUnit: 'u', minPrice: '9'.repeat(20) }).minPrice, '');
    const crossed = parseAgentFilters({ priceUnit: 'u', minPrice: '10', maxPrice: '9' });
    assert.equal(crossed.minPrice, '10');
    assert.equal(crossed.maxPrice, '');
  });

  it('accepts an uptime percentage between 0 and 100', () => {
    assert.equal(parseAgentFilters({ minUptime: '0' }).minUptimePercent, '0');
    assert.equal(parseAgentFilters({ minUptime: '100.01' }).minUptimePercent, '');
    assert.equal(parseAgentFilters({ minUptime: '-1' }).minUptimePercent, '');
  });

  it('hides 1-3 statuses, and ignores a status list while hiding', () => {
    const hiding = parseAgentFilters({ excludeStatus: 'Invalid', status: 'Offline' });
    assert.deepEqual(hiding.excludedStatuses, ['Invalid']);
    assert.deepEqual(shownStatuses(hiding), ['Online', 'Offline', 'Deregistered']);
    assert.deepEqual(
      parseAgentFilters({ excludeStatus: [...AGENT_STATUSES] }).excludedStatuses,
      [],
    );
  });
});

describe('setStatusMode', () => {
  it('switches between show and hide without changing what is shown', () => {
    const shown = parseAgentFilters({ status: ['Online', 'Offline'] });
    const hidden = setStatusMode(shown, 'hide');
    assert.deepEqual(hidden.excludedStatuses, ['Deregistered', 'Invalid']);
    assert.deepEqual(shownStatuses(hidden), ['Online', 'Offline']);
    assert.deepEqual(setStatusMode(hidden, 'show').statuses, ['Online', 'Offline']);
  });

  it('leaves a view showing every status alone: there is nothing to hide', () => {
    const all = parseAgentFilters({ status: [...AGENT_STATUSES] });
    assert.equal(setStatusMode(all, 'hide'), all);
  });
});

describe('resetFilters keeps search and sort', () => {
  it('keeps the search text and a sort, but not a price sort without its unit', () => {
    const view = parseAgentFilters({ q: 'x', sortBy: 'score', tags: 't' });
    const reset = resetFilters(view);
    assert.equal(reset.query, 'x');
    assert.equal(reset.sortBy, 'score');
    assert.deepEqual(reset.tags, []);
    const priced = parseAgentFilters({ sortBy: 'price', priceUnit: 'u' });
    assert.equal(resetFilters(priced).sortBy, '');
  });
});

describe('buildRegistryListRequest', () => {
  it('queries the plain list without search text and sends the statuses', () => {
    const request = buildRegistryListRequest(parseAgentFilters({}), 'Preprod', { limit: 10 });
    assert.equal(request.endpoint, 'query');
    assert.deepEqual(request.body.filter?.status, ['Online']);
    assert.equal(request.body.filter?.tags, undefined);
    assert.equal(request.body.filter?.health, undefined);
    assert.equal(request.body.sortBy, undefined);
    // The deprecated top-level field is never sent any more.
    assert.equal('minHealthCheckDate' in request.body, false);
  });

  it('searches with the same filter and sorts by relevance by default', () => {
    const request = buildRegistryListRequest(
      parseAgentFilters({ q: 'weather', tags: 'x' }),
      'Mainnet',
      { limit: 11, cursorId: 'c1' },
    );
    assert.equal(request.endpoint, 'search');
    assert.equal(request.endpoint === 'search' && request.body.query, 'weather');
    assert.equal(request.body.sortBy, 'relevance');
    assert.deepEqual(request.body.filter?.tags, ['x']);
    assert.equal(request.body.cursorId, 'c1');
  });

  it('sends hidden statuses as excludeStatus alone', () => {
    const request = buildRegistryListRequest(
      parseAgentFilters({ excludeStatus: 'Invalid' }),
      'Preprod',
      { limit: 10 },
    );
    assert.equal(request.body.filter?.status, undefined);
    assert.deepEqual(request.body.filter?.excludeStatus, ['Invalid']);
  });

  it('builds pricing, health and first-seen filters', () => {
    const filter = buildRegistryListRequest(
      parseAgentFilters({
        sortBy: 'price',
        priceUnit: 'lovelace',
        maxPrice: '5000000',
        minUptime: '90',
        lastCheckedAfter: '2024-03-01',
        registeredAfter: '2024-01-01',
        registeredBefore: '2024-01-31',
        capability: 'foo',
        capabilityVersion: '1.0',
      }),
      'Preprod',
      { limit: 10 },
    );
    const body = filter.body;
    assert.equal(body.sortBy, 'price');
    assert.deepEqual(body.filter?.pricing, {
      pricingType: undefined,
      unit: 'lovelace',
      minAmount: undefined,
      maxAmount: '5000000',
    });
    assert.equal(body.filter?.health?.minUptimePercent, 90);
    assert.ok(body.filter?.health?.lastCheckedAfter instanceof Date);
    assert.deepEqual(body.filter?.capability, { name: 'foo', version: '1.0' });
    // Both first-seen bounds are inclusive days: the upper one ends at the day's last ms.
    const after = body.filter?.registeredAfter as Date;
    const before = body.filter?.registeredBefore as Date;
    assert.equal(after.getDate(), 1);
    assert.equal(before.getDate(), 31);
    assert.equal(before.getHours(), 23);
    assert.equal(before.getMilliseconds(), 999);
  });
});

describe('canonical amounts and uptime', () => {
  it('spells equivalent amounts and percentages one way, so one view has one URL', () => {
    const view = parseAgentFilters({ priceUnit: 'u', minPrice: '007', minUptime: '95.50' });
    assert.equal(view.minPrice, '7');
    assert.equal(view.minUptimePercent, '95.5');
    assert.equal(
      sameView(view, parseAgentFilters({ priceUnit: 'u', minPrice: '7', minUptime: '95.5' })),
      true,
    );
  });
});
