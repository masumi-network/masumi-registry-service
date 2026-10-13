import { $Enums, HealthCheckTrigger } from '@prisma/client';
import { prisma } from '@/utils/db';

const DAY_MS = 24 * 60 * 60 * 1000;
// Time after which an interval's status counts half in the rolling uptime.
const UPTIME_HALF_LIFE_MS = 7 * DAY_MS;
// Health check events older than this are pruned.
export const HEALTH_CHECK_EVENT_RETENTION_DAYS = 90;

export type UptimeState = {
  status: $Enums.Status;
  lastUptimeCheck: Date;
  uptimeEwma: number | null;
};

// Time-weighted rolling uptime (0-1). The previous status is held from the
// previous check until now, and that interval is weighted by its length with
// exponential decay. Checks that follow each other quickly cover almost no
// time, so the check rate (and caller spam) does not move the value.
export function nextTimeWeightedUptime(
  previous: UptimeState | null,
  currentStatus: $Enums.Status,
  now: Date
): number {
  if (previous?.uptimeEwma == null) {
    return currentStatus === $Enums.Status.Online ? 1 : 0;
  }
  const elapsedMs = Math.max(
    0,
    now.getTime() - previous.lastUptimeCheck.getTime()
  );
  const intervalWeight = 1 - Math.pow(0.5, elapsedMs / UPTIME_HALF_LIFE_MS);
  const heldOnline = previous.status === $Enums.Status.Online ? 1 : 0;
  return (
    previous.uptimeEwma * (1 - intervalWeight) + heldOnline * intervalWeight
  );
}

// Uptime fields for an update after a check of an existing entry.
export function uptimeCheckUpdate(
  previous: UptimeState,
  status: $Enums.Status,
  now: Date
) {
  return {
    lastUptimeCheck: now,
    uptimeCount: { increment: status === $Enums.Status.Online ? 1 : 0 },
    uptimeCheckCount: { increment: 1 },
    uptimeEwma: nextTimeWeightedUptime(previous, status, now),
  };
}

// Uptime fields for a newly created entry after its first check.
export function uptimeCheckCreate(status: $Enums.Status, now: Date) {
  return {
    lastUptimeCheck: now,
    uptimeCount: status === $Enums.Status.Online ? 1 : 0,
    uptimeCheckCount: 1,
    uptimeEwma: nextTimeWeightedUptime(null, status, now),
  };
}

async function findUptimeState(
  assetIdentifier: string
): Promise<UptimeState | null> {
  return prisma.registryEntry.findUnique({
    where: { assetIdentifier },
    select: { status: true, lastUptimeCheck: true, uptimeEwma: true },
  });
}

// Uptime fields for an upsert after a check during registry sync.
async function syncUptimeFields(
  assetIdentifier: string,
  status: $Enums.Status
) {
  const checkedAt = new Date();
  const previous = await findUptimeState(assetIdentifier);
  return {
    checkedAt,
    update:
      previous == null
        ? uptimeCheckCreate(status, checkedAt)
        : uptimeCheckUpdate(previous, status, checkedAt),
    create: uptimeCheckCreate(status, checkedAt),
  };
}

// One row per check outcome: the time series behind the rolling uptime.
async function recordHealthCheckEvents(
  events: {
    registryEntryId: string;
    status: $Enums.Status;
    trigger: HealthCheckTrigger;
    checkedAt: Date;
  }[]
) {
  if (events.length === 0) return;
  await prisma.healthCheckEvent.createMany({ data: events });
}

async function recordSyncCheck(
  registryEntryId: string,
  status: $Enums.Status,
  checkedAt: Date
) {
  await recordHealthCheckEvents([
    { registryEntryId, status, trigger: HealthCheckTrigger.Sync, checkedAt },
  ]);
}

async function pruneHealthCheckEvents(now: Date) {
  const cutoff = new Date(
    now.getTime() - HEALTH_CHECK_EVENT_RETENTION_DAYS * DAY_MS
  );
  return prisma.healthCheckEvent.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });
}

export const uptimeTracking = {
  syncUptimeFields,
  recordHealthCheckEvents,
  recordSyncCheck,
  pruneHealthCheckEvents,
};
