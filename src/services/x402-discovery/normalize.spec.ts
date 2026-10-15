import {
  buildSuggestedManifest,
  groupByHost,
  normalizeBazaarItem,
} from './normalize';

const PAY_TO = '0x589a2314a2E05F45e40C4823Da3Ba58D421dB3d8';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Trimmed copy of a real Coinbase CDP Bazaar item (GET, no input schema).
const getItem = {
  resource: 'https://www.api-xpay.com/x402/time',
  type: 'http',
  x402Version: 2,
  description: 'Current server time in UTC',
  serviceName: 'X Pay',
  tags: ['utility', 'time'],
  lastUpdated: '2026-10-15T04:27:50.886Z',
  quality: {
    l30DaysTotalCalls: 5470,
    l30DaysUniquePayers: 152,
    lastCalledAt: '2026-10-15T00:20:18.462Z',
  },
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
  extensions: {
    bazaar: {
      info: {
        input: { method: 'GET', type: 'http' },
        output: { type: 'json' },
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: { type: 'object', properties: { method: { type: 'string' } } },
          output: { type: 'object' },
        },
      },
    },
  },
};

// Trimmed copy of a real POST item that documents its request body.
const postItem = {
  resource: 'https://www.ax1.vc/api/dashboard/q-verdict/resource',
  type: 'http',
  x402Version: 2,
  description: 'Send a Base token contract address, get an AI-written verdict.',
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: { method: 'POST', type: 'http', bodyType: 'json', body: {} },
      },
      schema: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              body: {
                type: 'object',
                properties: { tokenAddress: { type: 'string' } },
                required: ['tokenAddress'],
              },
            },
          },
          output: {
            type: 'object',
            properties: {
              example: {
                type: 'object',
                properties: { grade: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
};

describe('normalizeBazaarItem', () => {
  it('normalizes a GET item', () => {
    expect(normalizeBazaarItem(getItem)).toEqual({
      resource: 'https://www.api-xpay.com/x402/time',
      method: 'GET',
      description: 'Current server time in UTC',
      serviceName: 'X Pay',
      tags: ['utility', 'time'],
      x402Version: 2,
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
      inputSchema: null,
      outputSchema: null,
      lastUpdated: '2026-10-15T04:27:50.886Z',
      quality: {
        l30DaysTotalCalls: 5470,
        l30DaysUniquePayers: 152,
        lastCalledAt: '2026-10-15T00:20:18.462Z',
      },
    });
  });

  it('takes the request and response schemas from the bazaar extension', () => {
    const result = normalizeBazaarItem(postItem);

    expect(result).toMatchObject({
      method: 'POST',
      inputSchema: {
        type: 'object',
        properties: { tokenAddress: { type: 'string' } },
      },
      outputSchema: {
        type: 'object',
        properties: { grade: { type: 'string' } },
      },
    });
  });

  it('prefers the explicit schemas and method some facilitators send', () => {
    const result = normalizeBazaarItem({
      ...postItem,
      method: 'PUT',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      outputSchema: { type: 'array' },
    });

    expect(result).toMatchObject({
      method: 'PUT',
      inputSchema: { properties: { q: { type: 'string' } } },
      outputSchema: { type: 'array' },
    });
  });

  it('accepts a unix-seconds lastUpdated and keeps no other date shape', () => {
    expect(
      normalizeBazaarItem({ ...getItem, lastUpdated: 1703123456 })
    ).toMatchObject({ lastUpdated: '2023-12-21T01:50:56.000Z' });
    expect(
      normalizeBazaarItem({ ...getItem, lastUpdated: { nested: true } })
    ).toMatchObject({ lastUpdated: null });
  });

  it('does not read a millisecond epoch as seconds', () => {
    expect(
      normalizeBazaarItem({ ...getItem, lastUpdated: 1703123456000 })
    ).toMatchObject({ lastUpdated: '2023-12-21T01:50:56.000Z' });
  });

  it.each([
    ['a non-object', 'nope'],
    ['a missing resource', { ...getItem, resource: undefined }],
    ['a non-URL resource', { ...getItem, resource: 'not a url' }],
    ['an mcp resource', { ...getItem, type: 'mcp' }],
    [
      'a resource with a control character',
      { ...getItem, resource: 'https://a.example/x\u0000y' },
    ],
    [
      'an over-long resource',
      { ...getItem, resource: `https://a.example/${'x'.repeat(2100)}` },
    ],
    ['no usable accepts', { ...getItem, accepts: [{ scheme: 'exact' }] }],
  ])('drops %s', (_label, item) => {
    expect(normalizeBazaarItem(item)).toBeNull();
  });

  it.each([
    ['credentials', 'https://user:pw@a.example/x'],
    ['plain http', 'http://a.example/x'],
    ['a custom port', 'https://a.example:8443/x'],
    ['localhost', 'https://localhost/x'],
    ['an ip literal', 'https://93.184.216.34/x'],
    ['a private ip literal', 'https://10.0.0.1/x'],
    ['an ipv6 literal', 'https://[::1]/x'],
    ['a bidi control character', 'https://a.example/\u202ex'],
  ])('drops a resource URL with %s', (_label, resource) => {
    expect(normalizeBazaarItem({ ...getItem, resource })).toBeNull();
  });

  it('strips control and formatting characters from free text', () => {
    const result = normalizeBazaarItem({
      ...getItem,
      description: 'ok\u001b[31m red\u202e',
      serviceName: 'Svc\u0000',
    });

    expect(result?.description).toBe('ok[31m red');
    expect(result?.serviceName).toBe('Svc');
  });

  it('drops a schema it cannot safely hand on', () => {
    let deep: Record<string, unknown> = { type: 'string' };
    for (let level = 0; level < 100; level += 1) {
      deep = { type: 'array', items: deep };
    }

    expect(
      normalizeBazaarItem({ ...getItem, inputSchema: deep })?.inputSchema
    ).toBeNull();
    expect(
      normalizeBazaarItem({ ...getItem, inputSchema: { $schema: 5 } })
        ?.inputSchema
    ).toBeNull();
  });

  it('bounds every attacker-controlled field', () => {
    const result = normalizeBazaarItem({
      ...getItem,
      description: 'd'.repeat(5000),
      serviceName: 's'.repeat(5000),
      tags: Array.from({ length: 50 }, (_, index) => `tag-${index}`),
      inputSchema: { blob: 'x'.repeat(100_000) },
      accepts: [
        {
          ...getItem.accepts[0],
          extra: { name: 'USD Coin', nested: { a: 1 }, long: 'x'.repeat(500) },
        },
      ],
    });

    expect(result?.description).toHaveLength(500);
    expect(result?.serviceName).toHaveLength(120);
    expect(result?.tags).toHaveLength(10);
    expect(result?.inputSchema).toBeNull();
    expect(result?.accepts[0].extra).toEqual({ name: 'USD Coin' });
  });
});

describe('groupByHost', () => {
  const resource = (url: string, serviceName: string | null = null) =>
    normalizeBazaarItem({ ...getItem, resource: url, serviceName })!;

  it('makes one candidate per host, largest first', () => {
    const groups = groupByHost([
      resource('https://small.example/a'),
      resource('https://big.example/a', 'Big'),
      resource('https://big.example/b', 'Big'),
      resource('https://BIG.example/c', 'Other'),
    ]);

    expect(groups.map((group) => group.host)).toEqual([
      'big.example',
      'small.example',
    ]);
    expect(groups[0]).toMatchObject({
      serviceName: 'Big',
      networks: ['eip155:8453'],
    });
    expect(groups[0].resources.map((r) => r.resource)).toEqual([
      'https://BIG.example/c',
      'https://big.example/a',
      'https://big.example/b',
    ]);
  });
});

describe('buildSuggestedManifest', () => {
  it('lists each resource with only the fields it has', () => {
    const manifest = buildSuggestedManifest([
      normalizeBazaarItem(getItem)!,
      normalizeBazaarItem(postItem)!,
    ]);

    expect(manifest).toEqual({
      x402Version: 2,
      resources: [
        {
          resource: 'https://www.api-xpay.com/x402/time',
          type: 'http',
          description: 'Current server time in UTC',
        },
        {
          resource: 'https://www.ax1.vc/api/dashboard/q-verdict/resource',
          type: 'http',
          description:
            'Send a Base token contract address, get an AI-written verdict.',
          inputSchema: {
            type: 'object',
            properties: { tokenAddress: { type: 'string' } },
            required: ['tokenAddress'],
          },
          outputSchema: {
            type: 'object',
            properties: { grade: { type: 'string' } },
          },
        },
      ],
    });
  });
});
