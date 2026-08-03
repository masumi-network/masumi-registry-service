import { registryEntryRepository } from '@/repositories/registry-entry';
import {
  queryRegistrySchemaInput,
  refreshRegistryEntrySchemaInput,
  registryDiffSchemaInput,
  searchRegistrySchemaInput,
} from '@/routes/api/registry-entry/schemas';
import { $Enums, Status } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { cardanoRegistryService } from '@/services/cardano-registry';
import { healthCheckService } from '@/services/health-check';
import { normalizeRegistryEntrySearchQuery } from '@/utils/registry-entry-search-text';
import {
  getAgentVersion,
  getAgentVersionRoot,
  getPolicyId,
  isV2Policy,
} from '@/utils/agent-version';

type VersionedEntry = {
  assetIdentifier: string;
  RegistrySource?: { policyId: string | null } | null;
};

type WithVersionLinks<T> = T & {
  supersedesAgentIdentifier: string | null;
  supersededByAgentIdentifier: string | null;
};

// Resolves an assetIdentifier to the latest stored version of the same V2 agent
// (same version-root, highest version). Returns the input unchanged for
// non-V2-policy assets or when no sibling versions are stored, so callers can
// pass it through unconditionally.
async function resolveLatestAssetIdentifier(
  assetIdentifier: string,
  network: $Enums.Network
): Promise<string> {
  if (!isV2Policy(getPolicyId(assetIdentifier))) {
    return assetIdentifier;
  }
  const siblings =
    await registryEntryRepository.findVersionSiblingAssetIdentifiers({
      roots: [getAgentVersionRoot(assetIdentifier)],
      network,
    });
  if (siblings.length === 0) {
    return assetIdentifier;
  }
  return siblings.reduce((latest, candidate) =>
    getAgentVersion(candidate) > getAgentVersion(latest) ? candidate : latest
  );
}

// Attaches live-computed version links to each entry: supersedesAgentIdentifier
// (the next-lower stored version) and supersededByAgentIdentifier (the
// next-higher stored version). Only V2-policy assets carry the version postfix;
// every other entry gets nulls. One batched sibling query covers the whole page.
async function attachVersionLinks<T extends VersionedEntry>(
  entries: T[],
  network: $Enums.Network
): Promise<WithVersionLinks<T>[]> {
  const withNulls = (entry: T): WithVersionLinks<T> => ({
    ...entry,
    supersedesAgentIdentifier: null,
    supersededByAgentIdentifier: null,
  });

  const v2Entries = entries.filter((entry) =>
    isV2Policy(entry.RegistrySource?.policyId)
  );
  if (v2Entries.length === 0) {
    return entries.map(withNulls);
  }

  const roots = [
    ...new Set(
      v2Entries.map((entry) => getAgentVersionRoot(entry.assetIdentifier))
    ),
  ];
  const siblingIds =
    await registryEntryRepository.findVersionSiblingAssetIdentifiers({
      roots,
      network,
    });

  // Group every stored version by its root, sorted ascending by version.
  const siblingsByRoot = new Map<string, { id: string; version: number }[]>();
  for (const id of siblingIds) {
    const root = getAgentVersionRoot(id);
    const group = siblingsByRoot.get(root) ?? [];
    group.push({ id, version: getAgentVersion(id) });
    siblingsByRoot.set(root, group);
  }
  for (const group of siblingsByRoot.values()) {
    group.sort((a, b) => a.version - b.version);
  }

  return entries.map((entry) => {
    if (!isV2Policy(entry.RegistrySource?.policyId)) {
      return withNulls(entry);
    }
    const version = getAgentVersion(entry.assetIdentifier);
    const group = siblingsByRoot.get(
      getAgentVersionRoot(entry.assetIdentifier)
    );
    const lower = group?.filter((s) => s.version < version) ?? [];
    const higher = group?.filter((s) => s.version > version) ?? [];
    return {
      ...entry,
      supersedesAgentIdentifier: lower.length
        ? lower[lower.length - 1].id
        : null,
      supersededByAgentIdentifier: higher.length ? higher[0].id : null,
    };
  });
}

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

  // Opt-in: resolve the exact-match assetIdentifier filter to the latest version
  // of the same V2 agent before querying, so an old identifier returns the
  // current entry. The plain assetIdentifier filter stays an exact match.
  let assetIdentifier = input.filter?.assetIdentifier;
  if (input.filter?.resolveToLatestVersion && assetIdentifier) {
    assetIdentifier = await resolveLatestAssetIdentifier(
      assetIdentifier,
      input.network
    );
  }

  while (healthCheckedEntries.length < input.limit) {
    const sort = input.sort ?? 'createdAt-desc';
    const registryEntries = searchQuery
      ? await registryEntryRepository.searchRegistryEntries({
          capability,
          allowedPaymentTypes,
          allowedStatuses,
          policyId: input.filter?.policyId,
          assetIdentifier,
          tags: input.filter?.tags,
          cursorId: currentCursorId,
          limit: input.limit * 2,
          network: input.network,
          searchQuery,
          sort,
        })
      : await registryEntryRepository.getRegistryEntry({
          capability,
          allowedPaymentTypes,
          allowedStatuses,
          policyId: input.filter?.policyId,
          assetIdentifier,
          tags: input.filter?.tags,
          cursorId: currentCursorId,
          limit: input.limit * 2,
          network: input.network,
          sort,
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

  return attachVersionLinks(healthCheckedEntries, input.network);
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

async function refreshRegistryEntry(
  input: z.infer<typeof refreshRegistryEntrySchemaInput>
) {
  await cardanoRegistryService.updateLatestCardanoRegistryEntries();

  const registryEntry =
    await registryEntryRepository.getRegistryEntryByIdentifier(input);
  if (!registryEntry) {
    return null;
  }

  if (registryEntry.status === Status.Deregistered) {
    const [withLinks] = await attachVersionLinks(
      [registryEntry],
      input.network
    );
    return withLinks;
  }

  const [updatedEntry] =
    await healthCheckService.checkVerifyAndUpdateRegistryEntries({
      registryEntries: [registryEntry],
      minHealthCheckDate: new Date(),
    });

  const [withLinks] = await attachVersionLinks(
    [updatedEntry ?? registryEntry],
    input.network
  );
  return withLinks;
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

async function getRegistryEntrySpec(params: {
  network: $Enums.Network;
  agentIdentifier: string;
}) {
  return registryEntryRepository.getRegistryEntrySpecByIdentifier(params);
}

export const registryEntryService = {
  getRegistryEntries,
  searchRegistryEntries,
  refreshRegistryEntry,
  getRegistryEntrySpec,
  getRegistryDiffEntries,
};
