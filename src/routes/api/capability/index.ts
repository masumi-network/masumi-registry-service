import { capabilityService } from '@/services/capability';
import { tokenCreditService } from '@/services/token-credit';
import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';

export const capabilitySchemaInput = z.object({
  limit: z.number({ coerce: true }).min(1).max(100).default(10),
  cursorId: z.string().optional(),
});

export const capabilitySchemaOutput = z
  .object({
    capabilities: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        version: z.string(),
      })
    ),
  })
  .openapi('Capability');

export const capabilityGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: capabilitySchemaInput,
  output: capabilitySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof capabilitySchemaInput>;
    options: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    const tokenCost = 0;
    //TODO update cost model
    await tokenCreditService.handleTokenCredits(
      options,
      tokenCost,
      'query for capability with limit: ' + input.limit
    );
    const data = await capabilityService.getCapabilities(
      input.cursorId,
      input.limit
    );
    return { capabilities: data };
  },
});
