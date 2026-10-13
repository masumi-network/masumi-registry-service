import { Network } from '@prisma/client';
import { ez } from 'express-zod-api';
import { agentPurchaseService } from '@/services/agent-purchase';
import { PURCHASE_HISTORY_INTERVALS } from '@/services/agent-purchase/agent-purchase.service';
import { tokenCreditService } from '@/services/token-credit';
import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';

export const registryEntryPurchasesSchemaInput = z.object({
  network: z.nativeEnum(Network),
  agentIdentifier: z.string().min(1).max(250),
  interval: z
    .enum(PURCHASE_HISTORY_INTERVALS)
    .default('Day')
    .describe('UTC bucket size of the series. Weeks start on Monday.'),
  from: ez
    .dateIn()
    .optional()
    .describe('Series start (inclusive). Defaults to 90 days before `to`.'),
  to: ez
    .dateIn()
    .optional()
    .describe('Series end (exclusive). Defaults to now. Max range 366 days.'),
});

// Base units (lovelace, token base units) as a digit string.
const purchaseAmountSchema = z.object({
  unit: z.string(),
  quantity: z.string(),
});

export const registryEntryPurchasesSchemaOutput = z
  .object({
    network: z.nativeEnum(Network),
    agentIdentifier: z.string(),
    interval: z.enum(PURCHASE_HISTORY_INTERVALS),
    from: z.date(),
    to: z.date(),
    totals: z.object({
      purchases: z.number(),
      distinctBuyers: z.number(),
      amounts: z.array(purchaseAmountSchema),
    }),
    // Sparse: buckets without purchases are omitted.
    series: z.array(
      z.object({
        bucketStart: z.date(),
        purchases: z.number(),
        amounts: z.array(purchaseAmountSchema),
      })
    ),
  })
  .openapi('RegistryEntryPurchases');

const toAmountOutput = (amount: { unit: string; quantity: bigint }) => ({
  unit: amount.unit,
  quantity: amount.quantity.toString(),
});

// Purchase totals and history of one agent, from seller withdrawals the
// registry indexes on the masumi payment contracts.
export const registryEntryPurchasesGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: registryEntryPurchasesSchemaInput,
  output: registryEntryPurchasesSchemaOutput,
  handler: async ({
    input,
    ctx,
  }: {
    input: z.infer<typeof registryEntryPurchasesSchemaInput>;
    ctx: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    await tokenCreditService.handleTokenCredits(
      ctx,
      0,
      'purchases for: ' + input.agentIdentifier
    );
    const history = await agentPurchaseService.getPurchaseHistory(input);
    return registryEntryPurchasesSchemaOutput.parse({
      ...history,
      totals: {
        ...history.totals,
        amounts: history.totals.amounts.map(toAmountOutput),
      },
      series: history.series.map((bucket) => ({
        ...bucket,
        amounts: bucket.amounts.map(toAmountOutput),
      })),
    });
  },
});
