import { prisma } from '@/utils/db';

async function handleCreditUsage(
  id: string,
  cost: number,
  note: string | null
) {
  await prisma.$transaction(
    async (transaction) => {
      const result = await transaction.apiKey.findUnique({ where: { id: id } });
      if (!result) {
        throw Error('Invalid id: ' + id);
      }
      if (
        result.usageLimited &&
        result.accumulatedUsageCredits + cost > (result.maxUsageCredits ?? 0)
      ) {
        throw new Error('Not enough tokens to handleCreditUsage for id: ' + id);
      }
      await prisma.apiKey.update({
        where: { id: id },
        data: {
          accumulatedUsageCredits: result.accumulatedUsageCredits + cost,
          Usage: { create: { usedCredits: cost, note: note } },
        },
      });
    },
    { isolationLevel: 'ReadCommitted' }
  );

  return { status: 'UP' };
}

export const creditTokenRepository = { handleCreditUsage };
