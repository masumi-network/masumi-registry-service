import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { tokenCreditService } from '@/services/token-credit';
import { registryEntryService } from '@/services/registry-entry';
import {
  registryDiffSchemaInput,
  queryRegistrySchemaOutput,
  serializeRegistryEntries,
} from '@/routes/api/registry-entry/schemas';

export const registryDiffPost = authenticatedEndpointFactory.build<
  typeof queryRegistrySchemaOutput,
  typeof registryDiffSchemaInput
>({
  method: 'post',
  input: registryDiffSchemaInput,
  output: queryRegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof registryDiffSchemaInput>;
    options: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    const tokenCost = 0;
    await tokenCreditService.handleTokenCredits(
      options,
      tokenCost,
      'registry diff since: ' + input.statusUpdatedAfter.toISOString()
    );
    const data = await registryEntryService.getRegistryDiffEntries(input);

    const entries = serializeRegistryEntries(data, input.limit);
    return queryRegistrySchemaOutput.parse({ entries });
  },
});
