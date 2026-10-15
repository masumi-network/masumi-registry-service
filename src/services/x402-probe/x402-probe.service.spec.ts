import { x402ProbeRepository } from '@/repositories/x402-probe';
import { pinnedGet } from '@/utils/pinned-fetch';
import {
  X402_PROBE_ENTRY_PAGE_SIZE,
  getAgentX402Probes,
  updateX402Probes,
} from './x402-probe.service';

jest.mock('@/repositories/x402-probe', () => ({
  x402ProbeRepository: {
    listProbeableEntries: jest.fn(),
    getProbeTimes: jest.fn(),
    getEntriesWithSources: jest.fn(),
    deleteProbes: jest.fn(),
    saveProbe: jest.fn(),
    getProbesByIdentifier: jest.fn(),
  },
}));
jest.mock('@/utils/pinned-fetch', () => ({ pinnedGet: jest.fn() }));

const repo = x402ProbeRepository as jest.Mocked<typeof x402ProbeRepository>;
const get = pinnedGet as jest.Mock;

const BASE = 'eip155:8453';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAY_TO = '0x9f86b5b01d584e2ef5ac2c7a60f3e5164d548881';
const R1 = 'https://a.example/v1/summarize';
const R2 = 'https://a.example/v1/translate';

const challengeHeader = (overrides: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: 'exact',
          network: BASE,
          amount: '80000',
          asset: USDC,
          payTo: PAY_TO,
          ...overrides,
        },
      ],
    })
  ).toString('base64');

const payable = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  status: 402,
  headers: { 'payment-required': challengeHeader(overrides) },
  body: '',
});

const manifest = (...resources: Array<string | [string, string]>) => ({
  x402Version: 2,
  resources: resources.map((entry) =>
    typeof entry === 'string'
      ? { resource: entry }
      : { resource: entry[0], type: entry[1] }
  ),
});

const fixedSource = {
  chain: 'EVM',
  network: BASE,
  scheme: 'Exact',
  payTo: PAY_TO,
  resource: null,
  dynamicAsset: null,
  Pricing: {
    pricingType: 'Fixed' as const,
    FixedPricing: { Amounts: [{ unit: USDC, amount: 80000n }] },
  },
};

function pageOf(entries: Array<{ id: string; spec: unknown }>) {
  return entries.map((entry) => ({
    id: entry.id,
    spec: entry.spec as never,
  }));
}

function givenEntries(entries: Array<{ id: string; spec: unknown }>) {
  repo.listProbeableEntries
    .mockResolvedValueOnce(pageOf(entries))
    .mockResolvedValue([]);
  repo.getEntriesWithSources.mockResolvedValue(
    entries.map((entry) => ({
      id: entry.id,
      SupportedPaymentSources: [fixedSource],
    })) as never
  );
}

const saved = () =>
  repo.saveProbe.mock.calls.map(([entryId, record]) => ({
    entryId,
    ...record,
  }));

