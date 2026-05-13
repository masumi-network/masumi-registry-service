import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { tokenCreditService } from '@/services/token-credit';
import { registryEntryService } from '@/services/registry-entry';
import {
  queryRegistrySchemaInput,
  queryRegistrySchemaOutput,
  refreshRegistryEntrySchemaInput,
  refreshRegistryEntrySchemaOutput,
  searchRegistrySchemaInput,
  serializeRegistryEntries,
} from './schemas';
import createHttpError from 'http-errors';

export * from './schemas';

export const queryRegistryEntryPost = authenticatedEndpointFactory.build<
  typeof queryRegistrySchemaOutput,
  typeof queryRegistrySchemaInput
>({
  method: 'post',
  input: queryRegistrySchemaInput,
  output: queryRegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof queryRegistrySchemaInput>;
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
      'query for: ' + input.filter?.capability?.name
    );
    const data = await registryEntryService.getRegistryEntries(input);

    const entries = serializeRegistryEntries(data, input.limit);
    return queryRegistrySchemaOutput.parse({ entries });
  },
});

export const searchRegistryEntryPost = authenticatedEndpointFactory.build<
  typeof queryRegistrySchemaOutput,
  typeof searchRegistrySchemaInput
>({
  method: 'post',
  input: searchRegistrySchemaInput,
  output: queryRegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof searchRegistrySchemaInput>;
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
      'search registry entries: ' + input.query
    );

    const data = await registryEntryService.searchRegistryEntries(input);
    const entries = serializeRegistryEntries(data, input.limit);

    return queryRegistrySchemaOutput.parse({ entries });
  },
});

export const refreshRegistryEntryPost = authenticatedEndpointFactory.build<
  typeof refreshRegistryEntrySchemaOutput,
  typeof refreshRegistryEntrySchemaInput
>({
  method: 'post',
  input: refreshRegistryEntrySchemaInput,
  output: refreshRegistryEntrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof refreshRegistryEntrySchemaInput>;
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
      'refresh registry entry: ' + input.agentIdentifier
    );

    const data = await registryEntryService.refreshRegistryEntry(input);
    if (!data) {
      throw createHttpError(404, 'Registry entry not found');
    }

    const [entry] = serializeRegistryEntries([data], 1);
    return refreshRegistryEntrySchemaOutput.parse({ entry });
  },
});
