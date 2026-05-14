import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { tokenCreditService } from '@/services/token-credit';
import { a2aRegistryEntryService } from '@/services/a2a-registry-entry';
import {
  queryA2ARegistrySchemaInput,
  queryA2ARegistrySchemaOutput,
  searchA2ARegistrySchemaInput,
  a2aRegistryDiffSchemaInput,
  serializeA2ARegistryEntries,
} from './schemas';

export * from './schemas';

export const queryA2ARegistryEntryPost = authenticatedEndpointFactory.build<
  typeof queryA2ARegistrySchemaOutput,
  typeof queryA2ARegistrySchemaInput
>({
  method: 'post',
  input: queryA2ARegistrySchemaInput,
  output: queryA2ARegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof queryA2ARegistrySchemaInput>;
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
      'query A2A registry entries'
    );
    const data = await a2aRegistryEntryService.getA2ARegistryEntries(input);
    const entries = serializeA2ARegistryEntries(data, input.limit);
    return queryA2ARegistrySchemaOutput.parse({ entries });
  },
});

export const searchA2ARegistryEntryPost = authenticatedEndpointFactory.build<
  typeof queryA2ARegistrySchemaOutput,
  typeof searchA2ARegistrySchemaInput
>({
  method: 'post',
  input: searchA2ARegistrySchemaInput,
  output: queryA2ARegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof searchA2ARegistrySchemaInput>;
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
      'search A2A registry entries: ' + input.query
    );
    const data = await a2aRegistryEntryService.searchA2ARegistryEntries(input);
    const entries = serializeA2ARegistryEntries(data, input.limit);
    return queryA2ARegistrySchemaOutput.parse({ entries });
  },
});

export const a2aRegistryDiffPost = authenticatedEndpointFactory.build<
  typeof queryA2ARegistrySchemaOutput,
  typeof a2aRegistryDiffSchemaInput
>({
  method: 'post',
  input: a2aRegistryDiffSchemaInput,
  output: queryA2ARegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof a2aRegistryDiffSchemaInput>;
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
      'a2a registry diff since: ' + input.statusUpdatedAfter.toISOString()
    );
    const data = await a2aRegistryEntryService.getA2ARegistryDiffEntries(input);
    const entries = serializeA2ARegistryEntries(data, input.limit);
    return queryA2ARegistrySchemaOutput.parse({ entries });
  },
});
