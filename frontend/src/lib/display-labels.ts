import { z } from 'zod';
import type { RegistryEntry } from '@/lib/api/generated';
import type { PaymentType, SortBy } from './agent-filters';
import type { RankingComponentKey, RelevanceReason } from './ranking-breakdown';
import type { MatchSource } from './search-match';

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  Web3CardanoV1: 'Cardano V1',
  Web3CardanoV2: 'Cardano V2',
  None: 'None',
};

export const SORT_LABELS: Record<SortBy, string> = {
  relevance: 'Relevance',
  score: 'Score',
  uptime: 'Uptime',
  price: 'Price, lowest first',
  recency: 'Newest first seen',
};

export const MATCH_SOURCE_LABELS: Record<MatchSource, string> = {
  metadata: 'Metadata',
  capability: 'Capability',
  tags: 'Tags',
  'across-fields': 'Across fields',
};

export const RANKING_COMPONENT_LABELS: Record<RankingComponentKey, string> = {
  distinctBuyers: 'Buyers',
  uptime: 'Uptime',
  lineageAge: 'Lineage age',
};

export const RELEVANCE_REASON_LABELS: Record<RelevanceReason, string> = {
  'exact-name': 'Name is the search text',
  name: 'Name contains the search text',
  tag: 'A tag contains the search text',
  other: 'Another field contains the search text',
};

export const ENTRY_TYPE_LABELS: Record<RegistryEntry['type'], string> = {
  Standard: 'Standard',
  OpenApi: 'OpenAPI',
  X402: 'x402',
  A2A: 'A2A',
};

/** Share of health checks the agent passed. */
export function formatUptime(uptimeCount: number, uptimeCheckCount: number): string {
  if (uptimeCheckCount <= 0) return '—';
  // Floor, so an imperfect record never reads as 100%.
  return `${Math.floor((uptimeCount / uptimeCheckCount) * 100)}%`;
}

/** True for Cardano's base asset: an empty unit or "lovelace" in registry metadata. */
function isLovelace(unit: string): boolean {
  return unit === '' || unit === 'lovelace';
}

/** "ADA" for lovelace (tADA off Mainnet); any other unit as written. */
export function unitLabel(unit: string, network: string): string {
  if (!isLovelace(unit)) return unit;
  return network.toLowerCase() === 'mainnet' ? 'ADA' : 'tADA';
}

/**
 * An on-chain amount and its unit, for display. Lovelace becomes ADA (tADA off Mainnet).
 * Other tokens are scaled only when the metadata states their decimals; otherwise the
 * amount stays in base units, since the registry does not know the token. BigInt, because
 * amounts can exceed Number.MAX_SAFE_INTEGER.
 */
export function formatAmount(
  amount: string,
  unit: string,
  network: string,
  decimals?: number,
): { amount: string; unit: string; inBaseUnits: boolean } {
  const places = decimals ?? (isLovelace(unit) ? 6 : 0);
  const label = unitLabel(unit, network);
  // No decimals known for a token: the amount is in its smallest unit, and says so.
  const inBaseUnits = decimals === undefined && !isLovelace(unit);
  if (!/^\d+$/.test(amount)) return { amount, unit: label, inBaseUnits };

  const value = BigInt(amount);
  const base = BigInt(10) ** BigInt(places);
  const whole = (value / base).toLocaleString('en-US');
  const fraction = (value % base).toString().padStart(places, '0').replace(/0+$/, '');
  return {
    amount: fraction && places > 0 ? `${whole}.${fraction}` : whole,
    unit: label,
    inBaseUnits,
  };
}

// The generated type of AgentPricing collapses to `unknown` (a nullable union), so it is
// narrowed here against the API's own output schema.
export const agentPricingSchema = z.discriminatedUnion('pricingType', [
  z.object({
    pricingType: z.literal('Fixed'),
    FixedPricing: z.object({
      Amounts: z.array(z.object({ amount: z.string(), unit: z.string() })),
    }),
  }),
  z.object({ pricingType: z.literal('Free') }),
  z.object({ pricingType: z.literal('Dynamic') }),
]);
