import { Network } from '@prisma/client';
import createHttpError from 'http-errors';
import { agentPurchaseRepository } from '@/repositories/agent-purchase';

export const PURCHASE_HISTORY_INTERVALS = ['Day', 'Week', 'Month'] as const;
export type PurchaseHistoryInterval =
  (typeof PURCHASE_HISTORY_INTERVALS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PURCHASE_HISTORY_DAYS = 90;
// Bounds the rows one request loads for the series.
export const MAX_PURCHASE_HISTORY_DAYS = 366;

// Start of the UTC bucket that contains `date`. Weeks start on Monday.
export function bucketStart(
  date: Date,
  interval: PurchaseHistoryInterval
): Date {
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  if (interval === 'Day') return new Date(day);
  if (interval === 'Week') {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return new Date(day - daysSinceMonday * DAY_MS);
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

type PurchaseRow = {
  blockTime: Date | null;
  Amounts: { unit: string; quantity: bigint }[];
};

// Sums purchases into sparse buckets: buckets without purchases are omitted.
export function bucketPurchases(
  rows: readonly PurchaseRow[],
  interval: PurchaseHistoryInterval
) {
  const buckets = new Map<
    number,
    { purchases: number; amounts: Map<string, bigint> }
  >();
  for (const row of rows) {
    if (row.blockTime == null) continue;
    const key = bucketStart(row.blockTime, interval).getTime();
    const bucket = buckets.get(key) ?? { purchases: 0, amounts: new Map() };
    bucket.purchases += 1;
    for (const amount of row.Amounts) {
      bucket.amounts.set(
        amount.unit,
        (bucket.amounts.get(amount.unit) ?? 0n) + amount.quantity
      );
    }
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([key, bucket]) => ({
      bucketStart: new Date(key),
      purchases: bucket.purchases,
      amounts: [...bucket.amounts.entries()]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([unit, quantity]) => ({ unit, quantity })),
    }));
}

// All-time totals plus a time series of one agent's on-chain purchases
// (seller withdrawals indexed from the payment contracts).
async function getPurchaseHistory(params: {
  network: Network;
  agentIdentifier: string;
  interval: PurchaseHistoryInterval;
  from?: Date;
  to?: Date;
  now?: Date;
}) {
  const to = params.to ?? params.now ?? new Date();
  const from =
    params.from ??
    new Date(to.getTime() - DEFAULT_PURCHASE_HISTORY_DAYS * DAY_MS);
  if (from >= to) {
    throw createHttpError(400, '`from` must be before `to`');
  }
  if (to.getTime() - from.getTime() > MAX_PURCHASE_HISTORY_DAYS * DAY_MS) {
    throw createHttpError(
      400,
      `The range must not exceed ${MAX_PURCHASE_HISTORY_DAYS} days`
    );
  }
  const scope = {
    network: params.network,
    agentIdentifier: params.agentIdentifier,
  };
  const [totals, rows] = await Promise.all([
    agentPurchaseRepository.getPurchaseTotals(scope),
    agentPurchaseRepository.findPurchasesInRange({ ...scope, from, to }),
  ]);
  return {
    ...scope,
    interval: params.interval,
    from,
    to,
    totals,
    series: bucketPurchases(rows, params.interval),
  };
}

export const agentPurchaseService = { getPurchaseHistory };
