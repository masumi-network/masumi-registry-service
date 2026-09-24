import {
  Network,
  PaymentType,
  PricingType,
  RegistryEntryType,
  Status,
} from '@prisma/client';
import { searchRegistrySchemaInput } from '@/routes/api/registry-entry/schemas';
import { DEFAULTS } from '@/utils/config';

type MockRegistryEntriesResult = { id: string }[];

const searchRegistryEntries = jest.fn();
const getRegistryEntry = jest.fn();
const getRegistryEntryByIdentifier = jest.fn();
const getRegistryDiffEntries = jest.fn();
const findVersionSiblingAssetIdentifiers = jest.fn();
const updateLatestCardanoRegistryEntries = jest.fn();
const checkVerifyAndUpdateRegistryEntries = jest.fn();
const getRegistryEntriesByIds = jest.fn();
const findRankingCandidates = jest.fn();
const countSuccessfulPurchases = jest.fn();
const findVersionCreatedAts = jest.fn();

jest.mock('@/repositories/registry-entry', () => ({
  registryEntryRepository: {
    searchRegistryEntries,
    getRegistryEntry,
    getRegistryEntryByIdentifier,
    getRegistryDiffEntries,
    findVersionSiblingAssetIdentifiers,
    getRegistryEntriesByIds,
  },
}));

jest.mock('@/repositories/registry-entry/registry-metrics.repository', () => ({
  registryMetricsRepository: {
    findRankingCandidates,
    countSuccessfulPurchases,
    findVersionCreatedAts,
  },
}));

jest.mock('@/services/cardano-registry', () => ({
  cardanoRegistryService: {
    updateLatestCardanoRegistryEntries,
  },
}));

jest.mock('@/services/health-check', () => ({
  healthCheckService: {
    checkVerifyAndUpdateRegistryEntries,
  },
}));

import { registryEntryService } from './registry-entry.service';

describe('registryEntryService.searchRegistryEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchRegistryEntries.mockResolvedValue([{ id: 'entry-1' }]);
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
    checkVerifyAndUpdateRegistryEntries.mockImplementation(
      async ({
        registryEntries,
      }: {
        registryEntries: MockRegistryEntriesResult;
      }) => registryEntries
    );
  });

  it('defaults to online status and normalizes the search query', async () => {
    await registryEntryService.searchRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      query: '  Example   Agent  ',
    });

    expect(updateLatestCardanoRegistryEntries).toHaveBeenCalled();
    expect(searchRegistryEntries).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { in: [Status.Online] },
        RegistrySource: { policyId: undefined, network: Network.Preprod },
        searchText: { contains: 'example agent' },
      }),
      cursorId: undefined,
      limit: 20,
      network: Network.Preprod,
    });
    expect(checkVerifyAndUpdateRegistryEntries).toHaveBeenCalledWith({
      registryEntries: [{ id: 'entry-1' }],
      minHealthCheckDate: undefined,
    });
  });

  it('passes through explicit filters, cursor, and minHealthCheckDate', async () => {
    const input = searchRegistrySchemaInput.parse({
      network: Network.Mainnet,
      limit: 5,
      cursorId: 'cursor-1',
      query: ' API   1 ',
      minHealthCheckDate: '2026-04-14T10:00:00.000Z',
      filter: {
        paymentTypes: [PaymentType.None],
        status: [Status.Offline],
        policyId: 'policy-id',
        assetIdentifier: 'asset-id',
        tags: ['text-generation'],
        capability: {
          name: 'Chat',
          version: '1.0',
        },
      },
    });
    const minHealthCheckDate = input.minHealthCheckDate;

    await registryEntryService.searchRegistryEntries(input);

    expect(searchRegistryEntries).toHaveBeenCalledWith({
      where: expect.objectContaining({
        Capability: { name: 'Chat', version: '1.0' },
        paymentType: { in: [PaymentType.None] },
        status: { in: [Status.Offline] },
        assetIdentifier: 'asset-id',
        RegistrySource: { policyId: 'policy-id', network: Network.Mainnet },
        tags: { hasSome: ['text-generation'] },
        searchText: { contains: 'api 1' },
      }),
      cursorId: 'cursor-1',
      limit: 10,
      network: Network.Mainnet,
    });
    expect(checkVerifyAndUpdateRegistryEntries).toHaveBeenCalledWith({
      registryEntries: [{ id: 'entry-1' }],
      minHealthCheckDate,
    });
  });

  it('escapes like wildcard characters in the search query', async () => {
    await registryEntryService.searchRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      query: ' 100% _agent\\name ',
    });

    expect(searchRegistryEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          searchText: { contains: '100\\% \\_agent\\\\name' },
        }),
      })
    );
  });

  it('drops entries below minUptimePercent before the live health check', async () => {
    const reliable = { id: 'reliable', uptimeCount: 9, uptimeCheckCount: 10 };
    const flaky = { id: 'flaky', uptimeCount: 5, uptimeCheckCount: 10 };
    const neverChecked = { id: 'new', uptimeCount: 0, uptimeCheckCount: 0 };
    searchRegistryEntries.mockResolvedValue([reliable, flaky, neverChecked]);

    await registryEntryService.searchRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      query: 'agent',
      filter: { health: { minUptimePercent: 90 } },
    });

    expect(checkVerifyAndUpdateRegistryEntries).toHaveBeenCalledWith({
      registryEntries: [reliable],
      minHealthCheckDate: undefined,
    });
  });

  it('prefers health.lastCheckedAfter over the deprecated minHealthCheckDate', async () => {
    const lastCheckedAfter = new Date('2026-09-01T00:00:00.000Z');

    await registryEntryService.searchRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      query: 'agent',
      minHealthCheckDate: new Date('2026-01-01T00:00:00.000Z'),
      filter: { health: { lastCheckedAfter } },
    });

    expect(checkVerifyAndUpdateRegistryEntries).toHaveBeenCalledWith(
      expect.objectContaining({ minHealthCheckDate: lastCheckedAfter })
    );
  });
});

