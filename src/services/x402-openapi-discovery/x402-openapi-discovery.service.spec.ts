import { x402OpenApiDiscoveryRepository } from '@/repositories/x402-openapi-discovery';
import { x402ProbeRepository } from '@/repositories/x402-probe';
import { pinnedGet } from '@/utils/pinned-fetch';
import {
  getAgentX402OpenApi,
  updateX402OpenApiDiscoveries,
} from './x402-openapi-discovery.service';

jest.mock('@/repositories/x402-openapi-discovery', () => ({
  x402OpenApiDiscoveryRepository: {
    getDiscoveryTimes: jest.fn(),
    deleteDiscoveries: jest.fn(),
    saveDiscovery: jest.fn(),
    getDiscoveriesByIdentifier: jest.fn(),
  },
}));
jest.mock('@/repositories/x402-probe', () => ({
  x402ProbeRepository: { listProbeableEntries: jest.fn() },
}));
jest.mock('@/utils/pinned-fetch', () => ({ pinnedGet: jest.fn() }));

const repo = x402OpenApiDiscoveryRepository as jest.Mocked<
  typeof x402OpenApiDiscoveryRepository
>;
const probeRepo = x402ProbeRepository as jest.Mocked<
  typeof x402ProbeRepository
>;
const get = pinnedGet as jest.Mock;

const ORIGIN = 'https://a.example';
const DOC = {
  openapi: '3.1.0',
  info: { title: 'Summarizer', version: '1.2.0' },
  paths: { '/v1/summarize': {} },
};

const manifest = (...resources: string[]) => ({
  x402Version: 2,
  resources: resources.map((resource) => ({ resource })),
});

const json = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: {},
  body: JSON.stringify(body),
});
const status = (code: number, headers: Record<string, string> = {}) => ({
  ok: true,
  status: code,
  headers,
  body: '',
});
const down = (reason = 'connect ECONNREFUSED') => ({
  ok: false,
  reason,
  unreachable: true,
});

// Answers by URL; anything not listed is a 404.
function givenServer(routes: Record<string, unknown>) {
  get.mockImplementation(async (url: string) => routes[url] ?? status(404));
}

function givenEntries(entries: Array<{ id: string; spec: unknown }>) {
  probeRepo.listProbeableEntries
    .mockResolvedValueOnce(entries as never)
    .mockResolvedValue([]);
}

const saved = () =>
  repo.saveDiscovery.mock.calls.map(([entryId, record]) => ({
    entryId,
    ...record,
  }));
const requested = () => get.mock.calls.map(([url]) => url as string);