describe('updateX402Probes', () => {
  beforeEach(() => {
    // Not clearAllMocks: queued once-values of an unused mock must not leak
    // into the next test.
    jest.resetAllMocks();
    repo.getProbeTimes.mockResolvedValue([]);
    repo.saveProbe.mockResolvedValue({} as never);
    repo.deleteProbes.mockResolvedValue({ count: 0 });
  });

  it('records a payable resource that agrees with the registered source', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    get.mockResolvedValue(payable());

    const summary = await updateX402Probes();

    expect(get).toHaveBeenCalledWith(R1);
    expect(summary).toEqual({ probed: 1 });
    expect(saved()).toEqual([
      expect.objectContaining({
        entryId: 'e1',
        resource: R1,
        outcome: 'Payable',
        httpStatus: 402,
        x402Version: 2,
        matchesRegisteredSources: true,
        mismatches: [],
        accepts: [expect.objectContaining({ network: BASE, amount: '80000' })],
      }),
    ]);
  });

  it('records the fields on which a live challenge differs', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    get.mockResolvedValue(payable({ amount: '99' }));

    await updateX402Probes();

    expect(saved()[0]).toMatchObject({
      outcome: 'Payable',
      matchesRegisteredSources: false,
      mismatches: ['amount: resource requires 99, registered 80000'],
    });
  });

  it('never probes mcp resources', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1, [R2, 'mcp']) }]);
    get.mockResolvedValue(payable());

    await updateX402Probes();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(R1);
  });

  it.each([
    [
      'a network failure',
      { ok: false, reason: 'request timed out', unreachable: true },
      { outcome: 'Unreachable', reason: 'request timed out' },
    ],
    [
      'a refused destination',
      { ok: false, reason: 'URL must use https', unreachable: false },
      { outcome: 'Invalid', reason: 'URL must use https' },
    ],
    [
      'a 402 without a challenge',
      { ok: true, status: 402, headers: {}, body: 'pay' },
      { outcome: 'Invalid', httpStatus: 402 },
    ],
    [
      'a 405',
      { ok: true, status: 405, headers: {}, body: '' },
      { outcome: 'Unsupported', httpStatus: 405 },
    ],
    [
      'a 404 (a POST-only route answers GET that way)',
      { ok: true, status: 404, headers: {}, body: '' },
      { outcome: 'Unsupported', httpStatus: 404 },
    ],
    [
      'a 503',
      { ok: true, status: 503, headers: {}, body: '' },
      { outcome: 'Unreachable', httpStatus: 503, reason: 'HTTP 503' },
    ],
  ])('records %s', async (_label, response, expected) => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    get.mockResolvedValue(response);

    await updateX402Probes();

    expect(saved()[0]).toMatchObject({
      ...expected,
      matchesRegisteredSources: null,
    });
  });

  it('truncates an error reason so it always fits the row', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    get.mockResolvedValue({
      ok: false,
      reason: 'x'.repeat(5000),
      unreachable: true,
    });

    await updateX402Probes();

    expect(saved()[0].reason).toHaveLength(500);
  });

  it('flags a resource that answers for free against a priced source', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    get.mockResolvedValue({ ok: true, status: 200, headers: {}, body: '' });

    await updateX402Probes();

    expect(saved()[0]).toMatchObject({
      outcome: 'Free',
      matchesRegisteredSources: false,
    });
  });

  it('skips an entry whose manifest is not cached, and keeps its rows', async () => {
    // Manifests too large to cache have spec = null. They are not fetched here:
    // the probe never contacts an agent-supplied manifest URL itself.
    givenEntries([{ id: 'e1', spec: null }]);
    repo.getProbeTimes.mockResolvedValue([
      { registryEntryId: 'e1', resource: R1, checkedAt: new Date() },
    ]);

    await updateX402Probes();

    expect(get).not.toHaveBeenCalled();
    expect(repo.deleteProbes).not.toHaveBeenCalled();
  });

  it('forgets resources that left the manifest', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    repo.getProbeTimes.mockResolvedValue([
      { registryEntryId: 'e1', resource: R2, checkedAt: new Date() },
    ]);
    get.mockResolvedValue(payable());

    await updateX402Probes();

    expect(repo.deleteProbes).toHaveBeenCalledWith('e1', [R2]);
  });

  it('tracks at most 100 distinct resources per entry and forgets the rest', async () => {
    const resources = Array.from(
      { length: 150 },
      (_, index) => `https://a.example/r/${index}`
    );
    givenEntries([{ id: 'e1', spec: manifest(...resources) }]);
    repo.getProbeTimes.mockResolvedValue([
      {
        registryEntryId: 'e1',
        resource: resources[120],
        checkedAt: new Date(),
      },
    ]);
    get.mockResolvedValue(payable());

    const summary = await updateX402Probes();

    expect(repo.deleteProbes).toHaveBeenCalledWith('e1', [resources[120]]);
    expect(summary.probed).toBe(25);
    expect(
      saved().every((record) => resources.indexOf(record.resource) < 100)
    ).toBe(true);
  });

  it('probes equivalent URLs once and skips ones it cannot store', async () => {
    givenEntries([
      {
        id: 'e1',
        spec: manifest(
          R1,
          `${R1}#section`,
          'HTTPS://A.EXAMPLE/v1/summarize',
          'https://a.example/v1/\tsummarize2',
          `https://a.example/${'x'.repeat(2100)}`,
          R2
        ),
      },
    ]);
    get.mockResolvedValue(payable());

    await updateX402Probes();

    expect(get.mock.calls.map(([url]) => url).sort()).toEqual([R1, R2].sort());
  });

  it('keeps probing the rest when one probe throws', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1, R2) }]);
    get.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(payable());

    await updateX402Probes();

    expect(
      saved()
        .map((record) => record.outcome)
        .sort()
    ).toEqual(['Payable', 'Unreachable']);
  });

  it('stops starting probes once the cycle budget is spent', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1, R2) }]);
    get.mockResolvedValue(payable());

    const summary = await updateX402Probes({ budgetMs: 0 });

    expect(get).not.toHaveBeenCalled();
    expect(summary).toEqual({ probed: 0 });
  });

  it('stops starting probes when asked to stop', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1, R2) }]);
    get.mockResolvedValue(payable());

    const summary = await updateX402Probes({ shouldStop: () => true });

    expect(get).not.toHaveBeenCalled();
    expect(summary).toEqual({ probed: 0 });
  });

  it('continues with other entries when saving one fails', async () => {
    givenEntries([
      { id: 'e1', spec: manifest(R1) },
      { id: 'e2', spec: manifest(R2) },
    ]);
    get.mockResolvedValue(payable());
    repo.saveProbe.mockRejectedValue(new Error('db down'));

    await expect(updateX402Probes()).resolves.toEqual({ probed: 2 });
  });

  it('stores a minimal Invalid row when a result cannot be stored, so the resource rotates', async () => {
    givenEntries([{ id: 'e1', spec: manifest(R1) }]);
    get.mockResolvedValue(payable());
    repo.saveProbe.mockRejectedValueOnce(new Error('invalid byte sequence'));

    await updateX402Probes();

    expect(repo.saveProbe).toHaveBeenCalledTimes(2);
    expect(repo.saveProbe.mock.calls[1][1]).toMatchObject({
      resource: R1,
      outcome: 'Invalid',
      reason: 'result could not be stored',
      accepts: null,
      mismatches: [],
    });
  });

  it('reads every page of entries, resuming after the last id', async () => {
    const first = Array.from(
      { length: X402_PROBE_ENTRY_PAGE_SIZE },
      (_, index) => ({ id: `e${index}`, spec: manifest() })
    );
    repo.listProbeableEntries
      .mockResolvedValueOnce(pageOf(first))
      .mockResolvedValueOnce(pageOf([{ id: 'last', spec: manifest(R1) }]));
    repo.getEntriesWithSources.mockResolvedValue([
      { id: 'last', SupportedPaymentSources: [fixedSource] },
    ] as never);
    get.mockResolvedValue(payable());

    await updateX402Probes();

    expect(repo.listProbeableEntries).toHaveBeenNthCalledWith(2, {
      afterId: `e${X402_PROBE_ENTRY_PAGE_SIZE - 1}`,
      take: X402_PROBE_ENTRY_PAGE_SIZE,
    });
    expect(get).toHaveBeenCalledWith(R1);
  });
});