describe('registryEntryService.refreshRegistryEntry', () => {
  const registryEntry = {
    id: 'entry-1',
    status: Status.Invalid,
    assetIdentifier: 'asset-1',
    lastUptimeCheck: new Date(0),
    type: RegistryEntryType.Standard,
    apiBaseUrl: 'https://agent.example.com',
    openApiSpecUrl: null,
    x402ResourcesUrl: null,
    RegistrySource: {
      id: 'source-1',
      policyId: 'policy-id',
      url: null,
      network: Network.Preprod,
    },
    Capability: null,
    AgentPricing: {
      pricingType: PricingType.Free,
      FixedPricing: null,
    },
    ExampleOutput: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
    getRegistryEntryByIdentifier.mockResolvedValue(registryEntry);
    checkVerifyAndUpdateRegistryEntries.mockResolvedValue([
      { ...registryEntry, status: Status.Online },
    ]);
  });

  it('syncs blockchain state and refreshes one registry entry by identifier', async () => {
    const result = await registryEntryService.refreshRegistryEntry({
      network: Network.Preprod,
      agentIdentifier: 'asset-1',
    });

    expect(updateLatestCardanoRegistryEntries).toHaveBeenCalled();
    expect(getRegistryEntryByIdentifier).toHaveBeenCalledWith({
      network: Network.Preprod,
      agentIdentifier: 'asset-1',
    });
    expect(checkVerifyAndUpdateRegistryEntries).toHaveBeenCalledWith({
      registryEntries: [registryEntry],
      minHealthCheckDate: expect.any(Date),
    });
    expect(result).toMatchObject({ id: 'entry-1', status: Status.Online });
  });

  it('returns null when the requested registry entry does not exist', async () => {
    getRegistryEntryByIdentifier.mockResolvedValue(null);

    const result = await registryEntryService.refreshRegistryEntry({
      network: Network.Preprod,
      agentIdentifier: 'missing-asset',
    });

    expect(result).toBeNull();
    expect(checkVerifyAndUpdateRegistryEntries).not.toHaveBeenCalled();
  });

  it('does not health-check deregistered registry entries', async () => {
    getRegistryEntryByIdentifier.mockResolvedValue({
      ...registryEntry,
      status: Status.Deregistered,
    });

    const result = await registryEntryService.refreshRegistryEntry({
      network: Network.Preprod,
      agentIdentifier: 'asset-1',
    });

    expect(result).toMatchObject({
      id: 'entry-1',
      status: Status.Deregistered,
    });
    expect(checkVerifyAndUpdateRegistryEntries).not.toHaveBeenCalled();
  });
});