describe('updateX402OpenApiDiscoveries', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    repo.getDiscoveryTimes.mockResolvedValue([]);
    repo.saveDiscovery.mockResolvedValue({} as never);
    repo.deleteDiscoveries.mockResolvedValue({ count: 0 });
  });

  it('records the document found at a well-known path', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/v1/summarize`) }]);
    givenServer({ [`${ORIGIN}/openapi.json`]: json(DOC) });

    await updateX402OpenApiDiscoveries();

    expect(saved()).toEqual([
      expect.objectContaining({
        entryId: 'e1',
        origin: ORIGIN,
        outcome: 'Found',
        specUrl: `${ORIGIN}/openapi.json`,
        openApiVersion: '3.1.0',
        title: 'Summarizer',
        spec: DOC,
        reason: null,
      }),
    ]);
  });

  it('asks only for a 200 body, as json or yaml', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({ [`${ORIGIN}/openapi.json`]: json(DOC) });

    await updateX402OpenApiDiscoveries();

    const [, options] = get.mock.calls.find(
      ([url]) => url === `${ORIGIN}/openapi.json`
    )!;
    expect(options.readBodyFor).toEqual([200]);
    expect(options.accept).toContain('application/yaml');
  });

  it('tries the document the origin advertises in a Link header first', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/`]: status(200, {
        link: '</spec/v1.json>; rel="service-desc"',
      }),
      [`${ORIGIN}/spec/v1.json`]: json(DOC),
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Found',
      specUrl: `${ORIGIN}/spec/v1.json`,
    });
    expect(requested()).not.toContain(`${ORIGIN}/openapi.json`);
  });

  it('moves past a path that does not serve a document', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({ [`${ORIGIN}/.well-known/openapi.json`]: json(DOC) });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Found',
      specUrl: `${ORIGIN}/.well-known/openapi.json`,
    });
  });

  it('keeps looking after a 200 that is not an OpenAPI document', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: {
        ok: true,
        status: 200,
        headers: {},
        body: '<!doctype html><html></html>',
      },
      [`${ORIGIN}/openapi.yaml`]: json(DOC),
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Found',
      specUrl: `${ORIGIN}/openapi.yaml`,
    });
  });

  it('is Invalid when something answered but nothing was a document', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: json({ hello: 'world' }),
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Invalid',
      specUrl: null,
      spec: null,
      reason: expect.stringContaining('not a valid OpenAPI document'),
    });
  });

  it('is NotFound when no candidate served a document', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({});

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({ outcome: 'NotFound', reason: null });
  });

  it('gives up on an origin that cannot be reached after one request', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    get.mockResolvedValue(down());

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Unreachable',
      reason: 'connect ECONNREFUSED',
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('still finds a later document after one candidate fails to answer', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: down('request timed out'),
      [`${ORIGIN}/.well-known/openapi.json`]: json(DOC),
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Found',
      specUrl: `${ORIGIN}/.well-known/openapi.json`,
    });
  });

  it('stops after two candidates fail to answer and reports Unreachable', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: down('request timed out'),
      [`${ORIGIN}/.well-known/openapi.json`]: down('request timed out'),
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Unreachable',
      reason: 'request timed out',
    });
    // The root and the two candidates that failed.
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('keeps an invalid document over a candidate that failed to answer', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: json({ hello: 'world' }),
      [`${ORIGIN}/.well-known/openapi.json`]: down(),
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({ outcome: 'Invalid' });
  });

  it('records a URL the fetcher refuses as Invalid with the reason', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    get.mockResolvedValue({
      ok: false,
      reason: 'URL resolves to a non-public address',
      unreachable: false,
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Invalid',
      reason: 'URL resolves to a non-public address',
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not YAML-parse a hostile body, however many paths serve it', async () => {
    const hostile = 'k: v\n'.repeat(200_000);
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    get.mockImplementation(async (url: string) =>
      url === `${ORIGIN}/`
        ? status(404)
        : { ok: true, status: 200, headers: {}, body: hostile }
    );

    const started = Date.now();
    await updateX402OpenApiDiscoveries();

    expect(Date.now() - started).toBeLessThan(2000);
    expect(saved()[0]).toMatchObject({ outcome: 'Invalid' });
  });

  it('abandons an origin mid-way when asked to stop, leaving it unrecorded', async () => {
    let stop = false;
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    get.mockImplementation(async () => {
      stop = true;
      return status(404);
    });

    const result = await updateX402OpenApiDiscoveries({
      shouldStop: () => stop,
    });

    expect(saved()).toEqual([]);
    expect(result).toEqual({ discovered: 0 });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('treats a document over the size limit as invalid, not unreachable', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: {
        ok: false,
        reason: 'response exceeds 2097152 bytes',
        unreachable: false,
      },
    });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Invalid',
      reason: 'response exceeds 2097152 bytes',
    });
  });

  it('keeps a large document by URL only', async () => {
    const big = {
      ...DOC,
      components: { description: 'x'.repeat(300 * 1024) },
    };
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({ [`${ORIGIN}/openapi.json`]: json(big) });

    await updateX402OpenApiDiscoveries();

    expect(saved()[0]).toMatchObject({
      outcome: 'Found',
      specUrl: `${ORIGIN}/openapi.json`,
      title: 'Summarizer',
      spec: null,
    });
  });

  it('fetches an origin once for several entries and records each', async () => {
    givenEntries([
      { id: 'e1', spec: manifest(`${ORIGIN}/a`) },
      { id: 'e2', spec: manifest(`${ORIGIN}/b`) },
    ]);
    givenServer({ [`${ORIGIN}/openapi.json`]: json(DOC) });

    await updateX402OpenApiDiscoveries();

    expect(
      requested().filter((url) => url === `${ORIGIN}/openapi.json`)
    ).toHaveLength(1);
    expect(
      saved()
        .map((record) => record.entryId)
        .sort()
    ).toEqual(['e1', 'e2']);
  });

  it('discovers each distinct origin of a manifest', async () => {
    givenEntries([
      {
        id: 'e1',
        spec: manifest(`${ORIGIN}/a`, 'https://b.example/b'),
      },
    ]);
    givenServer({
      [`${ORIGIN}/openapi.json`]: json(DOC),
      'https://b.example/openapi.json': json(DOC),
    });

    await updateX402OpenApiDiscoveries();

    expect(
      saved()
        .map((record) => record.origin)
        .sort()
    ).toEqual([ORIGIN, 'https://b.example']);
  });

  it('skips an entry whose manifest was not cached', async () => {
    givenEntries([{ id: 'e1', spec: null }]);

    const result = await updateX402OpenApiDiscoveries();

    expect(result).toEqual({ discovered: 0 });
    expect(get).not.toHaveBeenCalled();
  });

  it('never contacts an origin the fetcher would refuse', async () => {
    givenEntries([{ id: 'e1', spec: manifest('http://a.example/x') }]);

    await updateX402OpenApiDiscoveries();

    expect(get).not.toHaveBeenCalled();
    expect(repo.saveDiscovery).not.toHaveBeenCalled();
  });

  it('drops rows of origins the manifest no longer uses', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    repo.getDiscoveryTimes.mockResolvedValue([
      {
        registryEntryId: 'e1',
        origin: 'https://gone.example',
        checkedAt: new Date(),
      },
    ]);
    givenServer({});

    await updateX402OpenApiDiscoveries();

    expect(repo.deleteDiscoveries).toHaveBeenCalledWith('e1', [
      'https://gone.example',
    ]);
  });

  it('checks never-discovered origins before ones checked recently', async () => {
    givenEntries([
      {
        id: 'e1',
        spec: manifest(
          'https://old.example/x',
          'https://new.example/x',
          'https://fresh.example/x'
        ),
      },
    ]);
    repo.getDiscoveryTimes.mockResolvedValue([
      {
        registryEntryId: 'e1',
        origin: 'https://old.example',
        checkedAt: new Date('2026-01-01'),
      },
      {
        registryEntryId: 'e1',
        origin: 'https://fresh.example',
        checkedAt: new Date('2026-10-01'),
      },
    ]);
    givenServer({});

    await updateX402OpenApiDiscoveries({ maxOrigins: 2 });

    expect(
      saved()
        .map((record) => record.origin)
        .sort()
    ).toEqual(['https://new.example', 'https://old.example']);
  });

  it('stops starting origins once asked to', async () => {
    givenEntries([
      {
        id: 'e1',
        spec: manifest(`${ORIGIN}/a`, 'https://b.example/b'),
      },
    ]);
    givenServer({});

    const result = await updateX402OpenApiDiscoveries({
      shouldStop: () => true,
    });

    expect(result).toEqual({ discovered: 0 });
    expect(get).not.toHaveBeenCalled();
  });

  it('stores a minimal row when a result cannot be saved, so it is not retried first forever', async () => {
    givenEntries([{ id: 'e1', spec: manifest(`${ORIGIN}/x`) }]);
    givenServer({ [`${ORIGIN}/openapi.json`]: json(DOC) });
    repo.saveDiscovery.mockRejectedValueOnce(new Error('value too long'));

    await updateX402OpenApiDiscoveries();

    expect(saved()).toHaveLength(2);
    expect(saved()[1]).toMatchObject({
      origin: ORIGIN,
      outcome: 'Invalid',
      reason: 'result could not be stored',
      spec: null,
    });
  });

  it('keeps going when one origin throws', async () => {
    givenEntries([
      {
        id: 'e1',
        spec: manifest(`${ORIGIN}/a`, 'https://b.example/b'),
      },
    ]);
    get.mockImplementation(async (url: string) => {
      if (url.startsWith(ORIGIN)) throw new Error('boom');
      return url === 'https://b.example/openapi.json' ? json(DOC) : status(404);
    });

    await updateX402OpenApiDiscoveries();

    expect(saved().map((record) => [record.origin, record.outcome])).toEqual(
      expect.arrayContaining([
        [ORIGIN, 'Unreachable'],
        ['https://b.example', 'Found'],
      ])
    );
  });
});

