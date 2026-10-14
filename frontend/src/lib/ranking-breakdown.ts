import type { RegistryEntry, RegistryEntryRanking } from '@/lib/api/generated';
import { agentPricingSchema } from './display-labels';

// Explains an order the API already chose. Nothing here sorts or scores entries: the rows
// render in response order, and these helpers only put the API's reasons into words.

export type RankingComponentKey = keyof RegistryEntryRanking['components'];

const COMPONENT_KEYS: readonly RankingComponentKey[] = ['distinctBuyers', 'uptime', 'lineageAge'];

export interface RankingComponentRow {
  key: RankingComponentKey;
  /** The component, 0-1, as the API computed it. */
  value: number;
  weight: number;
  /** weight × value / weight sum: this component's part of the score. */
  contribution: number;
}

/** The score's components, each with its weight and its part of the score. */
export function rankingBreakdown(ranking: RegistryEntryRanking): RankingComponentRow[] {
  const weightSum = COMPONENT_KEYS.reduce((sum, key) => sum + ranking.weights[key], 0);
  return COMPONENT_KEYS.map((key) => {
    const value = ranking.components[key];
    const weight = ranking.weights[key];
    return {
      key,
      value,
      weight,
      contribution: weightSum > 0 ? (weight * value) / weightSum : 0,
    };
  });
}

export type RelevanceReason = 'exact-name' | 'name' | 'tag' | 'other';

/**
 * The text-match tier sortBy=relevance ordered by, mirroring relevanceOf in
 * src/services/registry-entry/registry-ranking.ts: exact name, then name substring, then
 * a tag, then any other field.
 */
export function relevanceReason(
  entry: Pick<RegistryEntry, 'name' | 'tags'>,
  query: string,
): RelevanceReason {
  const needle = query.trim().toLowerCase();
  const name = entry.name.toLowerCase();
  if (name === needle) return 'exact-name';
  if (name.includes(needle)) return 'name';
  if ((entry.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))) return 'tag';
  return 'other';
}

export interface AmountRange {
  minAmount?: string;
  maxAmount?: string;
}

const isAmount = (value: string | undefined): value is string =>
  value !== undefined && /^\d+$/.test(value);

/**
 * The sortBy=price key: the lowest fixed price in `unit` across the entry's own pricing
 * (V1) and its payment sources (V2), ignoring prices outside the amount filter, as
 * lowestPriceInUnit in src/services/registry-entry/registry-ranking.ts does.
 */
export function lowestPriceInUnit(
  entry: Pick<RegistryEntry, 'AgentPricing' | 'SupportedPaymentSources'>,
  unit: string,
  range: AmountRange = {},
): string | null {
  if (unit === '') return null;
  const pricing = agentPricingSchema.safeParse(entry.AgentPricing);
  const own =
    pricing.success && pricing.data.pricingType === 'Fixed'
      ? pricing.data.FixedPricing.Amounts.filter((price) => price.unit === unit).map(
          (price) => price.amount,
        )
      : [];
  const sources = entry.SupportedPaymentSources.flatMap((source) =>
    source.pricing.pricingType === 'Fixed'
      ? source.pricing.fixed.filter((price) => price.asset === unit).map((price) => price.amount)
      : [],
  );
  const min = isAmount(range.minAmount) ? BigInt(range.minAmount) : null;
  const max = isAmount(range.maxAmount) ? BigInt(range.maxAmount) : null;
  const inRange = [...own, ...sources]
    .filter(isAmount)
    .map((amount) => BigInt(amount))
    .filter((amount) => (min === null || amount >= min) && (max === null || amount <= max));
  if (inRange.length === 0) return null;
  return inRange.reduce((lowest, amount) => (amount < lowest ? amount : lowest)).toString();
}
