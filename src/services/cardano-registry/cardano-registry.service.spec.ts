import { $Enums, InboxAgentRegistrationStatus } from '@prisma/client';
import { prisma } from '@/utils/db';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import { healthCheckService } from '@/services/health-check';
import { DEFAULTS } from '@/utils/config';
import { updateLatestCardanoRegistryEntries } from './cardano-registry.service';
import { INBOX_REGISTRY_METADATA_TYPE } from './inbox-agent-registration';

jest.mock('@/utils/db', () => ({
  prisma: {
    registrySource: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    inboxAgentRegistration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    registryEntry: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations)
    ),
  },
}));

jest.mock('@/utils/blockfrost', () => ({
  getBlockfrostInstance: jest.fn(),
}));

jest.mock('@/services/health-check', () => ({
  healthCheckService: {
    checkAndVerifyEndpoint: jest.fn(),
    checkVerifyAndUpdateInboxAgentRegistrations: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('updateLatestCardanoRegistryEntries', () => {
  const source = {
    id: 'source-1',
    network: $Enums.Network.Preprod,
    policyId: 'policy-id',
    lastTxId: null,
    lastCheckedPage: 1,
    RegistrySourceConfig: {
      rpcProviderApiKey: 'blockfrost-token',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (prisma.registrySource.findMany as jest.Mock).mockResolvedValue([source]);
    (prisma.registrySource.update as jest.Mock).mockResolvedValue(source);
  });

  it('syncs a new inbox agent registration to the database', async () => {
    const assetIdentifier = `${source.policyId}asset-name`;
    const createdRegistration = {
      id: 'registration-1',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      statusUpdatedAt: new Date(0),
      status: InboxAgentRegistrationStatus.Pending,
      name: 'Inbox Agent',
      description: null,
      agentSlug: 'inbox-agent',
      assetIdentifier,
      metadataVersion: 1,
      registrySourceId: source.id,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              tx_hash: 'tx-1',
              tx_index: 0,
              purpose: 'mint',
              redeemer_data_hash: 'redeemer-data-hash',
              datum_hash: 'datum-hash',
              unit_mem: '0',
              unit_steps: '0',
              fee: '0',
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    const blockfrost = {
      txsUtxos: jest.fn(),
      assetsById: jest.fn(),
    };
    (getBlockfrostInstance as jest.Mock).mockReturnValue(blockfrost);

    blockfrost.txsUtxos.mockResolvedValue({
      inputs: [],
      outputs: [
        {
          amount: [{ unit: assetIdentifier, quantity: '1' }],
        },
      ],
    });
    blockfrost.assetsById.mockResolvedValue({
      onchain_metadata: {
        type: INBOX_REGISTRY_METADATA_TYPE,
        name: 'Inbox Agent',
        agentslug: 'inbox-agent',
        metadata_version: 1,
      },
    });
    (prisma.inboxAgentRegistration.findUnique as jest.Mock).mockResolvedValue(
      null
    );
    (prisma.inboxAgentRegistration.upsert as jest.Mock).mockResolvedValue(
      createdRegistration
    );

    await updateLatestCardanoRegistryEntries();

    expect(prisma.inboxAgentRegistration.upsert).toHaveBeenCalledWith({
      where: { assetIdentifier },
      update: expect.objectContaining({
        status: InboxAgentRegistrationStatus.Pending,
      }),
      create: expect.objectContaining({
        assetIdentifier,
        status: InboxAgentRegistrationStatus.Pending,
      }),
    });
    expect(
      healthCheckService.checkVerifyAndUpdateInboxAgentRegistrations
    ).not.toHaveBeenCalled();
  });

  it('advances past semantically invalid V2 metadata and syncs later mints', async () => {
    const v2Source = {
      ...source,
      policyId: DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2,
    };
    const invalidAsset = `${v2Source.policyId}invalid`;
    const validAsset = `${v2Source.policyId}valid`;
    const commonMetadata = {
      name: 'V2 Agent',
      api_base_url: 'https://agent.example/mip',
      author: { name: 'Author' },
      tags: ['ai'],
      image: 'https://agent.example/logo.png',
      metadata_version: 2,
    };

    (prisma.registrySource.findMany as jest.Mock).mockResolvedValue([v2Source]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { tx_hash: 'tx-invalid', purpose: 'mint' },
            { tx_hash: 'tx-valid', purpose: 'mint' },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

    const blockfrost = {
      txsUtxos: jest.fn((txHash: string) => ({
        inputs: [],
        outputs: [
          {
            amount: [
              {
                unit: txHash === 'tx-invalid' ? invalidAsset : validAsset,
                quantity: '1',
              },
            ],
          },
        ],
      })),
      assetsById: jest.fn((assetIdentifier: string) => ({
        onchain_metadata:
          assetIdentifier === invalidAsset
            ? {
                ...commonMetadata,
                supported_payment_sources: [
                  {
                    chain: 'EVM',
                    network: 'eip155:8453',
                    settlement: {
                      scheme: 'Exact',
                      payTo: '0x1111111111111111111111111111111111111111',
                    },
                    pricing: {
                      pricingType: 'Fixed',
                      fixed: [
                        {
                          asset: 'native',
                          amount: '1',
                          decimals: '18',
                        },
                      ],
                    },
                  },
                ],
              }
            : {
                ...commonMetadata,
                supported_payment_sources: [
                  {
                    chain: 'Cardano',
                    network: 'Preprod',
                    settlement: {
                      paymentSourceType: 'Web3CardanoV2',
                      address: 'addr_test1example',
                    },
                    pricing: { pricingType: 'Free' },
                  },
                ],
              },
      })),
    };
    (getBlockfrostInstance as jest.Mock).mockReturnValue(blockfrost);
    (healthCheckService.checkAndVerifyEndpoint as jest.Mock).mockResolvedValue({
      returnedAgentIdentifier: null,
      status: $Enums.Status.Online,
    });
    (prisma.registryEntry.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    });
    (prisma.registryEntry.upsert as jest.Mock).mockResolvedValue({});

    await updateLatestCardanoRegistryEntries();

    expect(prisma.registryEntry.updateMany).toHaveBeenCalledWith({
      where: {
        registrySourceId: v2Source.id,
        assetIdentifier: invalidAsset,
      },
      data: {
        status: $Enums.Status.Invalid,
        statusUpdatedAt: expect.any(Date),
      },
    });
    expect(prisma.registryEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assetIdentifier: validAsset },
      })
    );
    expect(prisma.registrySource.update).toHaveBeenCalledWith({
      where: { id: v2Source.id },
      data: { lastCheckedPage: 1, lastTxId: 'tx-invalid' },
    });
    expect(prisma.registrySource.update).toHaveBeenCalledWith({
      where: { id: v2Source.id },
      data: { lastCheckedPage: 1, lastTxId: 'tx-valid' },
    });
  });
});
