import { Network, PaymentType, PricingType, Status } from '@prisma/client';
import { searchRegistrySchemaInput } from '@/routes/api/registry-entry/schemas';

type MockRegistryEntriesResult = { id: string }[];

const searchRegistryEntries = jest.fn();
const getRegistryEntry = jest.fn();
const getRegistryEntryByIdentifier = jest.fn();
const getRegistryDiffEntries = jest.fn();
const updateLatestCardanoRegistryEntries = jest.fn();
const checkVerifyAndUpdateRegistryEntries = jest.fn();

jest.mock('@/repositories/registry-entry', () => ({
  registryEntryRepository: {
    searchRegistryEntries,
    getRegistryEntry,
    getRegistryEntryByIdentifier,
    getRegistryDiffEntries,
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
      capability: undefined,
      allowedPaymentTypes: undefined,
      allowedStatuses: [Status.Online],
      policyId: undefined,
      assetIdentifier: undefined,
      tags: undefined,
      cursorId: undefined,
      limit: 20,
      network: Network.Preprod,
      searchQuery: 'example agent',
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
      capability: { name: 'Chat', version: '1.0' },
      allowedPaymentTypes: [PaymentType.None],
      allowedStatuses: [Status.Offline],
      policyId: 'policy-id',
      assetIdentifier: 'asset-id',
      tags: ['text-generation'],
      cursorId: 'cursor-1',
      limit: 10,
      network: Network.Mainnet,
      searchQuery: 'api 1',
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

    expect(searchRegistryEntries).toHaveBeenCalledWith({
      capability: undefined,
      allowedPaymentTypes: undefined,
      allowedStatuses: [Status.Online],
      policyId: undefined,
      assetIdentifier: undefined,
      tags: undefined,
      cursorId: undefined,
      limit: 20,
      network: Network.Preprod,
      searchQuery: '100\\% \\_agent\\\\name',
    });
  });
});

describe('registryEntryService.refreshRegistryEntry', () => {
  const registryEntry = {
    id: 'entry-1',
    status: Status.Invalid,
    assetIdentifier: 'asset-1',
    lastUptimeCheck: new Date(0),
    apiBaseUrl: 'https://agent.example.com',
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