describe('registryEntryService.getRegistryEntries version handling', () => {
  const V2_POLICY = DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2;
  const ROOT = `${V2_POLICY}${'cd'}${'ab'.repeat(28)}`;
  const v = (versionHex: string) => `${ROOT}${versionHex}`;
  const V1 = v('000001');
  const V2 = v('000002');
  const V3 = v('000003');

  const v2Entry = (assetIdentifier: string, id: string) => ({
    id,
    assetIdentifier,
    RegistrySource: { id: 'source-1', policyId: V2_POLICY, network: 'Preprod' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
    checkVerifyAndUpdateRegistryEntries.mockImplementation(
      async ({ registryEntries }: { registryEntries: unknown[] }) =>
        registryEntries
    );
  });

  it('computes supersedes/supersededBy from stored sibling versions', async () => {
    getRegistryEntry.mockResolvedValue([v2Entry(V2, 'e2')]);
    findVersionSiblingAssetIdentifiers.mockResolvedValue([V1, V2, V3]);

    const [entry] = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      filter: { assetIdentifier: V2 },
    });

    expect(entry.supersedesAgentIdentifier).toBe(V1);
    expect(entry.supersededByAgentIdentifier).toBe(V3);
  });

  it('returns null links for the latest version and does not resolve without the flag', async () => {
    getRegistryEntry.mockResolvedValue([v2Entry(V3, 'e3')]);
    findVersionSiblingAssetIdentifiers.mockResolvedValue([V1, V2, V3]);

    const [entry] = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      filter: { assetIdentifier: V3 },
    });

    // Exact match preserved: the queried assetIdentifier is passed through as-is.
    expect(getRegistryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assetIdentifier: V3 }),
      })
    );
    expect(entry.supersedesAgentIdentifier).toBe(V2);
    expect(entry.supersededByAgentIdentifier).toBeNull();
  });

  it('resolveToLatestVersion rewrites an old identifier to the latest sibling', async () => {
    getRegistryEntry.mockResolvedValue([v2Entry(V3, 'e3')]);
    findVersionSiblingAssetIdentifiers.mockResolvedValue([V1, V2, V3]);

    await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      filter: { assetIdentifier: V1, resolveToLatestVersion: true },
    });

    expect(getRegistryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assetIdentifier: V3 }),
      })
    );
  });

  it('does not resolve or link non-V2 entries', async () => {
    const v1PolicyAsset = `${DEFAULTS.REGISTRY_POLICY_ID_PREPROD}${'ff'.repeat(32)}`;
    getRegistryEntry.mockResolvedValue([
      {
        id: 'e1',
        assetIdentifier: v1PolicyAsset,
        RegistrySource: { policyId: DEFAULTS.REGISTRY_POLICY_ID_PREPROD },
      },
    ]);

    const [entry] = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      filter: { assetIdentifier: v1PolicyAsset, resolveToLatestVersion: true },
    });

    expect(findVersionSiblingAssetIdentifiers).not.toHaveBeenCalled();
    expect(getRegistryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assetIdentifier: v1PolicyAsset }),
      })
    );
    expect(entry.supersedesAgentIdentifier).toBeNull();
    expect(entry.supersededByAgentIdentifier).toBeNull();
  });
});

describe('registryEntryService ranked listing (sortBy)', () => {
  const candidate = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    assetIdentifier: `asset-${id}`,
    name: id,
    tags: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    uptimeEwma: 0.9,
    uptimeCount: 9,
    uptimeCheckCount: 10,
    RegistrySource: { policyId: DEFAULTS.REGISTRY_POLICY_ID_PREPROD },
    AgentPricing: null,
    SupportedPaymentSources: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
    findVersionCreatedAts.mockResolvedValue([]);
    findVersionSiblingAssetIdentifiers.mockResolvedValue([]);
    checkVerifyAndUpdateRegistryEntries.mockImplementation(
      async ({ registryEntries }: { registryEntries: unknown[] }) =>
        registryEntries
    );
    getRegistryEntriesByIds.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        assetIdentifier: `asset-${id}`,
        RegistrySource: { policyId: DEFAULTS.REGISTRY_POLICY_ID_PREPROD },
      }))
    );
    findRankingCandidates.mockResolvedValue([
      candidate('low'),
      candidate('top'),
      candidate('mid'),
    ]);
    countSuccessfulPurchases.mockResolvedValue(
      new Map([
        ['asset-top', 30],
        ['asset-mid', 10],
      ])
    );
  });

  it('returns entries in score order with their ranking attached', async () => {
    const entries = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      sortBy: 'score',
    });

    expect(entries.map((entry) => entry.id)).toEqual(['top', 'mid', 'low']);
    expect(getRegistryEntriesByIds).toHaveBeenCalledWith(['top', 'mid', 'low']);
    expect(entries[0]).toMatchObject({
      ranking: {
        components: { successfulPurchases: 1 },
      },
    });
    expect(getRegistryEntry).not.toHaveBeenCalled();
  });

  it('continues a ranked listing from the cursor entry', async () => {
    const entries = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      sortBy: 'score',
      cursorId: 'mid',
    });

    expect(entries.map((entry) => entry.id)).toEqual(['mid', 'low']);
  });

  it('keeps the default order and skips ranking without sortBy', async () => {
    getRegistryEntry.mockResolvedValue([{ id: 'entry-1' }]);

    const entries = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
    });

    expect(findRankingCandidates).not.toHaveBeenCalled();
    expect(entries[0]).not.toHaveProperty('ranking');
  });

  it('applies minUptimePercent before ranking', async () => {
    findRankingCandidates.mockResolvedValue([
      candidate('top', { uptimeCount: 1, uptimeCheckCount: 10 }),
      candidate('mid'),
    ]);

    const entries = await registryEntryService.getRegistryEntries({
      network: Network.Preprod,
      limit: 10,
      sortBy: 'score',
      filter: { health: { minUptimePercent: 50 } },
    });

    expect(entries.map((entry) => entry.id)).toEqual(['mid']);
  });
});
