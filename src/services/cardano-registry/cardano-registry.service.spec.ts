import { $Enums, InboxAgentRegistrationStatus } from '@prisma/client';
import { prisma } from '@/utils/db';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import { healthCheckService } from '@/services/health-check';
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

  const registrySource = {
    id: source.id,
    network: source.network,
    url: null,
    policyId: source.policyId,
    registrySourceConfigId: 'config-1',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    note: null,
    lastTxId: null,
    lastCheckedPage: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (prisma.registrySource.findMany as jest.Mock).mockResolvedValue([source]);
    (prisma.registrySource.update as jest.Mock).mockResolvedValue(source);
  });

  it('tries immediate verification when a new inbox agent registration is found', async () => {
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
      providerUrl: null,
      assetIdentifier,
      linkedEmail: null,
      encryptionPublicKey: null,
      encryptionKeyVersion: null,
      signingPublicKey: null,
      signingKeyVersion: null,
      metadataVersion: 1,
      registrySourceId: source.id,
      RegistrySource: registrySource,
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
    (
      healthCheckService.checkVerifyAndUpdateInboxAgentRegistrations as jest.Mock
    ).mockResolvedValue([createdRegistration]);

    await updateLatestCardanoRegistryEntries();

    expect(prisma.inboxAgentRegistration.upsert).toHaveBeenCalledWith({
      where: { assetIdentifier },
      include: {
        RegistrySource: true,
      },
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
    ).toHaveBeenCalledWith({
      inboxAgentRegistrations: [createdRegistration],
    });
  });
});
