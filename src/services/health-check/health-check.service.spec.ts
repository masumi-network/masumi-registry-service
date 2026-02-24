import { healthCheckService } from './health-check.service';
import { $Enums } from '@prisma/client';

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
            type: $Enums.RegistryEntryType.Web3CardanoV1,
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
            type: $Enums.RegistryEntryType.Web3CardanoV1,
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

  // ─── MIP-001 entries (existing behaviour, unchanged) ──────────────────────

  it('should return existing status if lastUptimeCheck is newer than minHealthCheckDate', async () => {
    const mockRegistryEntry = {
      assetIdentifier: 'test-id',
      lastUptimeCheck: new Date(),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 1,
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'registry-id',
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    const minHealthCheckDate = new Date(Date.now() - 1000);

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockRegistryEntry,
      minHealthCheckDate,
    });

    expect(result).toBe(mockRegistryEntry.status);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should check endpoint if lastUptimeCheck is older than minHealthCheckDate', async () => {
    const minHealthCheckDate = new Date();
    const mockRegistryEntry = {
      assetIdentifier: 'registry-assetname',
      lastUptimeCheck: new Date(Date.now() - 1000),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 1,
      status: $Enums.Status.Offline,
      RegistrySource: {
        policyId: 'registry',
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          agentIdentifier: 'registry-assetname',
          type: $Enums.RegistryEntryType.Web3CardanoV1,
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
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

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
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockRegistryEntry,
      minHealthCheckDate: new Date(),
    });

    expect(result).toBe($Enums.Status.Offline);
  });

  // ─── MIP-002 entries (A2A branch) ─────────────────────────────────────────

  const validAgentCard = {
    protocolVersions: ['1.0'],
    name: 'Test A2A Agent',
    description: 'An A2A agent',
    version: '1.0.0',
    supportedInterfaces: [
      {
        url: 'https://a2a.example.com',
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      },
    ],
    capabilities: {},
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [
      {
        id: 'skill-1',
        name: 'Search',
        description: 'Searches',
        tags: [],
        inputModes: ['text'],
        outputModes: ['text'],
      },
    ],
  };

  it('should use checkA2AAgentCard for MIP-002 entries (metadataVersion=2)', async () => {
    const mockA2AEntry = {
      assetIdentifier: 'a2a-asset-123',
      lastUptimeCheck: new Date(Date.now() - 1000),
      apiBaseUrl: 'https://a2a.example.com',
      agentCardUrl: 'https://a2a.example.com/.well-known/agent.json',
      metadataVersion: 2,
      status: $Enums.Status.Offline,
      RegistrySource: {
        policyId: 'policy-123',
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validAgentCard),
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockA2AEntry,
      minHealthCheckDate: new Date(),
    });

    expect(result).toBe($Enums.Status.Online);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://a2a.example.com/.well-known/agent.json',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('should return Offline for MIP-002 entry when agent card URL is unreachable', async () => {
    const mockA2AEntry = {
      assetIdentifier: 'a2a-asset-123',
      lastUptimeCheck: new Date(Date.now() - 1000),
      apiBaseUrl: 'https://a2a.example.com',
      agentCardUrl: 'https://a2a.example.com/.well-known/agent.json',
      metadataVersion: 2,
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'policy-123',
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve(''),
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockA2AEntry,
      minHealthCheckDate: new Date(),
    });

    expect(result).toBe($Enums.Status.Offline);
  });

  it('should return Invalid for MIP-002 entry when agent card JSON fails schema validation', async () => {
    const mockA2AEntry = {
      assetIdentifier: 'a2a-asset-123',
      lastUptimeCheck: new Date(Date.now() - 1000),
      apiBaseUrl: 'https://a2a.example.com',
      agentCardUrl: 'https://a2a.example.com/.well-known/agent.json',
      metadataVersion: 2,
      status: $Enums.Status.Online,
      RegistrySource: {
        policyId: 'policy-123',
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ not: 'a valid agent card' }),
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockA2AEntry,
      minHealthCheckDate: new Date(),
    });

    expect(result).toBe($Enums.Status.Invalid);
  });

  it('should still use MIP-001 path for metadataVersion=2 when agentCardUrl is null', async () => {
    // Fallback: if agentCardUrl is somehow null on a v2 entry, fall through to MIP-001 check
    const mockEntry = {
      assetIdentifier: 'a2a-asset-no-url',
      lastUptimeCheck: new Date(Date.now() - 1000),
      apiBaseUrl: 'http://test.com',
      agentCardUrl: null,
      metadataVersion: 2,
      status: $Enums.Status.Offline,
      RegistrySource: {
        policyId: 'policy-123',
        type: $Enums.RegistryEntryType.Web3CardanoV1,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          agentIdentifier: 'a2a-asset-no-url',
          type: $Enums.RegistryEntryType.Web3CardanoV1,
        }),
    });

    const result = await healthCheckService.checkAndVerifyRegistryEntry({
      registryEntry: mockEntry,
      minHealthCheckDate: new Date(),
    });

    expect(result).toBe($Enums.Status.Online);
  });
});

describe('checkA2AAgentCard', () => {
  const mockAgentCardUrl = 'https://a2a.example.com/.well-known/agent.json';

  const validAgentCard = {
    protocolVersions: ['1.0'],
    name: 'Test A2A Agent',
    description: 'An A2A agent',
    version: '1.0.0',
    supportedInterfaces: [
      {
        url: 'https://a2a.example.com',
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      },
    ],
    capabilities: {},
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [
      {
        id: 'skill-1',
        name: 'Search',
        description: 'Searches',
        tags: [],
        inputModes: ['text'],
        outputModes: ['text'],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should return Online when agent card URL returns a valid agent card', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validAgentCard),
    });

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.status).toBe($Enums.Status.Online);
    expect(result.returnedAgentIdentifier).toBeNull();
  });

  it('should return Offline when the agent card URL responds with a non-ok status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Not Found'),
    });

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.status).toBe($Enums.Status.Offline);
    expect(result.returnedAgentIdentifier).toBeNull();
  });

  it('should return Invalid when the response JSON does not match agentCardSchema', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ foo: 'bar' }),
    });

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.status).toBe($Enums.Status.Invalid);
  });

  it('should return Invalid when agent card is missing required skills array', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { skills, ...cardWithoutSkills } = validAgentCard;
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(cardWithoutSkills),
    });

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.status).toBe($Enums.Status.Invalid);
  });

  it('should return Invalid when agent card has empty skills array (min 1 required)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...validAgentCard, skills: [] }),
    });

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.status).toBe($Enums.Status.Invalid);
  });

  it('should return Offline when a network error occurs', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('ECONNREFUSED')
    );

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.status).toBe($Enums.Status.Offline);
  });

  it('should return Invalid for a localhost agent card URL', async () => {
    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: 'http://localhost:3000/agent.json',
    });

    expect(result.status).toBe($Enums.Status.Invalid);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return Invalid for a 127.0.0.1 agent card URL', async () => {
    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: 'http://127.0.0.1/agent.json',
    });

    expect(result.status).toBe($Enums.Status.Invalid);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return Invalid for a non-http/https protocol', async () => {
    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: 'ftp://example.com/agent.json',
    });

    expect(result.status).toBe($Enums.Status.Invalid);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should always return returnedAgentIdentifier as null (A2A has no identifier mechanism)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validAgentCard),
    });

    const result = await healthCheckService.checkA2AAgentCard({
      agent_card_url: mockAgentCardUrl,
    });

    expect(result.returnedAgentIdentifier).toBeNull();
  });
});
