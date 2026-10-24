import { RelativeTime, STATUS_BADGE } from '@/components/agents/AgentList';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AGENT_STATUSES, type Network } from '@/lib/agent-filters';
import { INBOX_STATUSES, summarizeInbox, summarizeRegistry } from '@/lib/admin-dashboard';
import { classifyAuthError } from '@/lib/auth/errors';
import { useInboxSnapshot, useRegistryEntriesSnapshot } from '@/lib/queries/useAdminOverview';

const DAY_MS = 86_400_000;

interface NetworkOverviewProps {
  network: Network;
  /** Length of the sync window: added and burned are counted over it. */
  windowDays: number;
  windowLabel: string;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function When({ date }: { date: Date | null }) {
  return date ? <RelativeTime date={date} /> : <span className="text-muted-foreground">Never</span>;
}

function LoadFailed({ error, network }: { error: unknown; network: Network }) {
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      Could not read the registry on {network}. {classifyAuthError(error).message} The registry also
      fails this way when {network} has no registry source.
    </p>
  );
}

/** Counts by status, sync activity and inbox registrations for one network. */
export function NetworkOverview({ network, windowDays, windowLabel }: NetworkOverviewProps) {
  const registry = useRegistryEntriesSnapshot(network);
  const inbox = useInboxSnapshot(network);
  const headingId = `overview-${network}`;

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-lg border p-4">
      <h2 id={headingId} className="text-base font-semibold">
        {network}
      </h2>

      {registry.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : registry.isError ? (
        <LoadFailed error={registry.error} network={network} />
      ) : (
        <RegistryNumbers
          rows={registry.data.rows}
          isComplete={registry.data.isComplete}
          // Measured from when the snapshot was read, so the window and "now" agree with it.
          readAt={registry.dataUpdatedAt}
          windowDays={windowDays}
          windowLabel={windowLabel}
        />
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Inbox agent registrations</h3>
        {inbox.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : inbox.isError ? (
          <LoadFailed error={inbox.error} network={network} />
        ) : (
          <InboxNumbers rows={inbox.data.rows} />
        )}
      </div>
    </section>
  );
}

function InboxNumbers({ rows }: { rows: Parameters<typeof summarizeInbox>[0] }) {
  const { counts } = summarizeInbox(rows);
  return (
    <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
      {INBOX_STATUSES.map((status) => (
        <Stat key={status} label={status} value={counts[status]} />
      ))}
    </dl>
  );
}

function RegistryNumbers({
  rows,
  isComplete,
  readAt,
  windowDays,
  windowLabel,
}: {
  rows: Parameters<typeof summarizeRegistry>[0];
  isComplete: boolean;
  readAt: number;
  windowDays: number;
  windowLabel: string;
}) {
  const summary = summarizeRegistry(rows, new Date(readAt - windowDays * DAY_MS), new Date(readAt));
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Agents by status{' '}
          <span className="font-normal text-muted-foreground">({summary.total} in total)</span>
        </h3>
        <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          {AGENT_STATUSES.map((status) => (
            <Stat
              key={status}
              label={<Badge variant={STATUS_BADGE[status]}>{status}</Badge>}
              value={summary.counts[status]}
            />
          ))}
        </dl>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Registry sync, last {windowLabel}</h3>
        <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          <Stat label="Entries added" value={summary.added} hint="First seen by the registry" />
          <Stat label="Entries burned" value={summary.burned} hint="Deregistered on chain" />
          <Stat
            label="Latest registry change"
            value={<When date={summary.latestChange} />}
            hint="Newest status written by a sync or check"
          />
          <Stat
            label="Latest health check"
            value={<When date={summary.latestHealthCheck} />}
            hint="Most recent agent the health job checked"
          />
        </dl>
      </div>

      {!isComplete && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
          The registry is larger than this page reads at once; the numbers cover the first 20,000
          entries.
        </p>
      )}
    </div>
  );
}
