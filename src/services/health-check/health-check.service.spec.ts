import { $Enums, InboxAgentRegistrationStatus } from '@prisma/client';
import { lookup } from 'node:dns/promises';
import { prisma } from '@/utils/db';
import { healthCheckService } from './health-check.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

describe('healthCheckService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  describe('checkAndVerifyEndpoint', () => {
    const mockUrl = 'http://test.com';
    const mockIdentifier = 'test-id';
    const mockRegistryId = 'registry-id';

    it('should return Offline status when endpoint is not reachable', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await healthCheckService.checkAndVerifyEndpoint({
        api_url: mockUrl,
      });
      expect(result.status).toBe($Enums.Status.Offline);
    });

    it('should return Online status when decentralized verification succeeds', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            agentIdentifier: `${mockRegistryId}${mockIdentifier}`,
            type: 'Web3CardanoV1',
          }),
      });

      const result = await healthCheckService.checkAndVerifyEndpoint({
        api_url: mockUrl,
      });

      expect(result.status).toBe($Enums.Status.Online);
      expect(result.returnedAgentIdentifier).toBe(
        `${mockRegistryId}${mockIdentifier}`
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockUrl}/availability`,
        expect.objectContaining({
          redirect: 'manual',
        })
      );
    });

    it('should return Invalid status when decentralized verification fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            identifier: 'wrong-id',
            registry: mockRegistryId,
            type: 'Web3CardanoV1',
          }),
      });

      const result = await healthCheckService.checkAndVerifyEndpoint({
        api_url: mockUrl,
      });

      expect(result.status).toBe($Enums.Status.Invalid);
      expect(result.returnedAgentIdentifier).toBe(null);
    });

    it('should return Invalid status when endpoint resolves to a blocked private address', async () => {
      (lookup as jest.Mock).mockResolvedValueOnce([
        { address: '10.0.0.5', family: 4 },
      ]);

      const result = await healthCheckService.checkAndVerifyEndpoint({
        api_url: mockUrl,
      });

      expect(result.status).toBe($Enums.Status.Invalid);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return Offline status when hostname resolution fails', async () => {
      (lookup as jest.Mock).mockRejectedValueOnce(new Error('dns failed'));

      const result = await healthCheckService.checkAndVerifyEndpoint({
        api_url: mockUrl,
      });

      expect(result.status).toBe($Enums.Status.Offline);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

describe('checkAndVerifyRegistryEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should return existing status if lastUptimeCheck is newer than minHealthCheckDate', async () => {
    const mockRegistryEntry = {
      assetIdentifier: 'test-id',
      lastUptimeCheck: new Date(Date.now() - 200),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 1,
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'registry-id',
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
    });
    const minHealthCheckDate = new Date(Date.now() - 1000);
    mockRegistryEntry.lastUptimeCheck = new Date();

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockRegistryEntry,
      minHealthCheckDate,
    });

    expect(result).toBe(mockRegistryEntry.status);
  });

  it('should check endpoint if lastUptimeCheck is older than minHealthCheckDate', async () => {
    const minHealthCheckDate = new Date();
    const mockRegistryEntry = {
      assetIdentifier: 'registry-assetname',
      lastUptimeCheck: new Date(Date.now() - 200),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 1,
      status: $Enums.Status.Offline,
      RegistrySource: {
        policyId: 'registry',
      },
    };
    mockRegistryEntry.lastUptimeCheck = new Date(Date.now() - 1000);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          agentIdentifier: 'registry-assetname',
          type: 'Web3CardanoV1',
        }),
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockRegistryEntry,
      minHealthCheckDate,
    });

    expect(result).toBe($Enums.Status.Online);
  });

  it('should not check endpoint if minHealthCheckDate is undefined', async () => {
    const mockRegistryEntry = {
      assetIdentifier: 'test-id',
      lastUptimeCheck: new Date(Date.now() - 200),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 1,
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'registry-id',
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockRegistryEntry,
      minHealthCheckDate: undefined,
    });

    expect(result).toBe($Enums.Status.Online);
  });

  it('should return Offline status when endpoint check fails', async () => {
    const mockRegistryEntry = {
      assetIdentifier: 'test-id',
      lastUptimeCheck: new Date(Date.now() - 200),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 1,
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'registry-id',
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockRegistryEntry,
      minHealthCheckDate: new Date(),
    });

    expect(result).toBe($Enums.Status.Offline);
  });
});

describe('checkAndVerifyInboxAgentRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should keep inbox agent registration pending when the slug is not yet public', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Inbox slug not found'),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Pending,
      preserveExistingVerificationData: false,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://masumi-inbox-dev-ivi44.ondigitalocean.app/inbox-agent/public',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
        redirect: 'manual',
      })
    );
  });

  it('should verify inbox agent registration and capture verification-derived fields', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          registration: {
            agentIdentifier: 'asset-123',
            linkedEmail: 'agent@example.com',
            encryptionPublicKey: 'encryption_public_key',
            encryptionKeyVersion: 'enc-v1',
            signingPublicKey: 'signing_public_key',
            signingKeyVersion: 'sig-v1',
          },
        }),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Verified,
      preserveExistingVerificationData: false,
      verificationData: {
        linkedEmail: 'agent@example.com',
        encryptionPublicKey: 'encryption_public_key',
        encryptionKeyVersion: 'enc-v1',
        signingPublicKey: 'signing_public_key',
        signingKeyVersion: 'sig-v1',
      },
    });
  });

  it('should store missing optional verification fields as null', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          agentIdentifier: 'asset-123',
          signingPublicKey: 'signing_public_key',
        }),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Verified,
      preserveExistingVerificationData: false,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: 'signing_public_key',
        signingKeyVersion: null,
      },
    });
  });

  it('should use the mainnet inbox base url for non-preprod registrations', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Inbox slug not found'),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'mainnet-agent',
          RegistrySource: {
            network: $Enums.Network.Mainnet,
          },
        },
      });

    expect(result.status).toBe(InboxAgentRegistrationStatus.Pending);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://agentmessenger.io/mainnet-agent/public',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
        redirect: 'manual',
      })
    );
  });

  it('should use providerUrl as the primary inbox verification base url when present', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Inbox slug not found'),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'custom-agent',
          providerUrl: 'https://provider.example.com/base',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result.status).toBe(InboxAgentRegistrationStatus.Pending);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://provider.example.com/base/custom-agent/public',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
        redirect: 'manual',
      })
    );
  });

  it('should not fetch inbox verification data from blocked provider urls', async () => {
    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'custom-agent',
          providerUrl: 'http://127.0.0.1',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
        currentStatus: InboxAgentRegistrationStatus.Verified,
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Verified,
      preserveExistingVerificationData: true,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should verify inbox agent registration when a nested masumiAgentIdentifier matches assetIdentifier', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          registration: {
            masumiAgentIdentifier: 'asset-123',
          },
        }),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Verified,
      preserveExistingVerificationData: false,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
  });

  it('should invalidate inbox agent registration and clear verification-derived fields when a different agent identifier is returned', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          registration: {
            agentIdentifier: 'asset-999',
            linkedEmail: 'wrong@example.com',
            signingPublicKey: 'wrong_key',
          },
        }),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Invalid,
      preserveExistingVerificationData: false,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
  });

  it('should keep inbox agent registration pending and clear verification-derived fields when the payload has no identifier keys', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          linkedEmail: 'agent@example.com',
          signingPublicKey: 'signing_public_key',
        }),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Pending,
      preserveExistingVerificationData: false,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
  });

  it('should preserve verified status and existing verification data on transient endpoint failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('temporary failure'),
    });

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
        currentStatus: InboxAgentRegistrationStatus.Verified,
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Verified,
      preserveExistingVerificationData: true,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
  });

  it('should preserve invalid status and existing verification data on network lookup failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('network down')
    );

    const result =
      await healthCheckService.checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: {
          assetIdentifier: 'asset-123',
          agentSlug: 'inbox-agent',
          RegistrySource: {
            network: $Enums.Network.Preprod,
          },
        },
        currentStatus: InboxAgentRegistrationStatus.Invalid,
      });

    expect(result).toEqual({
      status: InboxAgentRegistrationStatus.Invalid,
      preserveExistingVerificationData: true,
      verificationData: {
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    });
  });
});

describe('checkVerifyAndUpdateInboxAgentRegistrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('does not reuse inbox lookup results across different provider urls', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            agentIdentifier: 'asset-123',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            agentIdentifier: 'asset-456',
          }),
      });

    const updateSpy = jest
      .spyOn(prisma.inboxAgentRegistration, 'update')
      .mockResolvedValue({} as never);

    await healthCheckService.checkVerifyAndUpdateInboxAgentRegistrations({
      inboxAgentRegistrations: [
        {
          id: 'registration-1',
          assetIdentifier: 'asset-123',
          agentSlug: 'shared-agent',
          providerUrl: 'https://provider-a.example.com',
          status: InboxAgentRegistrationStatus.Pending,
          RegistrySource: {
            id: 'source-1',
            network: $Enums.Network.Preprod,
            url: null,
            policyId: 'policy-id',
            registrySourceConfigId: 'config-1',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            note: null,
            lastTxId: null,
            lastCheckedPage: 1,
          },
          createdAt: new Date(0),
          updatedAt: new Date(0),
          statusUpdatedAt: new Date(0),
          name: 'Agent A',
          description: null,
          linkedEmail: null,
          encryptionPublicKey: null,
          encryptionKeyVersion: null,
          signingPublicKey: null,
          signingKeyVersion: null,
          metadataVersion: 1,
          registrySourceId: 'source-1',
        },
        {
          id: 'registration-2',
          assetIdentifier: 'asset-456',
          agentSlug: 'shared-agent',
          providerUrl: 'https://provider-b.example.com',
          status: InboxAgentRegistrationStatus.Pending,
          RegistrySource: {
            id: 'source-1',
            network: $Enums.Network.Preprod,
            url: null,
            policyId: 'policy-id',
            registrySourceConfigId: 'config-1',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            note: null,
            lastTxId: null,
            lastCheckedPage: 1,
          },
          createdAt: new Date(0),
          updatedAt: new Date(0),
          statusUpdatedAt: new Date(0),
          name: 'Agent B',
          description: null,
          linkedEmail: null,
          encryptionPublicKey: null,
          encryptionKeyVersion: null,
          signingPublicKey: null,
          signingKeyVersion: null,
          metadataVersion: 1,
          registrySourceId: 'source-1',
        },
      ],
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://provider-a.example.com/shared-agent/public',
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://provider-b.example.com/shared-agent/public',
      expect.any(Object)
    );
    expect(updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'registration-1' },
        data: expect.objectContaining({
          status: InboxAgentRegistrationStatus.Verified,
        }),
      })
    );
    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'registration-2' },
        data: expect.objectContaining({
          status: InboxAgentRegistrationStatus.Verified,
        }),
      })
    );
  });
});
