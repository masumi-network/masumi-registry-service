import { registryEntryRepository } from '@/repositories/registry-entry';
import { registryMetricsRepository } from '@/repositories/registry-entry/registry-metrics.repository';
import {
  queryRegistrySchemaInput,
  refreshRegistryEntrySchemaInput,
  registryDiffSchemaInput,
  RegistryEntrySortBy,
  searchRegistrySchemaInput,
} from '@/routes/api/registry-entry/schemas';
import { $Enums, HealthCheckTrigger, Prisma, Status } from '@prisma/client';
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
  RankingInput,
  sliceFromCursor,
  sortRankingInputs,
} from './registry-ranking';
import {
  getNetworkRankingMetrics,
  lineageKey,
  NetworkRankingMetrics,
} from './registry-ranking-metrics';

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

type RankingCandidate = Awaited<
  ReturnType<typeof registryMetricsRepository.findRankingCandidates>
>[number];

type PriceSortFilter = {
  unit?: string;
  minAmount?: string;
  maxAmount?: string;
};

function toRankingInput(
  entry: RankingCandidate,
  metrics: NetworkRankingMetrics,
  priceFilter: PriceSortFilter | undefined
): RankingInput {
  return {
    id: entry.id,
    name: entry.name,
    tags: entry.tags,
    createdAt: entry.createdAt,
    uptimeEwma: entry.uptimeEwma,
    distinctBuyers:
      metrics.distinctBuyers.get(lineageKey(entry.assetIdentifier)) ?? 0,
    lineageStartedAt: isV2Policy(entry.RegistrySource.policyId)
      ? (metrics.lineageStarts.get(
          getAgentVersionRoot(entry.assetIdentifier)
        ) ?? entry.createdAt)
      : entry.createdAt,
    priceAmount: lowestPriceInUnit(
      [
        entry.AgentPricing,
        ...entry.SupportedPaymentSources.map((source) => source.Pricing),
      ],
      priceFilter?.unit,
      {
        minAmount:
          priceFilter?.minAmount != null
            ? BigInt(priceFilter.minAmount)
            : undefined,
        maxAmount:
          priceFilter?.maxAmount != null
            ? BigInt(priceFilter.maxAmount)
            : undefined,
      }
    ),
  };
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
  const [allCandidates, metrics] = await Promise.all([
    registryMetricsRepository.findRankingCandidates(params.where),
    getNetworkRankingMetrics(input.network),
  ]);
  const candidates = allCandidates.filter((entry) =>
    meetsMinUptimePercent(entry, params.minUptimePercent)
  );

  const priceFilter = input.filter?.pricing;
  const now = new Date();
  const rankingInputs = candidates.map((entry) =>
    toRankingInput(entry, metrics, priceFilter)
  );
  const rankings = computeRankings({
    inputs: rankingInputs,
    weights: CONFIG.RANKING_WEIGHTS,
    now,
  });

  // The cursor entry can leave the filtered set between pages (e.g. the
  // previous page's health check took it Offline). Place it back by its
  // current sort key, scored on this set's scale, and continue after it.
  const cursorId = input.cursorId;
  let staleCursor: RankingInput | undefined;
  if (cursorId != null && !rankings.has(cursorId)) {
    const [cursorEntry] = await registryMetricsRepository.findRankingCandidates(
      { id: cursorId, RegistrySource: { network: input.network } }
    );
    if (cursorEntry != null) {
      staleCursor = toRankingInput(cursorEntry, metrics, priceFilter);
      const cursorRanking = computeRankings({
        inputs: [staleCursor],
        weights: CONFIG.RANKING_WEIGHTS,
        now,
        scaleInputs: rankingInputs,
      }).get(cursorId);
      if (cursorRanking != null) rankings.set(cursorId, cursorRanking);
    }
  }

  const ordered = sliceFromCursor(
    sortRankingInputs({
      inputs: staleCursor ? [...rankingInputs, staleCursor] : rankingInputs,
      rankings,
      sortBy: params.sortBy,
      searchQuery: 'query' in input ? input.query : undefined,
    }),
    cursorId
  ).filter((entry) => entry !== staleCursor);

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
        trigger: HealthCheckTrigger.Request,
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
    const page = searchQuery
      ? await registryEntryRepository.searchRegistryEntries(queryParams)
      : await registryEntryRepository.getRegistryEntry(queryParams);
    // The Prisma cursor is inclusive: after the first page, the first row is
    // the previous page's last row, which was already handled.
    const registryEntries =
      currentCursorId !== input.cursorId && page[0]?.id === currentCursorId
        ? page.slice(1)
        : page;

    // Filter before the live health check so excluded entries cost no requests.
    const result = await healthCheckService.checkVerifyAndUpdateRegistryEntries(
      {
        registryEntries: registryEntries.filter((entry) =>
          meetsMinUptimePercent(entry, minUptimePercent)
        ),
        minHealthCheckDate,
        trigger: HealthCheckTrigger.Request,
      }
    );

    healthCheckedEntries.push(...result);

    if (page.length < input.limit * 2) break;
    currentCursorId = page[page.length - 1].id;
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
      trigger: HealthCheckTrigger.Request,
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