describe('getAgentX402OpenApi', () => {
  const params = { network: 'Preprod' as const, agentIdentifier: 'asset1' };

  beforeEach(() => jest.resetAllMocks());

  it('is null for an unknown agent', async () => {
    repo.getDiscoveriesByIdentifier.mockResolvedValue(null);

    await expect(getAgentX402OpenApi(params)).resolves.toBeNull();
  });

  it('is null for an entry that is not X402', async () => {
    repo.getDiscoveriesByIdentifier.mockResolvedValue({
      type: 'OpenApi',
      status: 'Online',
      X402OpenApiDiscoveries: [],
    } as never);

    await expect(getAgentX402OpenApi(params)).resolves.toBeNull();
  });

  it('lists what discovery last found', async () => {
    const row = {
      origin: ORIGIN,
      outcome: 'Found',
      specUrl: `${ORIGIN}/openapi.json`,
      openApiVersion: '3.1.0',
      title: 'Summarizer',
      spec: DOC,
      reason: null,
      checkedAt: new Date('2026-10-15'),
    };
    repo.getDiscoveriesByIdentifier.mockResolvedValue({
      type: 'X402',
      status: 'Online',
      X402OpenApiDiscoveries: [row],
    } as never);

    await expect(getAgentX402OpenApi(params)).resolves.toEqual({
      agentIdentifier: 'asset1',
      status: 'Online',
      origins: [row],
    });
  });
});
