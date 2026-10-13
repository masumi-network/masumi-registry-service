import { Network } from '@prisma/client';
import { DEFAULTS } from '@/utils/config';
import { registryMetricsRepository } from '@/repositories/registry-entry/registry-metrics.repository';
import {
  clearRankingMetricsCache,
  getNetworkRankingMetrics,
  lineageStartsByRoot,
} from './registry-ranking-metrics';

jest.mock('@/repositories/registry-entry/registry-metrics.repository', () => ({
  registryMetricsRepository: {
    countDistinctBuyers: jest.fn(),
    findEntryCreatedAts: jest.fn(),
  },
}));

const V2_POLICY = DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2;
const V1_POLICY = DEFAULTS.REGISTRY_POLICY_ID_PREPROD;

describe('lineageStartsByRoot', () => {
  it('takes the earliest version per exact root, never a prefix match', () => {
    const root = `${V2_POLICY}aa`;
    // A different agent whose root starts with `root`.
    const longerRoot = `${V2_POLICY}aabb`;
    const starts = lineageStartsByRoot([
      {
        assetIdentifier: `${root}000002`,
        createdAt: new Date('2026-03-01'),
        RegistrySource: { policyId: V2_POLICY },
      },
      {
        assetIdentifier: `${root}000001`,
        createdAt: new Date('2026-01-01'),
        RegistrySource: { policyId: V2_POLICY },
      },
      {
        assetIdentifier: `${longerRoot}000001`,
        createdAt: new Date('2025-01-01'),
        RegistrySource: { policyId: V2_POLICY },
      },
      {
        assetIdentifier: `${V1_POLICY}cc000001`,
        createdAt: new Date('2024-01-01'),
        RegistrySource: { policyId: V1_POLICY },
      },
    ]);

    expect(starts).toEqual(
      new Map([
        [root, new Date('2026-01-01')],
        [longerRoot, new Date('2025-01-01')],
      ])
    );
  });
});

describe('getNetworkRankingMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRankingMetricsCache();
    (
      registryMetricsRepository.countDistinctBuyers as jest.Mock
    ).mockResolvedValue(new Map([['asset', 2]]));
    (
      registryMetricsRepository.findEntryCreatedAts as jest.Mock
    ).mockResolvedValue([]);
  });

  it('reuses a load within 60 seconds and reloads after', async () => {
    await getNetworkRankingMetrics(Network.Preprod, 0);
    await getNetworkRankingMetrics(Network.Preprod, 59_000);
    expect(registryMetricsRepository.countDistinctBuyers).toHaveBeenCalledTimes(
      1
    );

    await getNetworkRankingMetrics(Network.Preprod, 60_000);
    expect(registryMetricsRepository.countDistinctBuyers).toHaveBeenCalledTimes(
      2
    );
  });

  it('does not cache a failed load', async () => {
    (
      registryMetricsRepository.countDistinctBuyers as jest.Mock
    ).mockRejectedValueOnce(new Error('db down'));

    await expect(getNetworkRankingMetrics(Network.Preprod, 0)).rejects.toThrow(
      'db down'
    );
    await expect(getNetworkRankingMetrics(Network.Preprod, 1)).resolves.toEqual(
      { distinctBuyers: new Map([['asset', 2]]), lineageStarts: new Map() }
    );
  });
});
