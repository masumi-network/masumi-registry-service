import { $Enums } from '@prisma/client';
import { registryMetricsRepository } from '@/repositories/registry-entry/registry-metrics.repository';
import { getAgentVersionRoot, isV2Policy } from '@/utils/agent-version';

// Network-wide ranking inputs change only with new purchases or registrations,
// so ranked pages within this window share one load.
const RANKING_METRICS_TTL_MS = 60 * 1000;

export type NetworkRankingMetrics = {
  distinctBuyers: Map<string, number>;
  // Earliest first-seen date per V2 version root.
  lineageStarts: Map<string, Date>;
};

const metricsCache = new Map<
  $Enums.Network,
  { expiresAt: number; metrics: Promise<NetworkRankingMetrics> }
>();

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
  const [distinctBuyers, entries] = await Promise.all([
    registryMetricsRepository.countDistinctBuyers(network),
    registryMetricsRepository.findEntryCreatedAts(network),
  ]);
  return { distinctBuyers, lineageStarts: lineageStartsByRoot(entries) };
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
