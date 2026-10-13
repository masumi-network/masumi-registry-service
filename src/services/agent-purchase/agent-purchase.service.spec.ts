import { Network } from '@prisma/client';
import { agentPurchaseRepository } from '@/repositories/agent-purchase';
import {
  PURCHASE_HISTORY_PAGE_SIZE,
  agentPurchaseService,
  bucketPurchases,
  bucketStart,
} from './agent-purchase.service';

jest.mock('@/repositories/agent-purchase', () => ({
  agentPurchaseRepository: {
    getPurchaseTotals: jest.fn(),
    findPurchasesInRange: jest.fn(),
  },
}));

const AGENT = 'agent';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('bucketStart', () => {
  // Wednesday 2026-10-14 15:30 UTC.
  const date = new Date('2026-10-14T15:30:00Z');

  it.each([
    ['Day', '2026-10-14T00:00:00.000Z'],
    ['Week', '2026-10-12T00:00:00.000Z'],
    ['Month', '2026-10-01T00:00:00.000Z'],
  ] as const)('starts a %s bucket at %s', (interval, expected) => {
    expect(bucketStart(date, interval).toISOString()).toBe(expected);
  });

  it('keeps a Sunday in the week that started the Monday before', () => {
    expect(
      bucketStart(new Date('2026-10-18T23:59:59Z'), 'Week').toISOString()
    ).toBe('2026-10-12T00:00:00.000Z');
  });
});

describe('bucketPurchases', () => {
  it('sums purchases and amounts per bucket, sparse and in time order', () => {
    expect(
      bucketPurchases(
        [
          {
            blockTime: new Date('2026-10-03T10:00:00Z'),
            Amounts: [{ unit: 'lovelace', quantity: 5n }],
          },
          {
            blockTime: new Date('2026-10-01T10:00:00Z'),
            Amounts: [
              { unit: 'usdm', quantity: 7n },
              { unit: 'lovelace', quantity: 2n },
            ],
          },
          {
            blockTime: new Date('2026-10-01T20:00:00Z'),
            Amounts: [{ unit: 'lovelace', quantity: 3n }],
          },
          { blockTime: null, Amounts: [{ unit: 'lovelace', quantity: 99n }] },
        ],
        'Day'
      )
    ).toEqual([
      {
        bucketStart: new Date('2026-10-01T00:00:00Z'),
        purchases: 2,
        amounts: [
          { unit: 'lovelace', quantity: 5n },
          { unit: 'usdm', quantity: 7n },
        ],
      },
      {
        bucketStart: new Date('2026-10-03T00:00:00Z'),
        purchases: 1,
        amounts: [{ unit: 'lovelace', quantity: 5n }],
      },
    ]);
  });
});

describe('getPurchaseHistory', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const totals = { purchases: 0, distinctBuyers: 0, amounts: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    (agentPurchaseRepository.getPurchaseTotals as jest.Mock).mockResolvedValue(
      totals
    );
    (
      agentPurchaseRepository.findPurchasesInRange as jest.Mock
    ).mockResolvedValue([]);
  });

  it('defaults to the 90 days before now, from the start of that day', async () => {
    const result = await agentPurchaseService.getPurchaseHistory({
      network: Network.Preprod,
      agentIdentifier: AGENT,
      interval: 'Day',
      now,
    });

    const from = new Date('2026-07-15T00:00:00Z');
    expect(agentPurchaseRepository.findPurchasesInRange).toHaveBeenCalledWith({
      network: Network.Preprod,
      agentIdentifier: AGENT,
      from,
      to: now,
      take: PURCHASE_HISTORY_PAGE_SIZE,
      cursorId: undefined,
    });
    expect(result).toEqual({
      network: Network.Preprod,
      agentIdentifier: AGENT,
      interval: 'Day',
      from,
      to: now,
      totals,
      series: [],
    });
  });

  it.each([
    ['an empty range', now, now],
    ['a range over 366 days', new Date(now.getTime() - 367 * DAY_MS), now],
  ])('rejects %s with 400', async (_label, from, to) => {
    await expect(
      agentPurchaseService.getPurchaseHistory({
        network: Network.Preprod,
        agentIdentifier: AGENT,
        interval: 'Day',
        from,
        to,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(agentPurchaseRepository.findPurchasesInRange).not.toHaveBeenCalled();
  });

  it('starts a Month series at the start of the month of `from`', async () => {
    const result = await agentPurchaseService.getPurchaseHistory({
      network: Network.Preprod,
      agentIdentifier: AGENT,
      interval: 'Month',
      from: new Date('2025-10-13T12:00:00Z'),
      to: now,
    });

    // The requested range is 365 days; snapping it to the month is allowed.
    expect(result.from).toEqual(new Date('2025-10-01T00:00:00Z'));
  });

  it('reads the series in pages and sums across them', async () => {
    const row = (id: string) => ({
      id,
      blockTime: new Date('2026-10-01T10:00:00Z'),
      Amounts: [{ unit: 'lovelace', quantity: 1n }],
    });
    const fullPage = Array.from(
      { length: PURCHASE_HISTORY_PAGE_SIZE },
      (_, i) => row(`r${i}`)
    );
    (agentPurchaseRepository.findPurchasesInRange as jest.Mock)
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([row('last')]);

    const result = await agentPurchaseService.getPurchaseHistory({
      network: Network.Preprod,
      agentIdentifier: AGENT,
      interval: 'Day',
      now,
    });

    expect(
      (agentPurchaseRepository.findPurchasesInRange as jest.Mock).mock
        .calls[1][0]
    ).toMatchObject({ cursorId: `r${PURCHASE_HISTORY_PAGE_SIZE - 1}` });
    expect(result.series).toEqual([
      {
        bucketStart: new Date('2026-10-01T00:00:00Z'),
        purchases: PURCHASE_HISTORY_PAGE_SIZE + 1,
        amounts: [
          {
            unit: 'lovelace',
            quantity: BigInt(PURCHASE_HISTORY_PAGE_SIZE + 1),
          },
        ],
      },
    ]);
  });
});
