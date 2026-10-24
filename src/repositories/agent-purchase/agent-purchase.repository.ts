import { prisma } from '@/utils/db';
import { Network } from '@prisma/client';

type AgentScope = { network: Network; agentIdentifier: string };

// All-time totals of one agent's attributed purchases: count, distinct funded
// buyers, and paid amount per asset unit.
async function getPurchaseTotals({ network, agentIdentifier }: AgentScope) {
  const [purchases, buyers, amounts] = await Promise.all([
    prisma.agentSuccessfulPurchase.count({
      where: { network, agentIdentifier },
    }),
    prisma.agentSuccessfulPurchase.groupBy({
      by: ['buyerKeyHash'],
      where: { network, agentIdentifier, buyerKeyHash: { not: null } },
    }),
    prisma.agentPurchaseAmount.groupBy({
      by: ['unit'],
      where: { Purchase: { network, agentIdentifier } },
      _sum: { quantity: true },
      orderBy: { unit: 'asc' },
    }),
  ]);
  return {
    purchases,
    distinctBuyers: buyers.length,
    amounts: amounts.map((amount) => ({
      unit: amount.unit,
      quantity: amount._sum.quantity ?? 0n,
    })),
  };
}

// One page of an agent's purchases with a block time in [from, to), oldest
// first; pass the last row's id as `cursorId` for the next page.
async function findPurchasesInRange(
  params: AgentScope & {
    from: Date;
    to: Date;
    take: number;
    cursorId?: string;
  }
) {
  return prisma.agentSuccessfulPurchase.findMany({
    where: {
      network: params.network,
      agentIdentifier: params.agentIdentifier,
      blockTime: { gte: params.from, lt: params.to },
    },
    select: {
      id: true,
      blockTime: true,
      Amounts: { select: { unit: true, quantity: true } },
    },
    orderBy: [{ blockTime: 'asc' }, { id: 'asc' }],
    take: params.take,
    ...(params.cursorId == null
      ? {}
      : { cursor: { id: params.cursorId }, skip: 1 }),
  });
}

export const agentPurchaseRepository = {
  getPurchaseTotals,
  findPurchasesInRange,
};
