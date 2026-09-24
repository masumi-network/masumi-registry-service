import {
  computeRankings,
  lowestPriceInUnit,
  relevanceOf,
  sliceFromCursor,
  sortRankingInputs,
  type RankingInput,
  type RankingWeights,
} from './registry-ranking';
import type { RegistryEntrySortBy } from '@/routes/api/registry-entry/schemas';

const NOW = new Date('2026-09-23T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const WEIGHTS: RankingWeights = {
  successfulPurchases: 0.6,
  uptime: 0.3,
  lineageAge: 0.1,
};

function agent(
  id: string,
  overrides: Partial<RankingInput> = {}
): RankingInput {
  return {
    id,
    name: id,
    tags: [],
    createdAt: daysAgo(30),
    uptimeEwma: 0.9,
    successfulPurchases: 0,
    lineageStartedAt: daysAgo(30),
    priceAmount: null,
    ...overrides,
  };
}

function rank(
  inputs: RankingInput[],
  sortBy: RegistryEntrySortBy,
  options: { weights?: RankingWeights; searchQuery?: string } = {}
) {
  const rankings = computeRankings({
    inputs,
    weights: options.weights ?? WEIGHTS,
    now: NOW,
  });
  const order = sortRankingInputs({
    inputs,
    rankings,
    sortBy,
    searchQuery: options.searchQuery,
  }).map((input) => input.id);
  return { rankings, order };
}

describe('computeRankings', () => {
  it('exposes normalized components and weights', () => {
    const { rankings } = rank(
      [
        agent('a', {
          successfulPurchases: 10,
          uptimeEwma: 1,
          lineageStartedAt: daysAgo(90),
        }),
        agent('b', {
          successfulPurchases: 5,
          uptimeEwma: 0.5,
          lineageStartedAt: daysAgo(45),
        }),
      ],
      'score'
    );

    expect(rankings.get('b')?.score).toBeCloseTo(0.5);
    expect(rankings.get('b')).toEqual({
      score: expect.any(Number),
      components: {
        successfulPurchases: 0.5,
        uptime: 0.5,
        lineageAge: 0.5,
      },
      weights: WEIGHTS,
    });
    expect(rankings.get('a')?.score).toBeCloseTo(1);
  });

  it('scores an empty history as zero instead of dividing by zero', () => {
    const { rankings } = rank(
      [agent('new', { uptimeEwma: null, lineageStartedAt: NOW })],
      'score'
    );
    expect(rankings.get('new')?.score).toBe(0);
  });

  it('respects configured weights', () => {
    const inputs = [
      agent('buyers-favourite', { successfulPurchases: 50, uptimeEwma: 0.5 }),
      agent('always-up', { successfulPurchases: 0, uptimeEwma: 1 }),
    ];

    expect(rank(inputs, 'score').order).toEqual([
      'buyers-favourite',
      'always-up',
    ]);
    expect(
      rank(inputs, 'score', {
        weights: { successfulPurchases: 0, uptime: 1, lineageAge: 0 },
      }).order
    ).toEqual(['always-up', 'buyers-favourite']);
  });
});

describe('sortBy score: sybil resistance (thesis §3.1.4, §6.1.3)', () => {
  it('ranks an agent with real purchase history above fresh clones with perfect uptime', () => {
    const clones = Array.from({ length: 20 }, (_, index) =>
      agent(`clone-${index}`, {
        uptimeEwma: 1,
        successfulPurchases: 0,
        createdAt: NOW,
        lineageStartedAt: NOW,
      })
    );
    const { order } = rank(
      [
        ...clones,
        agent('established', { successfulPurchases: 40, uptimeEwma: 0.8 }),
      ],
      'score'
    );

    expect(order[0]).toBe('established');
  });

  it('does not reward splitting purchases across identities', () => {
    // Same 30 purchases: all on one agent vs spread over three clones.
    const { rankings } = rank(
      [
        agent('single', { successfulPurchases: 30 }),
        agent('split-1', { successfulPurchases: 10 }),
        agent('split-2', { successfulPurchases: 10 }),
        agent('split-3', { successfulPurchases: 10 }),
      ],
      'score'
    );

    const single = rankings.get('single')!.score;
    for (const clone of ['split-1', 'split-2', 'split-3']) {
      expect(rankings.get(clone)!.score).toBeLessThan(single);
    }
  });

  it('gives a re-registered identity no lineage age (thesis B6)', () => {
    const { rankings } = rank(
      [
        agent('old', { lineageStartedAt: daysAgo(90) }),
        agent('re-registered', { createdAt: NOW, lineageStartedAt: NOW }),
      ],
      'score'
    );
    expect(rankings.get('re-registered')!.components.lineageAge).toBe(0);
    expect(rankings.get('old')!.components.lineageAge).toBe(1);
  });

  it('does not let a price undercut outrank purchase history', () => {
    const { order } = rank(
      [
        agent('undercutter', { priceAmount: BigInt(1) }),
        agent('trusted', {
          successfulPurchases: 20,
          priceAmount: BigInt(5_000_000),
        }),
      ],
      'score'
    );
    expect(order[0]).toBe('trusted');
  });
});

