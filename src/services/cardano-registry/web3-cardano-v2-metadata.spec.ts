import {
  buildV2SupportedPaymentSourceRows,
  buildV2VerificationRows,
  resolveV2PaymentType,
  web3CardanoV2MetadataSchema,
} from './web3-cardano-v2-metadata';

const sampleV2Metadata = {
  name: 'Test Agent',
  api_base_url: 'https://agent.example/mip',
  author: { name: 'Author' },
  tags: ['ai'],
  image: 'https://img.example/logo.png',
  metadata_version: '2',
  supported_payment_sources: [
    {
      chain: 'Cardano',
      network: 'Preprod',
      settlement: {
        paymentSourceType: 'Web3CardanoV2',
        address: 'addr_test1example',
      },
      pricing: {
        pricingType: 'Fixed',
        fixed: [{ asset: '', amount: '5000000' }],
      },
    },
    {
      chain: 'EVM',
      network: 'eip155:8453',
      settlement: {
        scheme: 'Exact',
        payTo: '0x1111111111111111111111111111111111111111',
      },
      pricing: {
        pricingType: 'Fixed',
        fixed: [
          {
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            amount: '1000000',
            decimals: '6',
          },
        ],
      },
    },
  ],
  verifications: [
    {
      method: 'KERI-ACDC',
      issuer: { aid: 'Eissuer', oobi: 'https://oobi.example/issuer' },
      schema: { said: 'Eschema', oobi: 'https://oobi.example/schema' },
      credential: {
        said: 'Ecred',
        oobi: 'https://oobi.example/cred',
        registry: 'Eregistry',
      },
      holder: { aid: 'Eholder', oobi: 'https://oobi.example/holder' },
      baseUrl: 'https://verify.example',
    },
  ],
};

