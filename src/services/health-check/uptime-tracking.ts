import { $Enums, HealthCheckTrigger, Prisma } from '@prisma/client';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';

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

type UptimeClient = Pick<Prisma.TransactionClient, 'registryEntry'>;
type EntryKey = { id: string } | { assetIdentifier: string };

// Concurrent checks of one entry retry at most this often before giving up.
const MAX_UPTIME_WRITE_ATTEMPTS = 3;

// applied: the check was written. missing: no entry yet (the caller creates
// it). skipped: nothing written (Deregistered, or concurrent writes won).
export type UptimeCheckResult = 'applied' | 'missing' | 'skipped';

// Applies one check outcome to an existing entry: status, check counters,
// rolling uptime and `extraData`. The rolling uptime depends on the stored
// state, so the write is a compare-and-set on lastUptimeCheck: when a
// concurrent check (job, request or sync) wrote first, re-read and recompute
// instead of overwriting its interval.
async function applyUptimeCheck(
  db: UptimeClient,
  entry: EntryKey,
  status: $Enums.Status,
  checkedAt: Date,
  extraData: Prisma.RegistryEntryUpdateManyMutationInput = {}
): Promise<UptimeCheckResult> {
  for (let attempt = 0; attempt < MAX_UPTIME_WRITE_ATTEMPTS; attempt++) {
    const previous = await db.registryEntry.findFirst({
      where: entry,
      select: { status: true, lastUptimeCheck: true, uptimeEwma: true },
    });
    if (previous == null) return 'missing';
    // Burned agents stay Deregistered: a still-live endpoint must not revive
    // them, also when the burn lands while the probe runs.
    if (previous.status === $Enums.Status.Deregistered) return 'skipped';
    // A concurrent check can store a later time; never move it backwards.
    const at =
      previous.lastUptimeCheck > checkedAt
        ? previous.lastUptimeCheck
        : checkedAt;
    const { count } = await db.registryEntry.updateMany({
      where: {
        ...entry,
        lastUptimeCheck: previous.lastUptimeCheck,
        status: { not: $Enums.Status.Deregistered },
      },
      data: {
        status,
        ...uptimeCheckUpdate(previous, status, at),
        ...extraData,
      },
    });
    if (count > 0) return 'applied';
  }
  logger.warn('uptime check not applied after concurrent writes', { entry });
  return 'skipped';
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
  // History only: a failed write must not stop the registry sync.
  await recordHealthCheckEvents([
    { registryEntryId, status, trigger: HealthCheckTrigger.Sync, checkedAt },
  ]).catch((error) =>
    logger.error('failed to record sync health check event', { error })
  );
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
  applyUptimeCheck,
  uptimeCheckCreate,
  recordHealthCheckEvents,
  recordSyncCheck,
  pruneHealthCheckEvents,
};
