// Score + sort strategy selection for registry entries (MAS-607 slice 3).
// Pure: the service loads the inputs, this module orders them.

import type { RegistryEntrySortBy as SortBy } from '@/routes/api/registry-entry/schemas';

export type RankingWeights = {
  distinctBuyers: number;
  uptime: number;
  lineageAge: number;
};

export type RankingInput = {
  id: string;
  name: string;
  tags: string[];
  createdAt: Date;
  // Rolling uptime (0-1), null until the first health check.
  uptimeEwma: number | null;
  // Distinct buyers that funded a successful purchase (seller withdrawal on
  // the payment contracts) of this agent.
  distinctBuyers: number;
  // First-seen date of the V2 version root (own createdAt for V1).
  lineageStartedAt: Date;
  // Lowest fixed price in the requested unit, null without one (sortBy=price).
  priceAmount: bigint | null;
};

type ScoreComponents = Record<keyof RankingWeights, number>;

export type Ranking = {
  score: number;
  // Each component normalized to 0-1 before weighting.
  components: ScoreComponents;
  weights: RankingWeights;
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Lineage age stops adding to the score after this many days.
const LINEAGE_AGE_CAP_DAYS = 90;

// Scores every candidate relative to the candidate set. Distinct buyers are
// normalized by the set maximum (thesis §6.1.3, "Total Successful Purchases
// ... then normalized"), so reputation split across clones scores lower than
// the same buyers on one agent. `scaleInputs` scores an entry outside the set
// (a stale cursor) on the set's scale without changing it.
export function computeRankings(params: {
  inputs: readonly RankingInput[];
  weights: RankingWeights;
  now: Date;
  scaleInputs?: readonly RankingInput[];
}): Map<string, Ranking> {
  const { inputs, weights } = params;
  const maxDistinctBuyers = Math.max(
    0,
    ...(params.scaleInputs ?? inputs).map((input) => input.distinctBuyers)
  );
  const weightSum =
    weights.distinctBuyers + weights.uptime + weights.lineageAge;

  return new Map(
    inputs.map((input) => {
      const lineageAgeDays = Math.max(
        0,
        (params.now.getTime() - input.lineageStartedAt.getTime()) / DAY_MS
      );
      const components: ScoreComponents = {
        distinctBuyers:
          maxDistinctBuyers > 0
            ? Math.min(input.distinctBuyers / maxDistinctBuyers, 1)
            : 0,
        uptime: input.uptimeEwma ?? 0,
        lineageAge: Math.min(lineageAgeDays / LINEAGE_AGE_CAP_DAYS, 1),
      };
      const score =
        (weights.distinctBuyers * components.distinctBuyers +
          weights.uptime * components.uptime +
          weights.lineageAge * components.lineageAge) /
        weightSum;
      return [input.id, { score, components, weights }];
    })
  );
}

// Text relevance of an entry that already matched the search filter: exact
// name, then name substring, then tag, then any other field.
export function relevanceOf(
  input: Pick<RankingInput, 'name' | 'tags'>,
  query: string
): number {
  const needle = query.trim().toLowerCase();
  const name = input.name.toLowerCase();
  if (name === needle) return 3;
  if (name.includes(needle)) return 2;
  if (input.tags.some((tag) => tag.toLowerCase().includes(needle))) return 1;
  return 0;
}

// Descending by the key, missing values last.
function byDesc(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

function byPriceAsc(left: bigint | null, right: bigint | null): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left < right ? -1 : 1;
}

// Orders candidates for a sort strategy. Ties fall back to id descending, the
// default registry order, so the result is deterministic.
export function sortRankingInputs<T extends RankingInput>(params: {
  inputs: readonly T[];
  rankings: Map<string, Ranking>;
  sortBy: SortBy;
  searchQuery: string | undefined;
}): T[] {
  const { rankings, searchQuery } = params;
  const primary = (left: T, right: T): number => {
    switch (params.sortBy) {
      case 'score':
        return byDesc(
          rankings.get(left.id)?.score ?? null,
          rankings.get(right.id)?.score ?? null
        );
      case 'uptime':
        return byDesc(left.uptimeEwma, right.uptimeEwma);
      case 'recency':
        return right.createdAt.getTime() - left.createdAt.getTime();
      case 'price':
        return byPriceAsc(left.priceAmount, right.priceAmount);
      case 'relevance':
        return searchQuery == null
          ? 0
          : relevanceOf(right, searchQuery) - relevanceOf(left, searchQuery);
    }
  };
  return [...params.inputs].sort(
    (left, right) =>
      primary(left, right) ||
      (left.id < right.id ? 1 : left.id > right.id ? -1 : 0)
  );
}

// Continues a ranked listing at the cursor entry (inclusive, like the Prisma
// cursor of the unsorted listing). An unknown cursor yields an empty page;
// the service places a cursor that left the set back into the order first.
export function sliceFromCursor<T extends { id: string }>(
  sorted: readonly T[],
  cursorId: string | undefined
): T[] {
  if (cursorId == null) return [...sorted];
  const start = sorted.findIndex((entry) => entry.id === cursorId);
  return start === -1 ? [] : sorted.slice(start);
}

// Lowest fixed price in `unit` across the entry's own pricing (V1) and its
// payment sources (V2). Prices outside [minAmount, maxAmount] are ignored, so
// the sort key is a price that matched the amount filter.
export function lowestPriceInUnit(
  pricings: readonly ({
    FixedPricing: { Amounts: { unit: string; amount: bigint }[] } | null;
  } | null)[],
  unit: string | undefined,
  range: { minAmount?: bigint; maxAmount?: bigint } = {}
): bigint | null {
  if (unit == null) return null;
  const amounts = pricings.flatMap(
    (pricing) =>
      pricing?.FixedPricing?.Amounts.filter(
        (amount) =>
          amount.unit === unit &&
          (range.minAmount == null || amount.amount >= range.minAmount) &&
          (range.maxAmount == null || amount.amount <= range.maxAmount)
      ) ?? []
  );
  if (amounts.length === 0) return null;
  return amounts
    .map((amount) => amount.amount)
    .reduce((a, b) => (b < a ? b : a));
}
