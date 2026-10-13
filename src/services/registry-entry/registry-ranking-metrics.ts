import { $Enums } from '@prisma/client';
import { registryMetricsRepository } from '@/repositories/registry-entry/registry-metrics.repository';
import {
  getAgentVersionRoot,
  getPolicyId,
  isV2Policy,
} from '@/utils/agent-version';

// Network-wide ranking inputs change only with new purchases or registrations,
// so ranked pages within this window share one load.
const RANKING_METRICS_TTL_MS = 60 * 1000;

export type NetworkRankingMetrics = {
  // Keyed by lineageKey: all versions of a V2 agent share one count.
  distinctBuyers: Map<string, number>;
  // Earliest first-seen date per V2 version root.
  lineageStarts: Map<string, Date>;
};

const metricsCache = new Map<
  $Enums.Network,
  { expiresAt: number; metrics: Promise<NetworkRankingMetrics> }
>();

// Identity that reputation follows: the version root for a V2 agent (an
// update mints a new version), the asset itself for V1.
export function lineageKey(assetIdentifier: string): string {
  return isV2Policy(getPolicyId(assetIdentifier))
    ? getAgentVersionRoot(assetIdentifier)
    : assetIdentifier;
}

// Distinct buyers per lineage: a buyer of several versions counts once.
export function distinctBuyersByLineage(
  pairs: readonly { agentIdentifier: string; buyerKeyHash: string }[]
): Map<string, number> {
  const buyers = new Map<string, Set<string>>();
  for (const { agentIdentifier, buyerKeyHash } of pairs) {
    const key = lineageKey(agentIdentifier);
    const set = buyers.get(key) ?? new Set<string>();
    set.add(buyerKeyHash);
    buyers.set(key, set);
  }
  return new Map([...buyers].map(([key, set]) => [key, set.size]));
}

// Earliest createdAt per exact V2 version root; V1 entries have no lineage.
export function lineageStartsByRoot(
  entries: readonly {
    assetIdentifier: string;
    createdAt: Date;
    RegistrySource: { policyId: string | null };
  }[]
): Map<string, Date> {
  const starts = new Map<string, Date>();
  for (const entry of entries) {
    if (!isV2Policy(entry.RegistrySource.policyId)) continue;
    const root = getAgentVersionRoot(entry.assetIdentifier);
    const current = starts.get(root);
    if (current == null || entry.createdAt < current) {
      starts.set(root, entry.createdAt);
    }
  }
  return starts;
}

async function loadNetworkRankingMetrics(
  network: $Enums.Network
): Promise<NetworkRankingMetrics> {
  const [buyerPairs, entries] = await Promise.all([
    registryMetricsRepository.findBuyerPairs(network),
    registryMetricsRepository.findEntryCreatedAts(network),
  ]);
  return {
    distinctBuyers: distinctBuyersByLineage(buyerPairs),
    lineageStarts: lineageStartsByRoot(entries),
  };
}

export function getNetworkRankingMetrics(
  network: $Enums.Network,
  now: number = Date.now()
): Promise<NetworkRankingMetrics> {
  const cached = metricsCache.get(network);
  if (cached != null && cached.expiresAt > now) return cached.metrics;
  const metrics = loadNetworkRankingMetrics(network);
  metricsCache.set(network, {
    expiresAt: now + RANKING_METRICS_TTL_MS,
    metrics,
  });
  // A failed load must not be served from the cache.
  metrics.catch(() => {
    if (metricsCache.get(network)?.metrics === metrics) {
      metricsCache.delete(network);
    }
  });
  return metrics;
}

export function clearRankingMetricsCache() {
  metricsCache.clear();
}