describe('sortBy uptime', () => {
  it('orders by rolling uptime, unchecked entries last', () => {
    expect(
      rank(
        [
          agent('unchecked', { uptimeEwma: null }),
          agent('flaky', { uptimeEwma: 0.4 }),
          agent('steady', { uptimeEwma: 0.99 }),
        ],
        'uptime'
      ).order
    ).toEqual(['steady', 'flaky', 'unchecked']);
  });

  it('is gameable by clones on its own, which is why score weights purchases', () => {
    const { order } = rank(
      [
        agent('established', { uptimeEwma: 0.95, successfulPurchases: 100 }),
        agent('clone', { uptimeEwma: 1, successfulPurchases: 0 }),
      ],
      'uptime'
    );
    expect(order[0]).toBe('clone');
  });
});

describe('sortBy price', () => {
  it('orders cheapest first, entries without a price in the unit last', () => {
    expect(
      rank(
        [
          agent('no-price'),
          agent('pricey', { priceAmount: BigInt(9_000_000) }),
          agent('cheap', { priceAmount: BigInt(1_000_000) }),
        ],
        'price'
      ).order
    ).toEqual(['cheap', 'pricey', 'no-price']);
  });

  it('compares amounts beyond Number precision exactly', () => {
    expect(
      rank(
        [
          agent('bigger', { priceAmount: BigInt('9007199254740993') }),
          agent('smaller', { priceAmount: BigInt('9007199254740992') }),
        ],
        'price'
      ).order
    ).toEqual(['smaller', 'bigger']);
  });
});

describe('sortBy recency', () => {
  it('orders newest first', () => {
    expect(
      rank(
        [
          agent('old', { createdAt: daysAgo(10) }),
          agent('new', { createdAt: daysAgo(1) }),
        ],
        'recency'
      ).order
    ).toEqual(['new', 'old']);
  });
});

describe('sortBy relevance', () => {
  it('orders exact name, then name substring, then tag matches', () => {
    expect(
      rank(
        [
          agent('tagged', { name: 'Helper', tags: ['translator'] }),
          agent('partial', { name: 'Pro Translator Bot' }),
          agent('exact', { name: 'Translator' }),
          agent('other', { name: 'Unrelated' }),
        ],
        'relevance',
        { searchQuery: ' translator ' }
      ).order
    ).toEqual(['exact', 'partial', 'tagged', 'other']);
  });

  it('cannot be gamed by keyword-stuffed tags over a name match', () => {
    expect(
      relevanceOf(
        { name: 'x', tags: ['translator', 'translator', 'translator'] },
        'translator'
      )
    ).toBeLessThan(
      relevanceOf({ name: 'Translator Pro', tags: [] }, 'translator')
    );
  });
});

describe('deterministic ordering', () => {
  it('breaks ties by id descending, the default registry order', () => {
    expect(rank([agent('a'), agent('c'), agent('b')], 'score').order).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

describe('sliceFromCursor', () => {
  const sorted = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];

  it('starts at the cursor entry, inclusive', () => {
    expect(sliceFromCursor(sorted, 'y')).toEqual([{ id: 'y' }, { id: 'z' }]);
  });

  it('returns everything without a cursor and nothing for an unknown one', () => {
    expect(sliceFromCursor(sorted, undefined)).toEqual(sorted);
    expect(sliceFromCursor(sorted, 'gone')).toEqual([]);
  });
});

describe('lowestPriceInUnit', () => {
  const fixed = (...amounts: [string, number][]) => ({
    FixedPricing: {
      Amounts: amounts.map(([unit, amount]) => ({
        unit,
        amount: BigInt(amount),
      })),
    },
  });

  it('takes the lowest amount in the unit across V1 and V2 pricing', () => {
    expect(
      lowestPriceInUnit(
        [fixed(['lovelace', 5]), null, fixed(['usdm', 1], ['lovelace', 3])],
        'lovelace'
      )
    ).toBe(BigInt(3));
  });

  it('returns null without a unit or without a price in it', () => {
    expect(lowestPriceInUnit([fixed(['lovelace', 5])], undefined)).toBeNull();
    expect(
      lowestPriceInUnit([fixed(['usdm', 5]), null], 'lovelace')
    ).toBeNull();
  });
});
