import {
  compareChallengeToSources,
  parseX402Challenge,
  type RegisteredSource,
} from './challenge';

const BASE = 'eip155:8453';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAY_TO = '0x9f86b5b01d584e2ef5ac2c7a60f3e5164d548881';
const RESOURCE = 'https://api.example.com/v1/summarize';

function toHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

const v2Challenge = {
  x402Version: 2,
  error: 'No PAYMENT-SIGNATURE header provided',
  resource: { url: RESOURCE },
  accepts: [
    {
      scheme: 'exact',
      network: BASE,
      amount: '80000',
      asset: USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
    },
  ],
};

function fixedSource(overrides: Partial<RegisteredSource> = {}) {
  return {
    chain: 'EVM',
    network: BASE,
    scheme: 'Exact',
    payTo: PAY_TO,
    resource: null,
    dynamicAsset: null,
    Pricing: {
      pricingType: 'Fixed',
      FixedPricing: { Amounts: [{ unit: USDC, amount: 80000n }] },
    },
    ...overrides,
  } satisfies RegisteredSource;
}

describe('parseX402Challenge', () => {
  it('reads a v2 challenge from the PAYMENT-REQUIRED header', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: { 'payment-required': toHeader(v2Challenge) },
      body: '',
    });

    expect(result).toEqual({
      kind: 'challenge',
      x402Version: 2,
      accepts: [
        {
          scheme: 'exact',
          network: BASE,
          amount: '80000',
          asset: USDC,
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
        },
      ],
    });
  });

  it('reads a v1 JSON body, mapping maxAmountRequired and legacy network names', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: {},
      body: JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'base',
            maxAmountRequired: '10000',
            asset: USDC,
            payTo: PAY_TO,
            resource: RESOURCE,
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      kind: 'challenge',
      x402Version: 1,
      accepts: [{ network: BASE, amount: '10000', maxTimeoutSeconds: null }],
    });
  });

  it('prefers the header over the body when both carry a challenge', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: { 'payment-required': toHeader(v2Challenge) },
      body: JSON.stringify({ x402Version: 1, accepts: [] }),
    });

    expect(result).toMatchObject({ kind: 'challenge', x402Version: 2 });
  });

  it('accepts a string x402Version', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: {
        'payment-required': toHeader({ ...v2Challenge, x402Version: '2' }),
      },
      body: '',
    });

    expect(result).toMatchObject({ kind: 'challenge', x402Version: 2 });
  });

  it('keeps well-formed accepts and drops malformed ones', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: {
        'payment-required': toHeader({
          ...v2Challenge,
          accepts: [{ scheme: 'exact' }, ...v2Challenge.accepts],
        }),
      },
      body: '',
    });

    expect(result).toMatchObject({
      kind: 'challenge',
      accepts: [{ amount: '80000' }],
    });
  });

  it('tolerates a timeout it does not compare and a numeric amount', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: {
        'payment-required': toHeader({
          ...v2Challenge,
          accepts: [
            { ...v2Challenge.accepts[0], maxTimeoutSeconds: null },
            { ...v2Challenge.accepts[0], maxTimeoutSeconds: 0, amount: 7 },
            { ...v2Challenge.accepts[0], maxTimeoutSeconds: 60.5 },
          ],
        }),
      },
      body: '',
    });

    expect(result).toMatchObject({
      kind: 'challenge',
      accepts: [
        { maxTimeoutSeconds: null, amount: '80000' },
        { maxTimeoutSeconds: null, amount: '7' },
        { maxTimeoutSeconds: null },
      ],
    });
  });

  it('drops accepts that carry control characters or oversized strings', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: {
        'payment-required': toHeader({
          ...v2Challenge,
          accepts: [
            { ...v2Challenge.accepts[0], network: 'eip155:\u00008453' },
            { ...v2Challenge.accepts[0], payTo: 'x'.repeat(257) },
            v2Challenge.accepts[0],
          ],
        }),
      },
      body: '',
    });

    expect(result).toMatchObject({
      kind: 'challenge',
      accepts: [{ network: BASE, payTo: PAY_TO }],
    });
  });

  it('rejects an absurd protocol version and non-printable field values', () => {
    const header = (challenge: unknown) => ({
      status: 402,
      headers: { 'payment-required': toHeader(challenge) },
      body: '',
    });

    expect(
      parseX402Challenge(header({ ...v2Challenge, x402Version: 2147483648 }))
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseX402Challenge(
        header({
          ...v2Challenge,
          accepts: [{ ...v2Challenge.accepts[0], scheme: 'ex act' }],
        })
      )
    ).toMatchObject({ kind: 'invalid' });
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'keeps the network name %s as plain text',
    (name) => {
      const result = parseX402Challenge({
        status: 402,
        headers: {
          'payment-required': toHeader({
            ...v2Challenge,
            accepts: [{ ...v2Challenge.accepts[0], network: name }],
          }),
        },
        body: '',
      });

      expect(result).toMatchObject({
        kind: 'challenge',
        accepts: [{ network: name }],
      });
    }
  );

  it('keeps at most ten accepts', () => {
    const result = parseX402Challenge({
      status: 402,
      headers: {
        'payment-required': toHeader({
          ...v2Challenge,
          accepts: Array.from({ length: 25 }, () => v2Challenge.accepts[0]),
        }),
      },
      body: '',
    });

    expect(result.kind === 'challenge' && result.accepts).toHaveLength(10);
  });

  it('marks a 402 that carries no usable challenge as invalid', () => {
    expect(
      parseX402Challenge({ status: 402, headers: {}, body: 'pay up' })
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseX402Challenge({
        status: 402,
        headers: {},
        body: JSON.stringify({ x402Version: 2, accepts: [] }),
      })
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseX402Challenge({
        status: 402,
        headers: { 'payment-required': '%%%not-base64-json%%%' },
        body: '',
      })
    ).toMatchObject({ kind: 'invalid' });
  });

  it('classifies non-402 statuses', () => {
    const none = { headers: {}, body: '' };
    expect(parseX402Challenge({ status: 200, ...none })).toEqual({
      kind: 'free',
    });
    expect(parseX402Challenge({ status: 405, ...none })).toEqual({
      kind: 'unsupported-method',
    });
    // A POST-only route answers a GET with 404 as often as with 405.
    expect(parseX402Challenge({ status: 404, ...none })).toEqual({
      kind: 'unsupported-method',
    });
    expect(parseX402Challenge({ status: 503, ...none })).toEqual({
      kind: 'unreachable',
      reason: 'HTTP 503',
    });
    expect(parseX402Challenge({ status: 301, ...none })).toEqual({
      kind: 'unreachable',
      reason: 'HTTP 301',
    });
  });
});

