import { web3CardanoMetadataSchema } from './web3-cardano-metadata';

const sampleV1Metadata = {
  name: 'Test Agent',
  api_base_url: 'https://agent.example',
  author: { name: 'Author' },
  tags: ['ai'],
  agentPricing: { pricingType: 'Free' },
  image: 'https://img.example/logo.png',
  metadata_version: '1',
};

describe('web3CardanoMetadataSchema', () => {
  it('accepts valid V1 metadata', () => {
    expect(web3CardanoMetadataSchema.safeParse(sampleV1Metadata).success).toBe(
      true
    );
  });

  it.each([
    ['name', { name: '   ' }],
    ['image', { image: '' }],
    ['api_base_url', { api_base_url: ' ' }],
    [
      'example_output name',
      { example_output: [{ name: ' ', mime_type: 'text/plain', url: 'u' }] },
    ],
    [
      'fixedPricing unit',
      {
        agentPricing: {
          pricingType: 'Fixed',
          fixedPricing: [{ amount: 1, unit: ' ' }],
        },
      },
    ],
  ])('rejects a blank required %s', (_field, override) => {
    expect(
      web3CardanoMetadataSchema.safeParse({ ...sampleV1Metadata, ...override })
        .success
    ).toBe(false);
  });
});
