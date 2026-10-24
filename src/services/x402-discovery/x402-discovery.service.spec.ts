import { x402DiscoveryRepository } from '@/repositories/x402-discovery';
import { pinnedGet } from '@/utils/pinned-fetch';

jest.mock('@/repositories/x402-discovery', () => ({
  x402DiscoveryRepository: { findRegisteredByPayTo: jest.fn() },
}));
jest.mock('@/utils/pinned-fetch', () => ({ pinnedGet: jest.fn() }));
jest.mock('@/utils/config', () => ({
  CONFIG: {
    X402_DISCOVERY_FACILITATOR_URL: 'https://facilitator.example/v2/x402',
  },
}));

type Service = typeof import('./x402-discovery.service');

const repo = x402DiscoveryRepository as jest.Mocked<
  typeof x402DiscoveryRepository
>;
const get = pinnedGet as jest.Mock;

const PAY_TO = '0x589a2314a2E05F45e40C4823Da3Ba58D421dB3d8';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const item = (resource: string, overrides: Record<string, unknown> = {}) => ({
  resource,
  type: 'http',
  x402Version: 2,
  description: `desc ${resource}`,
  serviceName: 'Svc',
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '5000',
      asset: USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
      extra: { name: 'USD Coin', version: '2' },
    },
  ],
  extensions: { bazaar: { info: { input: { method: 'GET', type: 'http' } } } },
  ...overrides,
});

const page = (
  items: unknown[],
  total: number | null = items.length,
  key: 'resources' | 'items' = 'resources'
) => ({
  ok: true,
  status: 200,
  headers: {},
  body: JSON.stringify({
    x402Version: 2,
    payTo: PAY_TO,
    [key]: items,
    ...(total == null ? {} : { pagination: { limit: 100, offset: 0, total } }),
  }),
});

// A fresh module per test: the service keeps a cache in module state.
function load(): Service {
  let service!: Service;
  jest.isolateModules(() => {
    service = jest.requireActual<Service>('./x402-discovery.service');
  });
  return service;
}

