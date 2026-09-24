import { prisma } from '@/utils/db';
import { Network, Prisma } from '@prisma/client';

const fixedAmountsSelect = {
  select: {
    FixedPricing: {
      select: { Amounts: { select: { unit: true, amount: true } } },
    },
  },
} as const;

// Lean projection of every entry matching a filter: just what ranking needs.
// ponytail: loads the whole filtered set to sort in memory (Prisma cannot order
// by a ratio or a computed score). Fine at registry scale (~thousands per
// network); move score/uptime into indexed columns if that grows 10x+.
async function findRankingCandidates(where: Prisma.RegistryEntryWhereInput) {
  return prisma.registryEntry.findMany({
    where,
    select: {
      id: true,
      assetIdentifier: true,
      name: true,
      tags: true,
      createdAt: true,
      uptimeEwma: true,
      uptimeCount: true,
      uptimeCheckCount: true,
      RegistrySource: { select: { policyId: true } },
      AgentPricing: fixedAmountsSelect,
      SupportedPaymentSources: { select: { Pricing: fixedAmountsSelect } },
    },
  });
}

async function countSuccessfulPurchases(params: {
  network: Network;
  agentIdentifiers: string[];
}): Promise<Map<string, number>> {
  if (params.agentIdentifiers.length === 0) return new Map();
  const rows = await prisma.agentSuccessfulPurchase.groupBy({
    by: ['agentIdentifier'],
    where: {
      network: params.network,
      agentIdentifier: { in: params.agentIdentifiers },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.agentIdentifier, row._count._all]));
}

// createdAt of every stored version under the given V2 version roots, so the
// caller can take the earliest per root as the lineage start.
async function findVersionCreatedAts(params: {
  roots: string[];
  network: Network;
}): Promise<{ assetIdentifier: string; createdAt: Date }[]> {
  if (params.roots.length === 0) return [];
  return prisma.registryEntry.findMany({
    where: {
      OR: params.roots.map((root) => ({
        assetIdentifier: { startsWith: root },
      })),
      RegistrySource: { network: params.network },
    },
    select: { assetIdentifier: true, createdAt: true },
  });
}

export const registryMetricsRepository = {
  findRankingCandidates,
  countSuccessfulPurchases,
  findVersionCreatedAts,
};
