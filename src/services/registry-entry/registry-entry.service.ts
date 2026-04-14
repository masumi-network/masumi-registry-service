import { registryEntryRepository } from '@/repositories/registry-entry';
import {
  queryRegistrySchemaInput,
  registryDiffSchemaInput,
  searchRegistrySchemaInput,
} from '@/routes/api/registry-entry/schemas';
import { $Enums, Status } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { cardanoRegistryService } from '@/services/cardano-registry';
import { healthCheckService } from '@/services/health-check';
import { normalizeRegistryEntrySearchQuery } from '@/utils/registry-entry-search-text';

function getFilterParams(
  filter: z.infer<typeof queryRegistrySchemaInput>['filter']
) {
  const allowedPaymentTypes: $Enums.PaymentType[] | undefined =
    filter && filter.paymentTypes && filter.paymentTypes.length > 0
      ? filter.paymentTypes
      : undefined;

  const allowedStatuses: $Enums.Status[] =
    filter && filter.status && filter.status.length > 0
      ? filter.status
      : [Status.Online];

  const capability = filter?.capability
    ? { name: filter.capability.name, version: filter.capability.version }
    : undefined;

  return { allowedPaymentTypes, allowedStatuses, capability };
}

async function getHealthCheckedRegistryEntries(
  input:
    | z.infer<typeof queryRegistrySchemaInput>
    | z.infer<typeof searchRegistrySchemaInput>,
  searchQuery?: string
) {
  await cardanoRegistryService.updateLatestCardanoRegistryEntries();

  const healthCheckedEntries: Awaited<
    ReturnType<typeof healthCheckService.checkVerifyAndUpdateRegistryEntries>
  > = [];
  let currentCursorId = input.cursorId;
  const { allowedPaymentTypes, allowedStatuses, capability } = getFilterParams(
    input.filter
  );

  while (healthCheckedEntries.length < input.limit) {
    const registryEntries = searchQuery
      ? await registryEntryRepository.searchRegistryEntries({
          capability,
          allowedPaymentTypes,
          allowedStatuses,
          policyId: input.filter?.policyId,
          assetIdentifier: input.filter?.assetIdentifier,
          tags: input.filter?.tags,
          cursorId: currentCursorId,
          limit: input.limit * 2,
          network: input.network,
          searchQuery,
        })
      : await registryEntryRepository.getRegistryEntry({
          capability,
          allowedPaymentTypes,
          allowedStatuses,
          policyId: input.filter?.policyId,
          assetIdentifier: input.filter?.assetIdentifier,
          tags: input.filter?.tags,
          cursorId: currentCursorId,
          limit: input.limit * 2,
          network: input.network,
        });

    const result = await healthCheckService.checkVerifyAndUpdateRegistryEntries(
      {
        registryEntries,
        minHealthCheckDate: input.minHealthCheckDate,
      }
    );

    healthCheckedEntries.push(...result);

    if (registryEntries.length < input.limit * 2) break;
    currentCursorId = registryEntries[registryEntries.length - 1].id;
  }

  return healthCheckedEntries;
}

async function getRegistryEntries(
  input: z.infer<typeof queryRegistrySchemaInput>
) {
  return getHealthCheckedRegistryEntries(input);
}

async function searchRegistryEntries(
  input: z.infer<typeof searchRegistrySchemaInput>
) {
  return getHealthCheckedRegistryEntries(
    input,
    normalizeRegistryEntrySearchQuery(input.query)
  );
}

async function getRegistryDiffEntries(
  input: z.infer<typeof registryDiffSchemaInput>
) {
  return registryEntryRepository.getRegistryDiffEntries(
    input.statusUpdatedAfter,
    input.cursorId,
    input.limit,
    input.network,
    input.policyId
  );
}

export const registryEntryService = {
  getRegistryEntries,
  searchRegistryEntries,
  getRegistryDiffEntries,
};
