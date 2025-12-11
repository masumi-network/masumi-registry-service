import { registryEntryRepository } from '@/repositories/registry-entry';
import { queryRegistrySchemaInput } from '@/routes/api/registry-entry';
import { $Enums, Status } from '@prisma/client';
import { z } from 'zod';
import { cardanoRegistryService } from '@/services/cardano-registry';
import { healthCheckService } from '@/services/health-check';

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

async function getRegistryEntries(
  input: z.infer<typeof queryRegistrySchemaInput>
) {
  await cardanoRegistryService.updateLatestCardanoRegistryEntries(
    input.minRegistryDate
  );

  const healthCheckedEntries = [];
  let currentCursorId = input.cursorId;
  const { allowedPaymentTypes, allowedStatuses, capability } = getFilterParams(
    input.filter
  );

  while (healthCheckedEntries.length < input.limit) {
    const registryEntries = await registryEntryRepository.getRegistryEntry(
      capability,
      allowedPaymentTypes,
      allowedStatuses,
      input.filter?.policyId,
      input.filter?.assetIdentifier,
      input.filter?.tags,
      currentCursorId,
      input.limit,
      input.network
    );

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

export const registryEntryService = { getRegistryEntries };
