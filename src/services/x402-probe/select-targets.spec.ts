import { selectProbeTargets } from './select-targets';

const at = (hour: number) => new Date(Date.UTC(2026, 9, 15, hour));

describe('selectProbeTargets', () => {
  it('probes never-probed resources before probed ones, stalest first', () => {
    const result = selectProbeTargets(
      [
        {
          entryId: 'a',
          resources: ['r1', 'r2', 'r3'],
          lastProbedAt: new Map([
            ['r1', at(5)],
            ['r2', at(2)],
          ]),
        },
      ],
      { maxPerEntry: 10, maxTotal: 10 }
    );

    expect(result).toEqual([{ entryId: 'a', resources: ['r3', 'r2', 'r1'] }]);
  });

  it('caps the resources taken from a single entry', () => {
    const result = selectProbeTargets(
      [
        {
          entryId: 'a',
          resources: ['r1', 'r2', 'r3', 'r4'],
          lastProbedAt: new Map(),
        },
      ],
      { maxPerEntry: 2, maxTotal: 10 }
    );

    expect(result).toEqual([{ entryId: 'a', resources: ['r1', 'r2'] }]);
  });

  it('caps the total and keeps the stalest resources across entries', () => {
    const result = selectProbeTargets(
      [
        {
          entryId: 'fresh',
          resources: ['f1'],
          lastProbedAt: new Map([['f1', at(9)]]),
        },
        {
          entryId: 'stale',
          resources: ['s1', 's2'],
          lastProbedAt: new Map([
            ['s1', at(1)],
            ['s2', at(2)],
          ]),
        },
      ],
      { maxPerEntry: 10, maxTotal: 2 }
    );

    expect(result).toEqual([{ entryId: 'stale', resources: ['s1', 's2'] }]);
  });

  it('lists a duplicated resource once', () => {
    const result = selectProbeTargets(
      [
        {
          entryId: 'a',
          resources: ['r1', 'r1', 'r2'],
          lastProbedAt: new Map(),
        },
      ],
      { maxPerEntry: 10, maxTotal: 10 }
    );

    expect(result).toEqual([{ entryId: 'a', resources: ['r1', 'r2'] }]);
  });

  it('limits how many resources of one host are taken in a cycle', () => {
    const result = selectProbeTargets(
      [
        {
          entryId: 'a',
          resources: ['https://h.example/1', 'https://h.example/2'],
          lastProbedAt: new Map(),
        },
        {
          entryId: 'b',
          resources: ['https://h.example/3', 'https://o.example/1'],
          lastProbedAt: new Map(),
        },
      ],
      { maxPerEntry: 10, maxTotal: 10, maxPerHost: 2 }
    );

    expect(result).toEqual([
      {
        entryId: 'a',
        resources: ['https://h.example/1', 'https://h.example/2'],
      },
      { entryId: 'b', resources: ['https://o.example/1'] },
    ]);
  });

  it('skips entries without resources', () => {
    expect(
      selectProbeTargets(
        [{ entryId: 'a', resources: [], lastProbedAt: new Map() }],
        {
          maxPerEntry: 10,
          maxTotal: 10,
        }
      )
    ).toEqual([]);
  });
});
