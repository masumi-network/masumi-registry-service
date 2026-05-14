import { a2aRegistryEntryRepository } from '@/repositories/a2a-registry-entry';
import {
  queryA2ARegistrySchemaInput,
  a2aRegistryDiffSchemaInput,
  searchA2ARegistrySchemaInput,
} from '@/routes/api/a2a-registry-entry/schemas';
import { $Enums, Status } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { healthCheckService } from '@/services/health-check';
import { normalizeRegistryEntrySearchQuery } from '@/utils/registry-entry-search-text';

function getFilterParams(
  filter: z.infer<typeof queryA2ARegistrySchemaInput>['filter']
) {
  const allowedStatuses: $Enums.Status[] =
    filter && filter.status && filter.status.length > 0
      ? filter.status
      : [Status.Online];

  return { allowedStatuses };
}

async function getHealthCheckedA2AEntries(
  input:
    | z.infer<typeof queryA2ARegistrySchemaInput>
    | z.infer<typeof searchA2ARegistrySchemaInput>,
  searchQuery?: string
) {
  const healthCheckedEntries: Awaited<
    ReturnType<typeof healthCheckService.checkVerifyAndUpdateA2ARegistryEntries>
  > = [];
  let currentCursorId = input.cursorId;
  const { allowedStatuses } = getFilterParams(input.filter);

  while (healthCheckedEntries.length < input.limit) {
    const a2aEntries = searchQuery
      ? await a2aRegistryEntryRepository.searchA2ARegistryEntries({
          allowedStatuses,
          policyId: input.filter?.policyId,
          assetIdentifier: input.filter?.assetIdentifier,
          tags: input.filter?.tags,
          cursorId: currentCursorId,
          limit: input.limit * 2,
          network: input.network,
          searchQuery,
        })
      : await a2aRegistryEntryRepository.getA2ARegistryEntries({
          allowedStatuses,
          policyId: input.filter?.policyId,
          assetIdentifier: input.filter?.assetIdentifier,
          tags: input.filter?.tags,
          cursorId: currentCursorId,
          limit: input.limit * 2,
          network: input.network,
        });

    const result =
      await healthCheckService.checkVerifyAndUpdateA2ARegistryEntries({
        a2aEntries,
        minHealthCheckDate: input.minHealthCheckDate,
      });

    healthCheckedEntries.push(...result);

    if (a2aEntries.length < input.limit * 2) break;
    currentCursorId = a2aEntries[a2aEntries.length - 1].id;
  }

  return healthCheckedEntries;
}

async function getA2ARegistryEntries(
  input: z.infer<typeof queryA2ARegistrySchemaInput>
) {
  return getHealthCheckedA2AEntries(input);
}

async function searchA2ARegistryEntries(
  input: z.infer<typeof searchA2ARegistrySchemaInput>
) {
  return getHealthCheckedA2AEntries(
    input,
    normalizeRegistryEntrySearchQuery(input.query)
  );
}

async function getA2ARegistryDiffEntries(
  input: z.infer<typeof a2aRegistryDiffSchemaInput>
) {
  return a2aRegistryEntryRepository.getA2ARegistryDiffEntries(
    input.statusUpdatedAfter,
    input.cursorId,
    input.limit,
    input.network,
    input.policyId
  );
}

export const a2aRegistryEntryService = {
  getA2ARegistryEntries,
  searchA2ARegistryEntries,
  getA2ARegistryDiffEntries,
};
