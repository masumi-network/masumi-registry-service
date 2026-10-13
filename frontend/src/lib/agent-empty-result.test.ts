import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeFilterKeys, explainEmptyResult, planEmptyResultProbes } from './agent-empty-result';
import { parseAgentFilters } from './agent-filters';

describe('activeFilterKeys', () => {
  it('counts the default Online status but not the health-check date', () => {
    const filters = parseAgentFilters({ minHealthCheckDate: '2024-03-01' });
    assert.deepEqual(activeFilterKeys(filters), ['status']);
  });
});

describe('planEmptyResultProbes', () => {
  it('never lets a probe force live health checks', () => {
    const filters = parseAgentFilters({ tags: 'x', minHealthCheckDate: '2024-03-01' });
    for (const probe of planEmptyResultProbes(filters)) {
      assert.equal(probe.filters.minHealthCheckDate, '');
    }
  });

  it('adds an unfiltered probe only for two or more filters', () => {
    assert.deepEqual(
      planEmptyResultProbes(parseAgentFilters({})).map((probe) => probe.id),
      ['status'],
    );
    assert.deepEqual(
      planEmptyResultProbes(parseAgentFilters({ tags: 'x' })).map((probe) => probe.id),
      ['status', 'tags', 'unfiltered'],
    );
  });
});

describe('explainEmptyResult', () => {
  it('waits until every probe has answered', () => {
    assert.deepEqual(explainEmptyResult(['status', 'tags'], { status: 'results' }), {
      kind: 'checking',
    });
  });

  it('names each filter whose removal alone brings agents back', () => {
    assert.deepEqual(
      explainEmptyResult(['status', 'tags'], {
        status: 'empty',
        tags: 'results',
        unfiltered: 'results',
      }),
      { kind: 'single', keys: ['tags'] },
    );
  });

  it('blames the combination when only the unfiltered probe finds agents', () => {
    assert.deepEqual(
      explainEmptyResult(['status', 'tags'], {
        status: 'empty',
        tags: 'empty',
        unfiltered: 'results',
      }),
      { kind: 'combination', keys: ['status', 'tags'] },
    );
  });

  it('admits it does not know when a probe failed', () => {
    assert.deepEqual(
      explainEmptyResult(['status', 'tags'], {
        status: 'empty',
        tags: 'error',
        unfiltered: 'empty',
      }),
      { kind: 'unknown', keys: ['status', 'tags'] },
    );
  });

  it('reports an empty network when nothing finds agents', () => {
    assert.deepEqual(explainEmptyResult([], {}), { kind: 'network-empty' });
    assert.deepEqual(explainEmptyResult(['status'], { status: 'empty' }), {
      kind: 'network-empty',
    });
  });
});