describe('discoverX402ByPayTo', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    repo.findRegisteredByPayTo.mockResolvedValue([]);
  });

  it('asks the configured facilitator for the address and groups by host', async () => {
    get.mockResolvedValueOnce(
      page([
        item('https://a.example/one'),
        item('https://a.example/two'),
        item('https://b.example/x'),
      ])
    );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(String(get.mock.calls[0][0])).toBe(
      `https://facilitator.example/v2/x402/discovery/merchant?payTo=${PAY_TO.toLowerCase()}&limit=100&offset=0`
    );
    expect(result.payTo).toBe(PAY_TO.toLowerCase());
    expect(result.truncated).toBe(false);
    expect(
      result.candidates.map((c) => [
        c.host,
        c.resources.length,
        c.manifestValid,
      ])
    ).toEqual([
      ['a.example', 2, true],
      ['b.example', 1, true],
    ]);
    expect(result.candidates[0].suggestedManifest?.resources[0]).toMatchObject({
      resource: 'https://a.example/one',
      type: 'http',
    });
  });

  it('follows pagination up to the total and flags a truncated catalog', async () => {
    get
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 100 }, (_, i) => item(`https://a.example/${i}`)),
          450
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 100 }, (_, i) =>
            item(`https://a.example/${100 + i}`)
          ),
          450
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 100 }, (_, i) =>
            item(`https://a.example/${200 + i}`)
          ),
          450
        )
      );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(get).toHaveBeenCalledTimes(3);
    expect(String(get.mock.calls[2][0])).toContain('offset=200');
    expect(result.truncated).toBe(true);
    expect(result.candidates[0].resources).toHaveLength(300);
  });

  it('returns no candidates for an address the catalog does not know', async () => {
    get.mockResolvedValueOnce(page([], 0));

    await expect(
      load().discoverX402ByPayTo({ payTo: PAY_TO })
    ).resolves.toMatchObject({ candidates: [], truncated: false });
  });

  it('reads the items key some facilitators use', async () => {
    get.mockResolvedValueOnce(page([item('https://a.example/x')], 1, 'items'));

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates).toHaveLength(1);
  });

  it('skips malformed items instead of failing the lookup', async () => {
    get.mockResolvedValueOnce(
      page([item('https://a.example/ok'), { resource: 'nope' }, 'x', null])
    );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].resources).toHaveLength(1);
  });

  it.each([
    [
      'an unreachable facilitator',
      { ok: false, reason: 'timed out', unreachable: true },
    ],
    ['an error status', { ok: true, status: 503, headers: {}, body: '' }],
    [
      'a body that is not JSON',
      { ok: true, status: 200, headers: {}, body: '<html>' },
    ],
    [
      'a body without a resource list',
      { ok: true, status: 200, headers: {}, body: '{"nope":1}' },
    ],
  ])('fails with a discovery error on %s', async (_label, response) => {
    get.mockResolvedValueOnce(response);
    const service = load();

    await expect(
      service.discoverX402ByPayTo({ payTo: PAY_TO })
    ).rejects.toBeInstanceOf(service.X402DiscoveryError);
  });

  it('keeps only resources payable on the requested network', async () => {
    get.mockResolvedValueOnce(
      page([
        item('https://a.example/base'),
        item('https://a.example/other', {
          accepts: [{ ...item('x').accepts[0], network: 'eip155:137' }],
        }),
      ])
    );

    const result = await load().discoverX402ByPayTo({
      payTo: PAY_TO,
      caip2Network: 'eip155:8453',
    });

    expect(result.candidates[0].resources.map((r) => r.resource)).toEqual([
      'https://a.example/base',
    ]);
  });

  it('flags candidates whose resources an X402 entry already lists', async () => {
    get.mockResolvedValueOnce(
      page([item('https://a.example/one'), item('https://b.example/x')])
    );
    repo.findRegisteredByPayTo.mockResolvedValue([
      {
        assetIdentifier: 'asset1',
        status: 'Online',
        RegistrySource: { network: 'Mainnet' },
        spec: { resources: [{ resource: 'https://a.example/one' }] },
      },
    ] as never);

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(repo.findRegisteredByPayTo).toHaveBeenCalledWith(
      PAY_TO.toLowerCase()
    );
    expect(result.registeredEntries).toEqual([
      { assetIdentifier: 'asset1', network: 'Mainnet', status: 'Online' },
    ]);
    expect(
      Object.fromEntries(result.candidates.map((c) => [c.host, c.registered]))
    ).toEqual({ 'a.example': true, 'b.example': false });
  });

  it('drops accepts that pay someone else, and resources left with none', async () => {
    get.mockResolvedValueOnce(
      page([
        item('https://a.example/mine'),
        item('https://a.example/theirs', {
          accepts: [
            {
              ...item('x').accepts[0],
              payTo: '0x1111111111111111111111111111111111111111',
            },
          ],
        }),
      ])
    );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].resources.map((r) => r.resource)).toEqual([
      'https://a.example/mine',
    ]);
  });

  it('survives a catalog schema in an unknown dialect', async () => {
    get.mockResolvedValueOnce(
      page([
        item('https://a.example/one', {
          inputSchema: {
            $schema: 'https://json-schema.org/draft/2019-09/schema',
          },
        }),
      ])
    );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].manifestValid).toBe(true);
  });

  it('coalesces concurrent lookups of one address into one upstream call', async () => {
    get.mockResolvedValue(page([item('https://a.example/one')]));
    const service = load();

    await Promise.all([
      service.discoverX402ByPayTo({ payTo: PAY_TO }),
      service.discoverX402ByPayTo({ payTo: PAY_TO }),
      service.discoverX402ByPayTo({ payTo: PAY_TO }),
    ]);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('remembers a failure briefly instead of hammering a struggling facilitator', async () => {
    get.mockResolvedValue({ ok: false, reason: 'down', unreachable: true });
    const service = load();

    await expect(
      service.discoverX402ByPayTo({ payTo: PAY_TO })
    ).rejects.toBeInstanceOf(service.X402DiscoveryError);
    await expect(
      service.discoverX402ByPayTo({ payTo: PAY_TO })
    ).rejects.toBeInstanceOf(service.X402DiscoveryError);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('refuses more uncached lookups per minute than the facilitator should see', async () => {
    get.mockResolvedValue(page([]));
    const service = load();
    const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

    for (let n = 1; n <= 60; n += 1) {
      await service.discoverX402ByPayTo({ payTo: address(n) });
    }

    await expect(
      service.discoverX402ByPayTo({ payTo: address(61) })
    ).rejects.toBeInstanceOf(service.X402DiscoveryBusyError);
    // A recently cached address is still served without a lookup.
    await expect(
      service.discoverX402ByPayTo({ payTo: address(60) })
    ).resolves.toMatchObject({ candidates: [] });
  });

  it('reads no more than a page from a facilitator that ignores the limit', async () => {
    get
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 250 }, (_, i) => item(`https://a.example/${i}`)),
          250
        )
      )
      .mockResolvedValueOnce(page([], 250));

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].resources).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it('advances by the items it received when the facilitator clamps the page size', async () => {
    get
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, i) => item(`https://a.example/${i}`)),
          30
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 10 }, (_, i) =>
            item(`https://a.example/${20 + i}`)
          ),
          30
        )
      );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(String(get.mock.calls[1][0])).toContain('offset=20');
    expect(result.candidates[0].resources).toHaveLength(30);
    expect(result.truncated).toBe(false);
  });

  it('keeps paging a full page when the facilitator reports no total', async () => {
    get
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 100 }, (_, i) => item(`https://a.example/${i}`)),
          null
        )
      )
      .mockResolvedValueOnce(page([item('https://a.example/last')], null));

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(get).toHaveBeenCalledTimes(2);
    expect(result.candidates[0].resources).toHaveLength(101);
    expect(result.truncated).toBe(false);
  });

  it('lists a resource once even when pages overlap', async () => {
    get.mockResolvedValueOnce(
      page([item('https://a.example/one'), item('https://a.example/one#x')])
    );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].resources).toHaveLength(1);
  });

  it('matches a registered manifest despite host case, default port and fragment', async () => {
    get.mockResolvedValueOnce(page([item('https://a.example/one')]));
    repo.findRegisteredByPayTo.mockResolvedValue([
      {
        assetIdentifier: 'asset1',
        status: 'Online',
        RegistrySource: { network: 'Mainnet' },
        spec: { resources: [{ resource: 'HTTPS://A.EXAMPLE:443/one#frag' }] },
      },
    ] as never);

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].registered).toBe(true);
  });

  it('serves a repeated lookup from cache but still reads registrations fresh', async () => {
    get.mockResolvedValue(page([item('https://a.example/one')]));
    const service = load();

    await service.discoverX402ByPayTo({ payTo: PAY_TO });
    await service.discoverX402ByPayTo({ payTo: PAY_TO.toLowerCase() });

    expect(get).toHaveBeenCalledTimes(1);
    expect(repo.findRegisteredByPayTo).toHaveBeenCalledTimes(2);
  });

  it('drops a schema the registry would reject rather than suggesting a bad manifest', async () => {
    get.mockResolvedValueOnce(
      page([
        item('https://a.example/one', {
          inputSchema: { type: 'not-a-json-schema-type' },
        }),
      ])
    );

    const result = await load().discoverX402ByPayTo({ payTo: PAY_TO });

    expect(result.candidates[0].manifestValid).toBe(true);
    expect(
      result.candidates[0].suggestedManifest?.resources[0]
    ).not.toHaveProperty('inputSchema');
  });
});
