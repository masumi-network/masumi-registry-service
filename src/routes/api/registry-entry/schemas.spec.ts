import { Network, PaymentType, PricingType, Status } from '@prisma/client';
import {
  serializeRegistryEntries,
  type RegistryEntrySerializable,
} from './schemas';

function entry(
  overrides: Partial<RegistryEntrySerializable> = {}
): RegistryEntrySerializable {
  return {
    id: 'entry-1',
    name: 'Agent',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    description: null,
    status: Status.Online,
    statusUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastUptimeCheck: new Date('2026-01-01T00:00:00.000Z'),
    uptimeCount: 1,
    uptimeCheckCount: 1,
    apiBaseUrl: 'https://agent.example',
    authorName: null,
    authorOrganization: null,
    authorContactEmail: null,
    authorContactOther: null,
    image: null,
    privacyPolicy: null,
    termsAndCondition: null,
    otherLegal: null,
    tags: [],
    assetIdentifier: 'agent-identifier',
    paymentType: PaymentType.Web3CardanoV2,
    metadataVersion: 2,
    RegistrySource: {
      id: 'source-1',
      policyId: 'policy',
      url: null,
    },
    Capability: null,
    AgentPricing: null,
    ExampleOutput: [],
    SupportedPaymentSources: [],
    Verifications: [],
    ...overrides,
  };
}

describe('serializeRegistryEntries', () => {
  it('keeps V2 pricing under each ordered payment source', () => {
    const [serialized] = serializeRegistryEntries(
      [
        entry({
          SupportedPaymentSources: [
            {
              chain: 'Cardano',
              network: Network.Preprod,
              sourceIndex: 1,
              paymentSourceType: 'Web3CardanoV2',
              address: 'addr_test1dynamic',
              scheme: null,
              dynamicAsset: null,
              dynamicDecimals: null,
              fixedDecimals: null,
              payTo: null,
              resource: null,
              Pricing: {
                pricingType: PricingType.Dynamic,
                FixedPricing: null,
              },
            },
            {
              chain: 'Cardano',
              network: Network.Preprod,
              sourceIndex: 0,
              paymentSourceType: 'Web3CardanoV2',
              address: 'addr_test1fixed',
              scheme: null,
              dynamicAsset: null,
              dynamicDecimals: null,
              fixedDecimals: null,
              payTo: null,
              resource: null,
              Pricing: {
                pricingType: PricingType.Fixed,
                FixedPricing: {
                  Amounts: [{ unit: '', amount: BigInt(500000) }],
                },
              },
            },
          ],
        }),
      ],
      10
    );

    expect(serialized.AgentPricing).toBeNull();
    expect(serialized.SupportedPaymentSources).toEqual([
      expect.objectContaining({
        sourceIndex: 0,
        pricing: {
          pricingType: PricingType.Fixed,
          fixed: [{ asset: '', amount: '500000' }],
        },
      }),
      expect.objectContaining({
        sourceIndex: 1,
        pricing: { pricingType: PricingType.Dynamic },
      }),
    ]);
  });

  it('keeps V1 pricing only in AgentPricing', () => {
    const [serialized] = serializeRegistryEntries(
      [
        entry({
          metadataVersion: 1,
          paymentType: PaymentType.Web3CardanoV1,
          AgentPricing: {
            pricingType: PricingType.Free,
            FixedPricing: null,
          },
        }),
      ],
      10
    );

    expect(serialized.AgentPricing).toEqual({
      pricingType: PricingType.Free,
    });
    expect(serialized.SupportedPaymentSources).toEqual([]);
  });

  it('fails clearly instead of dropping a persisted source without pricing', () => {
    expect(() =>
      serializeRegistryEntries(
        [
          entry({
            SupportedPaymentSources: [
              {
                chain: 'Cardano',
                network: Network.Preprod,
                sourceIndex: 0,
                paymentSourceType: 'Web3CardanoV2',
                address: 'addr_test1missing',
                scheme: null,
                dynamicAsset: null,
                dynamicDecimals: null,
                fixedDecimals: null,
                payTo: null,
                resource: null,
                Pricing: null,
              },
            ],
          }),
        ],
        10
      )
    ).toThrow('payment source 0 is missing pricing');
  });
});
