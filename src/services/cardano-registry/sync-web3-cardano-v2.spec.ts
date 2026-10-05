import { $Enums } from '@prisma/client';
import { prisma } from '@/utils/db';
import { healthCheckService } from '@/services/health-check';
import { checkSpecEntry } from '@/services/health-check/spec-entry-check';
import { syncWeb3CardanoV2RegistryEntry } from './sync-web3-cardano-v2';

jest.mock('@/utils/db', () => {
  const tx = {
    registryEntry: { upsert: jest.fn(), updateMany: jest.fn() },
    a2ARegistryEntry: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  return {
    prisma: { ...tx, $transaction: jest.fn((callback) => callback(tx)) },
  };
});
jest.mock('@/services/health-check', () => ({
  healthCheckService: { checkAndVerifyEndpoint: jest.fn() },
}));
jest.mock('@/services/health-check/spec-entry-check', () => ({
  checkSpecEntry: jest.fn(),
  specCachePatch: (result: { spec?: unknown }) =>
    result.spec === undefined
      ? {}
      : { spec: result.spec, specValidatedAt: new Date() },
}));
jest.mock('@/utils/logger', () => ({ logger: { warn: jest.fn() } }));

const params = {
  source: {
    id: 'source',
    policyId: 'policy',
    network: $Enums.Network.Preprod,
    lastTxId: null,
    lastCheckedPage: 1,
    RegistrySourceConfig: { rpcProviderApiKey: 'test' },
  },
  asset: 'asset',
  onchainMetadata: {
    name: 'A2A',
    type: 'a2aV1',
    api_url: 'https://agent.example/rpc',
    agent_card_url: 'https://agent.example/card.json',
    a2a_protocol_versions: ['1.0'],
    author: { name: 'Author' },
    tags: ['ai'],
    image: 'https://agent.example/logo.png',
    metadata_version: 2,
    supported_payment_sources: [
      {
        chain: 'Cardano',
        network: 'Preprod',
        settlement: {
          paymentSourceType: 'Web3CardanoV2',
          address: 'addr_test1',
        },
        pricing: { pricingType: 'Free' },
      },
    ],
  },
};

describe('syncWeb3CardanoV2RegistryEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.registryEntry.upsert as jest.Mock).mockResolvedValue({
      id: 'entry',
    });
  });

  it.each([$Enums.Status.Invalid, $Enums.Status.Offline])(
    'persists card status %s without calling /availability',
    async (status) => {
      (checkSpecEntry as jest.Mock).mockResolvedValue({ status });
      expect(await syncWeb3CardanoV2RegistryEntry(params)).toBe(true);
      expect(healthCheckService.checkAndVerifyEndpoint).not.toHaveBeenCalled();
      expect(prisma.registryEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status,
            apiBaseUrl: params.onchainMetadata.api_url,
          }),
          update: expect.objectContaining({ status }),
        })
      );
      const { create, update } = (prisma.registryEntry.upsert as jest.Mock).mock
        .calls[0][0];
      expect(create).not.toHaveProperty('spec');
      expect(update).not.toHaveProperty('spec');
    }
  );

  it('caches a validated card on both create and update', async () => {
    const spec = { name: 'Validated card' };
    (checkSpecEntry as jest.Mock).mockResolvedValue({
      status: $Enums.Status.Online,
      spec,
    });
    expect(await syncWeb3CardanoV2RegistryEntry(params)).toBe(true);
    expect(prisma.registryEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          spec,
          specValidatedAt: expect.any(Date),
          status: $Enums.Status.Online,
        }),
        update: expect.objectContaining({
          spec,
          specValidatedAt: expect.any(Date),
          status: $Enums.Status.Online,
        }),
      })
    );
  });

  it('rejects alias conflicts before card fetch and transaction writes', async () => {
    expect(
      await syncWeb3CardanoV2RegistryEntry({
        ...params,
        onchainMetadata: {
          ...params.onchainMetadata,
          api_base_url: 'https://agent.example/conflict',
        },
      })
    ).toBe(false);
    expect(checkSpecEntry).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.registryEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: $Enums.Status.Invalid }),
      })
    );
  });
});
