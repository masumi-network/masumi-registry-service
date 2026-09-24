import { Network, PricingType, Status } from '@prisma/client';
import { queryRegistrySchemaInput } from '@/routes/api/registry-entry/schemas';
import {
  buildRegistryEntryWhere,
  meetsMinUptimePercent,
  resolveAllowedStatuses,
} from './registry-filter';

function parseFilter(filter: unknown) {
  return queryRegistrySchemaInput.parse({ network: Network.Preprod, filter })
    .filter;
}

function buildWhere(filter: unknown) {
  return buildRegistryEntryWhere({
    filter: parseFilter(filter),
    network: Network.Preprod,
    assetIdentifier: undefined,
    searchQuery: undefined,
  });
}

describe('resolveAllowedStatuses', () => {
  it('defaults to Online when no status filter is given', () => {
    expect(resolveAllowedStatuses(undefined)).toEqual([Status.Online]);
  });

  it('uses the explicit status list', () => {
    expect(
      resolveAllowedStatuses(parseFilter({ status: [Status.Offline] }))
    ).toEqual([Status.Offline]);
  });

  it('widens to every other status when only excludeStatus is given', () => {
    expect(
      resolveAllowedStatuses(parseFilter({ excludeStatus: [Status.Invalid] }))
    ).toEqual([Status.Online, Status.Offline, Status.Deregistered]);
  });

  it('removes excluded statuses from the explicit list', () => {
    expect(
      resolveAllowedStatuses(
        parseFilter({
          status: [Status.Online, Status.Offline],
          excludeStatus: [Status.Offline],
        })
      )
    ).toEqual([Status.Online]);
  });

  it('narrows to Online with health.onlyOnline', () => {
    expect(
      resolveAllowedStatuses(
        parseFilter({
          status: [Status.Online, Status.Offline],
          health: { onlyOnline: true },
        })
      )
    ).toEqual([Status.Online]);
  });

  it('returns nothing when onlyOnline contradicts excludeStatus', () => {
    expect(
      resolveAllowedStatuses(
        parseFilter({
          excludeStatus: [Status.Online],
          health: { onlyOnline: true },
        })
      )
    ).toEqual([]);
  });
});

describe('buildRegistryEntryWhere', () => {
  it('keeps the legacy where when no new filter is given', () => {
    expect(buildWhere(undefined)).toEqual({
      status: { in: [Status.Online] },
      RegistrySource: { policyId: undefined, network: Network.Preprod },
    });
  });

  it('matches unit and amount range on the same price row, for V1 and V2 pricing', () => {
    const pricingWhere = {
      pricingType: PricingType.Fixed,
      FixedPricing: {
        Amounts: {
          some: {
            unit: 'lovelace',
            amount: { gte: BigInt(1000000), lte: BigInt(5000000) },
          },
        },
      },
    };

    const where = buildWhere({
      pricing: { unit: 'lovelace', minAmount: '1000000', maxAmount: '5000000' },
    });

    expect(where.OR).toEqual([
      { AgentPricing: pricingWhere },
      { SupportedPaymentSources: { some: { Pricing: pricingWhere } } },
    ]);
  });

  it('filters by pricing type alone', () => {
    expect(
      buildWhere({ pricing: { pricingType: PricingType.Free } }).OR
    ).toEqual([
      { AgentPricing: { pricingType: PricingType.Free } },
      {
        SupportedPaymentSources: {
          some: { Pricing: { pricingType: PricingType.Free } },
        },
      },
    ]);
  });

  it('ignores an empty pricing filter instead of requiring pricing to exist', () => {
    expect(buildWhere({ pricing: {} }).OR).toBeUndefined();
  });

  it('filters the first-seen date range on createdAt', () => {
    const registeredAfter = '2026-01-01T00:00:00.000Z';
    const registeredBefore = '2026-06-01T00:00:00.000Z';

    expect(buildWhere({ registeredAfter, registeredBefore }).createdAt).toEqual(
      { gte: new Date(registeredAfter), lte: new Date(registeredBefore) }
    );
  });

  it('AND-combines new and existing filters', () => {
    const where = buildWhere({
      tags: ['chat'],
      excludeStatus: [Status.Invalid],
      pricing: { pricingType: PricingType.Dynamic },
      registeredAfter: '2026-01-01T00:00:00.000Z',
    });

    expect(where).toMatchObject({
      tags: { hasSome: ['chat'] },
      status: {
        in: [Status.Online, Status.Offline, Status.Deregistered],
      },
      createdAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
    });
    expect(where.OR).toHaveLength(2);
  });
});

describe('pricing filter validation', () => {
  it.each([
    ['amount without unit', { minAmount: '1' }],
    ['unit with non-Fixed pricing', { pricingType: 'Free', unit: 'lovelace' }],
    ['min above max', { unit: 'lovelace', minAmount: '5', maxAmount: '1' }],
    ['negative amount', { unit: 'lovelace', minAmount: '-1' }],
    ['non-integer amount', { unit: 'lovelace', minAmount: '1.5' }],
    ['numeric amount', { unit: 'lovelace', minAmount: 1 }],
    [
      'amount above BIGINT max',
      { unit: 'lovelace', maxAmount: '9223372036854775808' },
    ],
  ])('rejects %s', (_label, pricing) => {
    expect(() => parseFilter({ pricing })).toThrow();
  });

  it('accepts the BIGINT max amount', () => {
    expect(() =>
      parseFilter({
        pricing: { unit: 'lovelace', maxAmount: '9223372036854775807' },
      })
    ).not.toThrow();
  });

  it('rejects minUptimePercent outside 0-100', () => {
    expect(() => parseFilter({ health: { minUptimePercent: 101 } })).toThrow();
  });
});

describe('meetsMinUptimePercent', () => {
  it('passes everything without a threshold', () => {
    expect(
      meetsMinUptimePercent({ uptimeCount: 0, uptimeCheckCount: 0 }, undefined)
    ).toBe(true);
  });

  it('excludes never-checked entries', () => {
    expect(
      meetsMinUptimePercent({ uptimeCount: 0, uptimeCheckCount: 0 }, 0)
    ).toBe(false);
  });

  it('includes an entry exactly at the threshold', () => {
    expect(
      meetsMinUptimePercent({ uptimeCount: 8, uptimeCheckCount: 10 }, 80)
    ).toBe(true);
  });

  it('excludes an entry just below the threshold', () => {
    expect(
      meetsMinUptimePercent({ uptimeCount: 79, uptimeCheckCount: 100 }, 80)
    ).toBe(false);
  });
});
