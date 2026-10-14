import type { InboxAgentRegistration, RegistryEntry } from '@/lib/api/generated';
import { AGENT_STATUSES, type AgentStatus } from './agent-filters';

// The registry has no count or "last job run" endpoint, and changing its API is out of
// scope (MAS-608). The status dashboard therefore reads one diff from the beginning of
// time per network, which lists every entry once in its current state, and derives the
// numbers from that. The diff endpoints are free (no usage credits) and read-only.

export const INBOX_STATUSES = ['Pending', 'Verified', 'Invalid', 'Deregistered'] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export interface DiffRow {
  id: string;
  statusUpdatedAt: Date;
}

/** One diff page: rows changed after `after`, from `cursorId` on (inclusive) at that time. */
export type FetchDiffPage<T extends DiffRow> = (
  after: Date,
  cursorId: string | undefined,
) => Promise<readonly T[]>;

const EPOCH = new Date(0);

/**
 * Reads a status diff from the beginning, the way the API says to page it: the next page
 * starts at the last row's statusUpdatedAt and id (inclusive, so it repeats that row). A
 * row that changes during the scan comes back later; the newest copy wins. Incomplete when
 * it stopped at `maxPages`.
 */
export async function collectStatusDiff<T extends DiffRow>(
  fetchPage: FetchDiffPage<T>,
  options: Readonly<{ pageSize: number; maxPages: number }>,
): Promise<{ rows: T[]; isComplete: boolean }> {
  const rows = new Map<string, T>();
  let after = EPOCH;
  let cursorId: string | undefined;
  for (let page = 0; page < options.maxPages; page += 1) {
    const items = await fetchPage(after, cursorId);
    for (const item of items) rows.set(item.id, item);
    const last = items.at(-1);
    // A short page is the end; so is a page that ends on its own cursor (no progress).
    const isStuck = last?.id === cursorId && last?.statusUpdatedAt.getTime() === after.getTime();
    if (!last || items.length < options.pageSize || isStuck) {
      return { rows: [...rows.values()], isComplete: true };
    }
    after = last.statusUpdatedAt;
    cursorId = last.id;
  }
  return { rows: [...rows.values()], isComplete: false };
}

export interface RegistrySummary {
  counts: Record<AgentStatus, number>;
  total: number;
  /** First seen by the registry since the window start. */
  added: number;
  /** Deregistered (burned on chain) since the window start. */
  burned: number;
  /** The most recent status change of any entry: what the last sync or check wrote. */
  latestChange: Date | null;
  /** The most recent agent health check, the trace the health-check job leaves. */
  latestHealthCheck: Date | null;
}

type SummaryEntry = Pick<
  RegistryEntry,
  'status' | 'createdAt' | 'statusUpdatedAt' | 'lastUptimeCheck'
>;

const latest = (dates: readonly Date[]): Date | null =>
  dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())));

export function summarizeRegistry(
  entries: readonly SummaryEntry[],
  since: Date,
  now: Date,
): RegistrySummary {
  const counts = Object.fromEntries(AGENT_STATUSES.map((status) => [status, 0])) as Record<
    AgentStatus,
    number
  >;
  for (const entry of entries) counts[entry.status] += 1;
  return {
    counts,
    total: entries.length,
    added: entries.filter((entry) => entry.createdAt >= since).length,
    burned: entries.filter(
      (entry) => entry.status === 'Deregistered' && entry.statusUpdatedAt >= since,
    ).length,
    latestChange: latest(entries.map((entry) => entry.statusUpdatedAt)),
    // Imported snapshots can carry check times ahead of now; they are not a real check.
    latestHealthCheck: latest(
      entries.map((entry) => entry.lastUptimeCheck).filter((date) => date <= now),
    ),
  };
}

export function summarizeInbox(registrations: readonly Pick<InboxAgentRegistration, 'status'>[]): {
  counts: Record<InboxStatus, number>;
  total: number;
} {
  const counts = Object.fromEntries(INBOX_STATUSES.map((status) => [status, 0])) as Record<
    InboxStatus,
    number
  >;
  for (const registration of registrations) counts[registration.status] += 1;
  return { counts, total: registrations.length };
}