describe('getAgentX402Probes', () => {
  const params = {
    network: 'Preprod' as const,
    agentIdentifier: 'asset1',
  };
  const probeRow = {
    resource: R1,
    outcome: 'Payable' as const,
    httpStatus: 402,
    x402Version: 2,
    accepts: [{ scheme: 'exact', network: BASE }],
    matchesRegisteredSources: true,
    mismatches: [],
    reason: null,
    checkedAt: new Date(0),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns null for an unknown agent', async () => {
    repo.getProbesByIdentifier.mockResolvedValue(null);

    await expect(getAgentX402Probes(params)).resolves.toBeNull();
  });

  it('returns null for an entry that is not an x402 agent', async () => {
    repo.getProbesByIdentifier.mockResolvedValue({
      type: 'Standard',
      status: 'Online',
      X402ResourceProbes: [],
    } as never);

    await expect(getAgentX402Probes(params)).resolves.toBeNull();
  });

  it('returns the entry status with its probed resources', async () => {
    repo.getProbesByIdentifier.mockResolvedValue({
      type: 'X402',
      status: 'Online',
      X402ResourceProbes: [probeRow],
    } as never);

    await expect(getAgentX402Probes(params)).resolves.toEqual({
      agentIdentifier: 'asset1',
      status: 'Online',
      resources: [probeRow],
    });
  });
});
