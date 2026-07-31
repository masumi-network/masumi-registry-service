import { $Enums } from '@prisma/client';
import { checkSpecEntry, specKindForType } from './spec-entry-check';
import { validateSpecUrl } from '@/services/spec-validation';

jest.mock('@/services/spec-validation', () => ({
  validateSpecUrl: jest.fn(),
}));

const mockValidateSpecUrl = validateSpecUrl as jest.MockedFunction<
  typeof validateSpecUrl
>;

// A Standard-shaped row; each test overrides only what it cares about.
function entry(overrides: Partial<Parameters<typeof checkSpecEntry>[0]> = {}) {
  return {
    type: $Enums.RegistryEntryType.Standard,
    openApiSpecUrl: null,
    x402ResourcesUrl: null,
    A2A: null,
    ...overrides,
  };
}

describe('specKindForType', () => {
  it('maps each spec-bearing type to its kind and Standard to null', () => {
    expect(specKindForType($Enums.RegistryEntryType.OpenApi)).toBe('openapi');
    expect(specKindForType($Enums.RegistryEntryType.X402)).toBe('x402');
    expect(specKindForType($Enums.RegistryEntryType.A2A)).toBe('a2a');
    expect(specKindForType($Enums.RegistryEntryType.Standard)).toBeNull();
  });
});

describe('checkSpecEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateSpecUrl.mockResolvedValue({
      outcome: 'valid',
      spec: { ok: true },
    });
  });

  it('validates an A2A entry against its agent card url, not another kind url', async () => {
    // Regression guard for the two-way ternary this code used to be: an A2A
    // entry would have read the (null) x402ResourcesUrl and been marked Invalid.
    const result = await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.A2A,
        A2A: {
          agentCardUrl: 'https://agent.example/.well-known/agent-card.json',
          protocolVersions: ['1.0'],
        },
        x402ResourcesUrl: null,
      })
    );
    expect(result.status).toBe($Enums.Status.Online);
    expect(mockValidateSpecUrl).toHaveBeenCalledWith(
      'a2a',
      'https://agent.example/.well-known/agent-card.json',
      { declaredProtocolVersions: ['1.0'] }
    );
  });

  it('passes the on-chain declared protocol versions through for cross-checking', async () => {
    await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.A2A,
        A2A: {
          agentCardUrl: 'https://agent.example/card.json',
          protocolVersions: ['1.0', '1.1'],
        },
      })
    );
    expect(mockValidateSpecUrl).toHaveBeenCalledWith(
      'a2a',
      'https://agent.example/card.json',
      { declaredProtocolVersions: ['1.0', '1.1'] }
    );
  });

  it('marks an A2A entry declaring no protocol versions Invalid without fetching', async () => {
    const result = await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.A2A,
        A2A: {
          agentCardUrl: 'https://agent.example/card.json',
          protocolVersions: [],
        },
      })
    );
    expect(result.status).toBe($Enums.Status.Invalid);
    expect(mockValidateSpecUrl).not.toHaveBeenCalled();
  });

  it('marks an A2A entry with no descriptor row Invalid without fetching', async () => {
    // Malformed on-chain metadata: type said a2aV1 but no agent_card_url was
    // advertised, so the sync created no descriptor.
    const result = await checkSpecEntry(
      entry({ type: $Enums.RegistryEntryType.A2A, A2A: null })
    );
    expect(result.status).toBe($Enums.Status.Invalid);
    expect(mockValidateSpecUrl).not.toHaveBeenCalled();
  });

  it('marks an A2A entry Invalid when the A2A relation was not included', async () => {
    // Guard for the satellite-table footgun: A2A is a Prisma relation, so a
    // query that forgets `include: { A2A: true }` yields null here. That must
    // fail closed (Invalid), never be mistaken for a healthy agent.
    const result = await checkSpecEntry(
      entry({ type: $Enums.RegistryEntryType.A2A, A2A: null })
    );
    expect(result.status).toBe($Enums.Status.Invalid);
  });

  it('still routes OpenApi and X402 to their own urls', async () => {
    await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.OpenApi,
        openApiSpecUrl: 'https://agent.example/openapi.json',
      })
    );
    expect(mockValidateSpecUrl).toHaveBeenCalledWith(
      'openapi',
      'https://agent.example/openapi.json',
      expect.anything()
    );

    mockValidateSpecUrl.mockClear();
    await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.X402,
        x402ResourcesUrl: 'https://agent.example/x402.json',
      })
    );
    expect(mockValidateSpecUrl).toHaveBeenCalledWith(
      'x402',
      'https://agent.example/x402.json',
      expect.anything()
    );
  });

  it('maps a failed A2A cross-check to Invalid and an outage to Offline', async () => {
    mockValidateSpecUrl.mockResolvedValueOnce({
      outcome: 'invalid',
      reason: 'agent card does not support declared protocol version(s): 9.9',
    });
    const invalid = await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.A2A,
        A2A: {
          agentCardUrl: 'https://agent.example/card.json',
          protocolVersions: ['9.9'],
        },
      })
    );
    expect(invalid.status).toBe($Enums.Status.Invalid);
    expect(invalid.spec).toBeUndefined();

    mockValidateSpecUrl.mockResolvedValueOnce({
      outcome: 'unreachable',
      reason: 'HTTP 503',
    });
    const offline = await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.A2A,
        A2A: {
          agentCardUrl: 'https://agent.example/card.json',
          protocolVersions: ['1.0'],
        },
      })
    );
    expect(offline.status).toBe($Enums.Status.Offline);
    expect(offline.spec).toBeUndefined();
  });

  it('caches a validated agent card so the spec endpoint can serve it', async () => {
    const card = { protocolVersions: ['1.0'], name: 'A' };
    mockValidateSpecUrl.mockResolvedValueOnce({ outcome: 'valid', spec: card });
    const result = await checkSpecEntry(
      entry({
        type: $Enums.RegistryEntryType.A2A,
        A2A: {
          agentCardUrl: 'https://agent.example/card.json',
          protocolVersions: ['1.0'],
        },
      })
    );
    expect(result.status).toBe($Enums.Status.Online);
    expect(result.spec).toEqual(card);
  });

  it('marks a Standard entry Invalid (it has no fetchable spec)', async () => {
    const result = await checkSpecEntry(entry());
    expect(result.status).toBe($Enums.Status.Invalid);
    expect(mockValidateSpecUrl).not.toHaveBeenCalled();
  });
});
