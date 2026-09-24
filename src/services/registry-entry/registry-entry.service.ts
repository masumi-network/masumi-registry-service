import { registryEntryRepository } from '@/repositories/registry-entry';
import { registryMetricsRepository } from '@/repositories/registry-entry/registry-metrics.repository';
import {
  queryRegistrySchemaInput,
  refreshRegistryEntrySchemaInput,
  registryDiffSchemaInput,
  RegistryEntrySortBy,
  searchRegistrySchemaInput,
} from '@/routes/api/registry-entry/schemas';
import { $Enums, Prisma, Status } from '@prisma/client';
import { CONFIG } from '@/utils/config';
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
import {
  buildRegistryEntryWhere,
  meetsMinUptimePercent,
} from './registry-filter';
import {
  computeRankings,
  lowestPriceInUnit,
  sliceFromCursor,
  sortRankingInputs,
} from './registry-ranking';

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

// Earliest first-seen date per V2 version root, for lineage age.
async function getLineageStarts(
  assetIdentifiers: { assetIdentifier: string; policyId: string | null }[],
  network: $Enums.Network
): Promise<Map<string, Date>> {
  const roots = [
    ...new Set(
      assetIdentifiers
        .filter((entry) => isV2Policy(entry.policyId))
        .map((entry) => getAgentVersionRoot(entry.assetIdentifier))
    ),
  ];
  const versions = await registryMetricsRepository.findVersionCreatedAts({
    roots,
    network,
  });
  const starts = new Map<string, Date>();
  for (const version of versions) {
    const root = getAgentVersionRoot(version.assetIdentifier);
    const current = starts.get(root);
    if (current == null || version.createdAt < current) {
      starts.set(root, version.createdAt);
    }
  }
  return starts;
}

// Explicit sortBy: rank the whole filtered set, then health-check pages in
// ranked order. The order comes from here, never from the client.
async function getRankedRegistryEntries(params: {
  input:
    | z.infer<typeof queryRegistrySchemaInput>
    | z.infer<typeof searchRegistrySchemaInput>;
  where: Prisma.RegistryEntryWhereInput;
  sortBy: RegistryEntrySortBy;
  minUptimePercent: number | undefined;
  minHealthCheckDate: Date | undefined;
}) {
  const { input } = params;
  const candidates = (
    await registryMetricsRepository.findRankingCandidates(params.where)
  ).filter((entry) => meetsMinUptimePercent(entry, params.minUptimePercent));

  const [purchases, lineageStarts] = await Promise.all([
    registryMetricsRepository.countSuccessfulPurchases({
      network: input.network,
      agentIdentifiers: candidates.map((entry) => entry.assetIdentifier),
    }),
    getLineageStarts(
      candidates.map((entry) => ({
        assetIdentifier: entry.assetIdentifier,
        policyId: entry.RegistrySource.policyId,
      })),
      input.network
    ),
  ]);

  const priceUnit = input.filter?.pricing?.unit;
  const rankingInputs = candidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    tags: entry.tags,
    createdAt: entry.createdAt,
    uptimeEwma: entry.uptimeEwma,
    successfulPurchases: purchases.get(entry.assetIdentifier) ?? 0,
    lineageStartedAt: isV2Policy(entry.RegistrySource.policyId)
      ? (lineageStarts.get(getAgentVersionRoot(entry.assetIdentifier)) ??
        entry.createdAt)
      : entry.createdAt,
    priceAmount: lowestPriceInUnit(
      [
        entry.AgentPricing,
        ...entry.SupportedPaymentSources.map((source) => source.Pricing),
      ],
      priceUnit
    ),
  }));
  const rankings = computeRankings({
    inputs: rankingInputs,
    weights: CONFIG.RANKING_WEIGHTS,
    now: new Date(),
  });
  const ordered = sliceFromCursor(
    sortRankingInputs({
      inputs: rankingInputs,
      rankings,
      sortBy: params.sortBy,
      searchQuery: 'query' in input ? input.query : undefined,
    }),
    input.cursorId
  );

  const healthCheckedEntries: Awaited<
    ReturnType<typeof healthCheckService.checkVerifyAndUpdateRegistryEntries>
  > = [];
  const batchSize = input.limit * 2;
  for (
    let offset = 0;
    offset < ordered.length && healthCheckedEntries.length < input.limit;
    offset += batchSize
  ) {
    const registryEntries =
      await registryEntryRepository.getRegistryEntriesByIds(
        ordered.slice(offset, offset + batchSize).map((entry) => entry.id)
      );
    healthCheckedEntries.push(
      ...(await healthCheckService.checkVerifyAndUpdateRegistryEntries({
        registryEntries,
        minHealthCheckDate: params.minHealthCheckDate,
      }))
    );
  }

  const ranked = healthCheckedEntries.map((entry) => ({
    ...entry,
    ranking: rankings.get(entry.id),
  }));
  return attachVersionLinks(ranked, input.network);
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
  const minUptimePercent = input.filter?.health?.minUptimePercent;
  const minHealthCheckDate =
    input.filter?.health?.lastCheckedAfter ?? input.minHealthCheckDate;

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

  const where = buildRegistryEntryWhere({
    filter: input.filter,
    network: input.network,
    assetIdentifier,
    searchQuery,
  });

  if (input.sortBy != null) {
    return getRankedRegistryEntries({
      input,
      where,
      sortBy: input.sortBy,
      minUptimePercent,
      minHealthCheckDate,
    });
  }

  while (healthCheckedEntries.length < input.limit) {
    const queryParams = {
      where,
      cursorId: currentCursorId,
      limit: input.limit * 2,
      network: input.network,
    };
    const registryEntries = searchQuery
      ? await registryEntryRepository.searchRegistryEntries(queryParams)
      : await registryEntryRepository.getRegistryEntry(queryParams);

    // Filter before the live health check so excluded entries cost no requests.
    const result = await healthCheckService.checkVerifyAndUpdateRegistryEntries(
      {
        registryEntries: registryEntries.filter((entry) =>
          meetsMinUptimePercent(entry, minUptimePercent)
        ),
        minHealthCheckDate,
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
