import { healthCheckService } from './health-check.service';
import { $Enums, InboxAgentRegistrationStatus } from '@prisma/client';

describe('healthCheckService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
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
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'registry-id',
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
    });
    const minHealthCheckDate = new Date(Date.now() - 1000); // 1 second ago
    mockRegistryEntry.lastUptimeCheck = new Date(); // current time

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
      status: $Enums.Status.Offline,
      RegistrySource: {
        policyId: 'registry',
      },
    };
    mockRegistryEntry.lastUptimeCheck = new Date(Date.now() - 1000); // 1 second ago

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

    expect(result).toBe(InboxAgentRegistrationStatus.Pending);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://masumi-inbox-dev-ivi44.ondigitalocean.app/inbox-agent/public',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
      })
    );
  });

  it('should verify inbox agent registration when the public payload matches assetIdentifier', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          agentIdentifier: 'asset-123',
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

    expect(result).toBe(InboxAgentRegistrationStatus.Verified);
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

    expect(result).toBe(InboxAgentRegistrationStatus.Verified);
  });

  it('should invalidate inbox agent registration when a different agent identifier is returned', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          registration: {
            masumiAgentIdentifier: 'asset-999',
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

    expect(result).toBe(InboxAgentRegistrationStatus.Invalid);
  });

  it('should keep inbox agent registration pending when the payload has no identifier keys', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          slug: 'inbox-agent',
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

    expect(result).toBe(InboxAgentRegistrationStatus.Pending);
  });
});
