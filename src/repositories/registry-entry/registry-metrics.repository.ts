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

// Distinct funded buyers per agent across the network (unattributed
// withdrawals and unverified buyers excluded).
async function countDistinctBuyers(
  network: Network
): Promise<Map<string, number>> {
  const pairs = await prisma.agentSuccessfulPurchase.groupBy({
    by: ['agentIdentifier', 'buyerKeyHash'],
    where: {
      network,
      agentIdentifier: { not: null },
      buyerKeyHash: { not: null },
    },
  });
  const counts = new Map<string, number>();
  for (const { agentIdentifier } of pairs) {
    if (agentIdentifier == null) continue;
    counts.set(agentIdentifier, (counts.get(agentIdentifier) ?? 0) + 1);
  }
  return counts;
}

// First-seen date and policy of every entry on the network, so the caller can
// group V2 versions by their exact version root.
async function findEntryCreatedAts(network: Network) {
  return prisma.registryEntry.findMany({
    where: { RegistrySource: { network } },
    select: {
      assetIdentifier: true,
      createdAt: true,
      RegistrySource: { select: { policyId: true } },
    },
  });
}

export const registryMetricsRepository = {
  findRankingCandidates,
  countDistinctBuyers,
  findEntryCreatedAts,
};