describe('web3CardanoV2 metadata', () => {
  it('accepts the type/openapi_spec_url/x402_resources_url keys (strict schema)', () => {
    // The schema is .strict(); these keys must be allowed or every OpenApi/X402
    // entry the indexer sees would be rejected as invalid.
    expect(
      web3CardanoV2MetadataSchema.safeParse({
        ...sampleV2Metadata,
        type: 'OpenAPI',
        openapi_spec_url: 'https://agent.example/openapi.json',
        x402_resources_url: 'https://agent.example/.well-known/x402.json',
      }).success
    ).toBe(true);
  });

  it('accepts an A2A entry carrying api_base_url AND the a2a keys together', () => {
    const parsed = web3CardanoV2MetadataSchema.safeParse({
      ...sampleV2Metadata,
      type: 'a2aV1',
      agent_card_url: 'https://agent.example/.well-known/agent-card.json',
      a2a_protocol_versions: ['1.0', '1.1'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.api_base_url).toBe('https://agent.example/mip');
      expect(parsed.data.agent_card_url).toBe(
        'https://agent.example/.well-known/agent-card.json'
      );
      expect(parsed.data.a2a_protocol_versions).toEqual(['1.0', '1.1']);
    }
  });

  it('accepts a chunked agent_card_url (CIP-25 64-char splitting)', () => {
    const parsed = web3CardanoV2MetadataSchema.safeParse({
      ...sampleV2Metadata,
      type: 'a2aV1',
      agent_card_url: ['https://agent.example/.well-kn', 'own/agent-card.json'],
      a2a_protocol_versions: ['1.0'],
    });
    expect(parsed.success).toBe(true);
  });

  it('tolerates an empty a2a_protocol_versions on a non-A2A entry', () => {
    expect(
      web3CardanoV2MetadataSchema.safeParse({
        ...sampleV2Metadata,
        a2a_protocol_versions: [],
      }).success
    ).toBe(true);
  });

  it('accepts a V2 entry with no api_base_url (OpenApi/X402 shape)', () => {
    const withoutBaseUrl: Record<string, unknown> = { ...sampleV2Metadata };
    delete withoutBaseUrl.api_base_url;
    expect(
      web3CardanoV2MetadataSchema.safeParse({
        ...withoutBaseUrl,
        type: 'OpenAPI',
        openapi_spec_url: 'https://agent.example/openapi.json',
      }).success
    ).toBe(true);
  });

  it('flattens grouped sources into Cardano + EVM rows', () => {
    const metadata = web3CardanoV2MetadataSchema.parse(sampleV2Metadata);
    const rows = buildV2SupportedPaymentSourceRows(metadata);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.chain === 'Cardano')).toMatchObject({
      network: 'Preprod',
      sourceIndex: 0,
      paymentSourceType: 'Web3CardanoV2',
      address: 'addr_test1example',
      Pricing: { create: expect.objectContaining({ pricingType: 'Fixed' }) },
    });
    expect(rows.find((row) => row.chain === 'EVM')).toMatchObject({
      network: 'eip155:8453',
      sourceIndex: 1,
      scheme: 'Exact',
      fixedDecimals: 6,
      payTo: '0x1111111111111111111111111111111111111111',
      address: '0x1111111111111111111111111111111111111111',
      Pricing: { create: expect.objectContaining({ pricingType: 'Fixed' }) },
    });
  });

  it('flattens verifications into anchor rows', () => {
    const metadata = web3CardanoV2MetadataSchema.parse(sampleV2Metadata);
    const rows = buildV2VerificationRows(metadata);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: 'KERI-ACDC',
      issuerAid: 'Eissuer',
      schemaSaid: 'Eschema',
      credentialSaid: 'Ecred',
      credentialRegistry: 'Eregistry',
      holderAid: 'Eholder',
      baseUrl: 'https://verify.example',
    });
  });

  it('preserves dynamic asset allowlists and free x402 pricing', () => {
    const metadata = web3CardanoV2MetadataSchema.parse({
      ...sampleV2Metadata,
      supported_payment_sources: [
        {
          chain: 'EVM',
          network: 'eip155:8453',
          settlement: {
            scheme: 'Exact',
            payTo: '0x1111111111111111111111111111111111111111',
          },
          pricing: {
            pricingType: 'Dynamic',
            dynamic: [
              {
                asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                decimals: '6',
              },
            ],
          },
        },
        {
          chain: 'EVM',
          network: 'eip155:8453',
          settlement: {
            scheme: 'Exact',
            payTo: '0x2222222222222222222222222222222222222222',
          },
          pricing: { pricingType: 'Free' },
        },
      ],
    });

    expect(buildV2SupportedPaymentSourceRows(metadata)).toEqual([
      expect.objectContaining({
        dynamicAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        dynamicDecimals: 6,
        Pricing: {
          create: expect.objectContaining({ pricingType: 'Dynamic' }),
        },
      }),
      expect.objectContaining({
        dynamicAsset: null,
        dynamicDecimals: null,
        fixedDecimals: null,
        Pricing: { create: expect.objectContaining({ pricingType: 'Free' }) },
      }),
    ]);
  });

  it('resolves paymentType from all Cardano sources', () => {
    const metadata = web3CardanoV2MetadataSchema.parse(sampleV2Metadata);
    expect(resolveV2PaymentType(metadata)).toBe('Web3CardanoV2');
  });

  it('preserves independently priced Cardano sources', () => {
    const metadata = web3CardanoV2MetadataSchema.parse({
      ...sampleV2Metadata,
      supported_payment_sources: [
        sampleV2Metadata.supported_payment_sources[0],
        {
          ...sampleV2Metadata.supported_payment_sources[0],
          pricing: { pricingType: 'Dynamic' },
        },
      ],
    });

    const rows = buildV2SupportedPaymentSourceRows(metadata);
    expect(rows.map((row) => row.Pricing)).toEqual([
      { create: expect.objectContaining({ pricingType: 'Fixed' }) },
      { create: { pricingType: 'Dynamic' } },
    ]);
  });

  it('rejects duplicate source options with a row-level error', () => {
    const metadata = web3CardanoV2MetadataSchema.parse({
      ...sampleV2Metadata,
      supported_payment_sources: [
        sampleV2Metadata.supported_payment_sources[0],
        sampleV2Metadata.supported_payment_sources[0],
      ],
    });

    expect(() => buildV2SupportedPaymentSourceRows(metadata)).toThrow(
      'supported_payment_sources[1] duplicates an earlier supported payment source'
    );
  });

  it('rejects legacy top-level agentPricing on V2', () => {
    const result = web3CardanoV2MetadataSchema.safeParse({
      ...sampleV2Metadata,
      agentPricing: { pricingType: 'Free' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Unrecognized key');
    }
  });

  it('caps payment sources and Cardano fixed-price baskets', () => {
    expect(
      web3CardanoV2MetadataSchema.safeParse({
        ...sampleV2Metadata,
        supported_payment_sources: Array.from(
          { length: 26 },
          () => sampleV2Metadata.supported_payment_sources[0]
        ),
      }).success
    ).toBe(false);

    const metadata = web3CardanoV2MetadataSchema.parse({
      ...sampleV2Metadata,
      supported_payment_sources: [
        {
          ...sampleV2Metadata.supported_payment_sources[0],
          pricing: {
            pricingType: 'Fixed',
            fixed: Array.from({ length: 6 }, (_, index) => ({
              asset: index === 0 ? '' : `asset-${index}`,
              amount: '1',
            })),
          },
        },
      ],
    });
    expect(() => buildV2SupportedPaymentSourceRows(metadata)).toThrow(
      'must not contain more than 5 assets'
    );
  });

  it('drops a verification missing a required anchor', () => {
    const metadata = web3CardanoV2MetadataSchema.parse({
      ...sampleV2Metadata,
      verifications: [{ method: 'KERI-ACDC', issuer: { aid: 'Eonly' } }],
    });
    expect(buildV2VerificationRows(metadata)).toHaveLength(0);
  });

  it('rejects V1 metadata (metadata_version 1)', () => {
    const result = web3CardanoV2MetadataSchema.safeParse({
      ...sampleV2Metadata,
      metadata_version: '1',
    });
    expect(result.success).toBe(false);
  });
});
