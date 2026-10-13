import { creditTokenRepository } from '@/repositories/creditTokens';
async function handleTokenCredits(
  {
    id,
    accumulatedUsageCredits,
    maxUsageCredits,
    usageLimited,
  }: {
    id: string;
    accumulatedUsageCredits: number;
    maxUsageCredits: number | null;
    usageLimited: boolean;
  },
  tokenCreditCost: number,
  note: string | null
) {
  if (
    usageLimited &&
    tokenCreditCost + accumulatedUsageCredits > (maxUsageCredits ?? 0)
  ) {
    throw new Error('Not enough tokens to call endpoint for id: ' + id);
  }
  await creditTokenRepository.handleCreditUsage(id, tokenCreditCost, note);
}

export const tokenCreditService = { handleTokenCredits };
