import { Network, PaymentType, PricingType, Status } from '@prisma/client';
import {
  SNAPSHOT_VERSION,
  type PaymentSourcesSnapshot,
  type Snapshot,
} from './types';
import { validateSnapshotPricingLayout } from './pricing-layout';

function snapshotEntry(metadataVersion: number) {
  return {
    assetIdentifier: `agent-${metadataVersion}`,
    name: 'Agent',
    apiBaseUrl: 'https://agent.example',
    description: null,
    image: '',
    tags: [],
    authorName: null,
    authorContactEmail: null,
    authorContactOther: null,
    authorOrganization: null,
    privacyPolicy: null,
    termsAndCondition: null,
    otherLegal: null,
    lastUptimeCheck: '2026-01-01T00:00:00.000Z',
    uptimeCount: 0,
    uptimeCheckCount: 0,
    status: Status.Online,
    statusUpdatedAt: '2026-01-01T00:00:00.000Z',
    paymentType:
      metadataVersion >= 2
        ? PaymentType.Web3CardanoV2
        : PaymentType.Web3CardanoV1,
    metadataVersion,
    capability: null,
    agentPricing:
      metadataVersion >= 2
        ? null
        : {
            pricingType: PricingType.Free,
            fixedPricing: null,
          },
    exampleOutputs: [],
  };
}

function snapshot(entries: Snapshot['entries']): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    network: Network.Preprod,
    policyId: 'policy',
    lastTxId: null,
    lastCheckedPage: 1,
    entryCount: entries.length,
    entries,
  };
}

function paymentSources(
  entries: PaymentSourcesSnapshot['entries']
): PaymentSourcesSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    network: Network.Preprod,
    policyId: 'policy',
    entryCount: entries.length,
    sourceCount: entries.reduce(
      (count, entry) => count + entry.sources.length,
      0
    ),
    entries,
  };
}

describe('validateSnapshotPricingLayout', () => {
  it('accepts V1 top-level pricing and V2 source-owned pricing', () => {
    const v1 = snapshotEntry(1);
    const v2 = snapshotEntry(2);

    expect(() =>
      validateSnapshotPricingLayout(
        snapshot([v1, v2]),
        paymentSources([
          {
            assetIdentifier: v2.assetIdentifier,
            sources: [
              {
                chain: 'EVM',
                network: 'eip155:8453',
                sourceIndex: 0,
                paymentSourceType: null,
                address: '0x1111111111111111111111111111111111111111',
                scheme: 'Exact',
                pricing: { pricingType: 'Dynamic' },
                payTo: '0x1111111111111111111111111111111111111111',
                resource: null,
              },
            ],
          },
        ])
      )
    ).not.toThrow();
  });

  it('rejects top-level pricing on V2', () => {
    const v2 = {
      ...snapshotEntry(2),
      agentPricing: {
        pricingType: PricingType.Free,
        fixedPricing: null,
      },
    };

    expect(() =>
      validateSnapshotPricingLayout(
        snapshot([v2]),
        paymentSources([
          {
            assetIdentifier: v2.assetIdentifier,
            sources: [
              {
                chain: 'Cardano',
                network: Network.Preprod,
                sourceIndex: 0,
                paymentSourceType: 'Web3CardanoV2',
                address: 'addr_test1example',
                scheme: null,
                pricing: { pricingType: 'Free' },
                payTo: null,
                resource: null,
              },
            ],
          },
        ])
      )
    ).toThrow('must not set top-level agentPricing');
  });

  it('rejects supported payment sources on V1', () => {
    const v1 = snapshotEntry(1);

    expect(() =>
      validateSnapshotPricingLayout(
        snapshot([v1]),
        paymentSources([
          {
            assetIdentifier: v1.assetIdentifier,
            sources: [
              {
                chain: 'Cardano',
                network: Network.Preprod,
                sourceIndex: 0,
                paymentSourceType: 'Web3CardanoV2',
                address: 'addr_test1example',
                scheme: null,
                pricing: { pricingType: 'Free' },
                payTo: null,
                resource: null,
              },
            ],
          },
        ])
      )
    ).toThrow('must not set supported payment sources');
  });
});
