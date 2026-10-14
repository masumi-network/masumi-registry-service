import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInboxListRequest, parseInboxFilters, serializeInboxFilters } from './inbox-filters';

describe('parseInboxFilters', () => {
  it('defaults to the statuses the API itself defaults to', () => {
    assert.deepEqual(parseInboxFilters({}), {
      query: '',
      statuses: ['Pending', 'Verified'],
      policyId: '',
    });
  });

  it('keeps known statuses in canonical order and drops the rest', () => {
    assert.deepEqual(parseInboxFilters({ status: ['Invalid', 'nope', 'Pending'] }).statuses, [
      'Pending',
      'Invalid',
    ]);
  });

  it('trims and bounds the search text and policy id like the API', () => {
    const filters = parseInboxFilters({ q: '  bob ', policyId: 'x'.repeat(251) });
    assert.equal(filters.query, 'bob');
    assert.equal(filters.policyId, '');
  });
});

describe('serializeInboxFilters', () => {
  it('leaves defaults out and round-trips a view', () => {
    assert.deepEqual(serializeInboxFilters(parseInboxFilters({})), {});
    const view = parseInboxFilters({ q: 'bob', status: ['Invalid'], policyId: 'abc' });
    assert.deepEqual(parseInboxFilters(serializeInboxFilters(view)), view);
  });
});

describe('buildInboxListRequest', () => {
  it('lists with every chosen status sent explicitly', () => {
    const request = buildInboxListRequest(parseInboxFilters({}), 'Preprod', { limit: 10 });
    assert.equal(request.endpoint, 'query');
    assert.deepEqual(request.body.filter, { status: ['Pending', 'Verified'], policyId: undefined });
  });

  it('searches with only what the search route honours: it ignores filters', () => {
    const request = buildInboxListRequest(
      parseInboxFilters({ q: 'bob', policyId: 'abc' }),
      'Mainnet',
      { limit: 11, cursorId: 'c1' },
    );
    assert.deepEqual(request, {
      endpoint: 'search',
      body: { network: 'Mainnet', limit: 11, cursorId: 'c1', query: 'bob' },
    });
  });

  it('caps the search text at the 80 characters the search route accepts', () => {
    assert.equal(parseInboxFilters({ q: 'x'.repeat(81) }).query, '');
    assert.equal(parseInboxFilters({ q: 'x'.repeat(80) }).query.length, 80);
  });
});
