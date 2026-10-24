import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistryEntry, RegistryEntryRanking } from '@/lib/api/generated';
import { lowestPriceInUnit, rankingBreakdown, relevanceReason } from './ranking-breakdown';

const ranking: RegistryEntryRanking = {
  score: 0.61,
  components: { distinctBuyers: 0.5, uptime: 0.9, lineageAge: 0.4 },
  weights: { distinctBuyers: 0.6, uptime: 0.3, lineageAge: 0.1 },
};

describe('rankingBreakdown', () => {
  it('lists each component with its weight and its share of the score', () => {
    const rows = rankingBreakdown(ranking);
    assert.deepEqual(
      rows.map((row) => [row.key, row.value, row.weight]),
      [
        ['distinctBuyers', 0.5, 0.6],
        ['uptime', 0.9, 0.3],
        ['lineageAge', 0.4, 0.1],
      ],
    );
    // weight × value / weight sum: the contributions add up to the API's score.
    const total = rows.reduce((sum, row) => sum + row.contribution, 0);
    assert.ok(Math.abs(total - 0.61) < 1e-9);
    assert.ok(Math.abs(rows[0].contribution - 0.3) < 1e-9);
  });

  it('gives zero contributions instead of NaN when every weight is zero', () => {
    const rows = rankingBreakdown({
      ...ranking,
      weights: { distinctBuyers: 0, uptime: 0, lineageAge: 0 },
    });
    assert.ok(rows.every((row) => row.contribution === 0));
  });
});

describe('relevanceReason', () => {
  it('mirrors the registry tiers: exact name, name, tag, other field', () => {
    assert.equal(relevanceReason({ name: 'Weather', tags: [] }, ' weather '), 'exact-name');
    assert.equal(relevanceReason({ name: 'Weather Oracle', tags: [] }, 'oracle'), 'name');
    assert.equal(relevanceReason({ name: 'Oracle', tags: ['Climate'] }, 'clim'), 'tag');
    assert.equal(relevanceReason({ name: 'Oracle', tags: null }, 'forecast'), 'other');
  });
});

type PricedEntry = Pick<RegistryEntry, 'AgentPricing' | 'SupportedPaymentSources'>;
const source = (pricing: RegistryEntry['SupportedPaymentSources'][number]['pricing']) =>
  ({ pricing }) as RegistryEntry['SupportedPaymentSources'][number];

describe('lowestPriceInUnit', () => {
  const entry: PricedEntry = {
    AgentPricing: {
      pricingType: 'Fixed',
      FixedPricing: {
        Amounts: [
          { amount: '5000000', unit: 'lovelace' },
          { amount: '7', unit: 'usdm' },
        ],
      },
    },
    SupportedPaymentSources: [
      source({ pricingType: 'Fixed', fixed: [{ asset: 'lovelace', amount: '3000000' }] }),
      source({ pricingType: 'Free' }),
    ],
  };

  it('takes the lowest amount in the unit across own pricing and payment sources', () => {
    assert.equal(lowestPriceInUnit(entry, 'lovelace'), '3000000');
    assert.equal(lowestPriceInUnit(entry, 'usdm'), '7');
  });

  it('ignores prices outside the amount range, like the sort key does', () => {
    assert.equal(lowestPriceInUnit(entry, 'lovelace', { minAmount: '4000000' }), '5000000');
    assert.equal(lowestPriceInUnit(entry, 'lovelace', { maxAmount: '1000' }), null);
  });

  it('compares as integers, not strings', () => {
    const big: PricedEntry = {
      AgentPricing: {
        pricingType: 'Fixed',
        FixedPricing: {
          Amounts: [
            { amount: '900', unit: 'u' },
            { amount: '10000', unit: 'u' },
          ],
        },
      },
      SupportedPaymentSources: [],
    };
    assert.equal(lowestPriceInUnit(big, 'u'), '900');
  });

  it('returns null without a unit or a price in it', () => {
    assert.equal(lowestPriceInUnit(entry, ''), null);
    assert.equal(lowestPriceInUnit(entry, 'other'), null);
  });
});
