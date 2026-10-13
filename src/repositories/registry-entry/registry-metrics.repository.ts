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

// Distinct (agent, funded buyer) pairs across the network (unattributed
// withdrawals and unverified buyers excluded). The caller groups agents.
async function findBuyerPairs(
  network: Network
): Promise<{ agentIdentifier: string; buyerKeyHash: string }[]> {
  const pairs = await prisma.agentSuccessfulPurchase.groupBy({
    by: ['agentIdentifier', 'buyerKeyHash'],
    where: {
      network,
      agentIdentifier: { not: null },
      buyerKeyHash: { not: null },
    },
  });
  return pairs.flatMap(({ agentIdentifier, buyerKeyHash }) =>
    agentIdentifier == null || buyerKeyHash == null
      ? []
      : [{ agentIdentifier, buyerKeyHash }]
  );
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
  findBuyerPairs,
  findEntryCreatedAts,
};
