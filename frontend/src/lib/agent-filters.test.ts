import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRegistryQueryBody,
  MAX_TAGS,
  parseAgentFilters,
  resetFilters,
  sameView,
  serializeAgentFilters,
  toggleValue,
  AGENT_STATUSES,
} from './agent-filters';

describe('parseAgentFilters', () => {
  it('gives the default view for an empty query', () => {
    const filters = parseAgentFilters({});
    assert.deepEqual(filters.statuses, ['Online']);
    assert.equal(filters.pageSize, 10);
    assert.equal(filters.minHealthCheckDate, '');
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
    assert.equal(parseAgentFilters({ minHealthCheckDate: '2026-02-30' }).minHealthCheckDate, '');
    assert.equal(parseAgentFilters({ minHealthCheckDate: '9999-01-01' }).minHealthCheckDate, '');
    assert.equal(
      parseAgentFilters({ minHealthCheckDate: '2024-03-01' }).minHealthCheckDate,
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

describe('buildRegistryQueryBody', () => {
  it('leaves unset filters undefined and always sends the statuses', () => {
    const body = buildRegistryQueryBody(parseAgentFilters({}), 'Preprod', { limit: 10 });
    assert.deepEqual(body.filter?.status, ['Online']);
    assert.equal(body.filter?.tags, undefined);
    assert.equal(body.filter?.capability, undefined);
    assert.equal(body.minHealthCheckDate, undefined);
  });

  it('sends a capability with its version and a date as a Date', () => {
    const filters = parseAgentFilters({
      capability: 'foo',
      capabilityVersion: '1.0',
      minHealthCheckDate: '2024-03-01',
    });
    const body = buildRegistryQueryBody(filters, 'Mainnet', { limit: 11, cursorId: 'c1' });
    assert.deepEqual(body.filter?.capability, { name: 'foo', version: '1.0' });
    assert.ok(body.minHealthCheckDate instanceof Date);
    assert.equal(body.cursorId, 'c1');
  });
});