describe('compareChallengeToSources', () => {
  const accepts = [
    {
      scheme: 'exact',
      network: BASE,
      amount: '80000',
      asset: USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
    },
  ];

  it('matches a fixed source, ignoring case of scheme, payTo and asset', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts: accepts.map((accept) => ({
        ...accept,
        scheme: 'EXACT',
        payTo: PAY_TO.toUpperCase().replace('0X', '0x'),
        asset: USDC.toUpperCase().replace('0X', '0x'),
      })),
      sources: [fixedSource()],
    });

    expect(result).toEqual({ matches: true, mismatches: [] });
  });

  it('reports the differing fields of the closest source', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts: [{ ...accepts[0], amount: '90000', network: 'eip155:1' }],
      sources: [fixedSource()],
    });

    expect(result.matches).toBe(false);
    expect(result.mismatches).toEqual([
      'network: resource requires eip155:1, registered eip155:8453',
      'amount: resource requires 90000, registered 80000',
    ]);
  });

  it('matches when any accept matches any source', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts: [{ ...accepts[0], network: 'eip155:1' }, accepts[0]],
      sources: [fixedSource({ network: 'eip155:10' }), fixedSource()],
    });

    expect(result.matches).toBe(true);
  });

  it('does not compare the amount of a dynamic source but pins its asset', () => {
    const dynamic = fixedSource({
      dynamicAsset: USDC,
      Pricing: { pricingType: 'Dynamic', FixedPricing: null },
    });

    expect(
      compareChallengeToSources({
        resource: RESOURCE,
        accepts: [{ ...accepts[0], amount: '1' }],
        sources: [dynamic],
      }).matches
    ).toBe(true);
    expect(
      compareChallengeToSources({
        resource: RESOURCE,
        accepts: [{ ...accepts[0], asset: `0x${'1'.repeat(40)}` }],
        sources: [dynamic],
      })
    ).toMatchObject({ matches: false });
  });

  it('ignores sources pinned to a different resource', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts,
      sources: [fixedSource({ resource: 'https://api.example.com/other' })],
    });

    expect(result).toEqual({ matches: null, mismatches: [] });
  });

  it('uses a source pinned to exactly this resource', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts,
      sources: [fixedSource({ resource: RESOURCE })],
    });

    expect(result.matches).toBe(true);
  });

  it('is not comparable for entries with only Cardano sources', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts,
      sources: [fixedSource({ chain: 'Cardano', payTo: null, scheme: null })],
    });

    expect(result).toEqual({ matches: null, mismatches: [] });
  });

  it('flags a registered fixed source that has no price instead of matching it', () => {
    const noAmounts = fixedSource({
      Pricing: { pricingType: 'Fixed', FixedPricing: { Amounts: [] } },
    });
    const unpriced = fixedSource({ Pricing: null });

    for (const source of [noAmounts, unpriced]) {
      expect(
        compareChallengeToSources({
          resource: RESOURCE,
          accepts: [{ ...accepts[0], asset: `0x${'1'.repeat(40)}` }],
          sources: [source],
        })
      ).toMatchObject({
        matches: false,
        mismatches: ['pricing: registered source has no price'],
      });
    }
  });

  it('flags a payable challenge against a source registered as free', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts,
      sources: [
        fixedSource({ Pricing: { pricingType: 'Free', FixedPricing: null } }),
      ],
    });

    expect(result.matches).toBe(false);
    expect(result.mismatches).toEqual([
      'pricing: registered as Free, but the resource requires payment',
    ]);
  });

  it('flags a resource that answers for free against a priced source', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts: null,
      sources: [fixedSource()],
    });

    expect(result.matches).toBe(false);
    expect(result.mismatches).toEqual([
      'pricing: registered as Fixed, but the resource did not require payment',
    ]);
  });

  it('accepts a free answer for a source registered as free', () => {
    const result = compareChallengeToSources({
      resource: RESOURCE,
      accepts: null,
      sources: [
        fixedSource({ Pricing: { pricingType: 'Free', FixedPricing: null } }),
      ],
    });

    expect(result.matches).toBe(true);
  });
});
