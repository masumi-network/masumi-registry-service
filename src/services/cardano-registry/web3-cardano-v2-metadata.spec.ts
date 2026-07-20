import {
  buildV2SupportedPaymentSourceRows,
  buildV2VerificationRows,
  resolveV2AgentPricingCreate,
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
      settlement: { scheme: 'Exact', payTo: '0xRecipient' },
      pricing: {
        pricingType: 'Fixed',
        fixed: [{ asset: '0xUSDC', amount: '1000000', decimals: '6' }],
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
  it('flattens grouped sources into Cardano + EVM rows', () => {
    const metadata = web3CardanoV2MetadataSchema.parse(sampleV2Metadata);
    const rows = buildV2SupportedPaymentSourceRows(metadata);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.chain === 'Cardano')).toMatchObject({
      network: 'Preprod',
      paymentSourceType: 'Web3CardanoV2',
      address: 'addr_test1example',
    });
    expect(rows.find((row) => row.chain === 'EVM')).toMatchObject({
      network: 'eip155:8453',
      scheme: 'Exact',
      asset: '0xUSDC',
      amount: 1000000n,
      decimals: 6,
      payTo: '0xRecipient',
      address: '0xRecipient',
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
        pricingType: 'Dynamic',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        amount: null,
        decimals: 6,
      }),
      expect.objectContaining({
        pricingType: 'Free',
        asset: null,
        amount: null,
        decimals: null,
      }),
    ]);
  });

  it('resolves pricing + paymentType from the Cardano source', () => {
    const metadata = web3CardanoV2MetadataSchema.parse(sampleV2Metadata);
    expect(resolveV2AgentPricingCreate(metadata).pricingType).toBe('Fixed');
    expect(resolveV2PaymentType(metadata)).toBe('Web3CardanoV2');
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
