import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { RegistryEntry } from '@/lib/api/generated';
import type { AgentStatus } from '@/lib/agent-filters';
import { ENTRY_TYPE_LABELS, PAYMENT_TYPE_LABELS, formatUptime } from '@/lib/display-labels';
import { cn } from '@/lib/utils';

const VISIBLE_TAGS = 3;

const STATUS_BADGE: Record<AgentStatus, BadgeProps['variant']> = {
  Online: 'success',
  Offline: 'warning',
  Deregistered: 'secondary',
  Invalid: 'destructive',
};

// Rows switch to columns once the list itself, not the viewport, is wide enough: the
// sidebar and the filter panel take a varying share of the screen.
const ROW_GRID =
  '@3xl:grid-cols-[minmax(0,2.4fr)_6.5rem_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem] @3xl:items-start';

// Narrow list: label above value, so values keep the full width. Wider: label beside value.
// Widest: a column under a shared heading, label kept for screen readers.
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 text-sm @sm:flex @sm:items-baseline @sm:gap-2 @3xl:block">
      <span className="text-xs text-muted-foreground @sm:w-24 @sm:shrink-0 @3xl:sr-only">
        {label}
      </span>
      <div className="min-w-0 wrap-break-word">{children}</div>
    </div>
  );
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];
const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "5 months ago", "2 minutes ago": the largest unit that fits. */
function timeAgo(date: Date): string {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const [unit, size] = RELATIVE_UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1];
  return relativeTime.format(Math.round(seconds / size), unit);
}

function LastCheck({ date }: { date: Date }) {
  if (Number.isNaN(date.getTime())) return <span className="text-muted-foreground">Never</span>;
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()}>
      {timeAgo(date)}
    </time>
  );
}

function AgentRow({ agent }: { agent: RegistryEntry }) {
  const tags = agent.tags ?? [];
  const capability = [agent.Capability?.name, agent.Capability?.version].filter(Boolean).join(' ');

  return (
    <li className={cn('grid gap-x-6 gap-y-2 px-4 py-4', ROW_GRID)}>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium" title={agent.name}>
          {agent.name}
        </p>
        {agent.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
        )}
        <p
          className="truncate font-mono text-xs text-muted-foreground"
          title={agent.agentIdentifier}
        >
          {agent.agentIdentifier}
        </p>
        {tags.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-1 pt-1">
            {tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <li key={tag} className="max-w-40 truncate rounded-full bg-muted px-2 py-0.5 text-xs">
                {tag}
              </li>
            ))}
            {tags.length > VISIBLE_TAGS && (
              <li className="px-1 py-0.5 text-xs text-muted-foreground">
                +{tags.length - VISIBLE_TAGS} more
              </li>
            )}
          </ul>
        )}
      </div>
      <Cell label="Status">
        <Badge variant={STATUS_BADGE[agent.status]}>{agent.status}</Badge>
      </Cell>
      <Cell label="Capability">
        <span>{capability || '—'}</span>
      </Cell>
      <Cell label="Type">
        <span>{ENTRY_TYPE_LABELS[agent.type]}</span>
        <span className="block text-xs text-muted-foreground">
          {PAYMENT_TYPE_LABELS[agent.paymentType]}
        </span>
      </Cell>
      <Cell label="Uptime">
        <span className="tabular-nums">
          {formatUptime(agent.uptimeCount, agent.uptimeCheckCount)}
        </span>
        <span className="block text-xs text-muted-foreground">
          <LastCheck date={agent.lastUptimeCheck} />
        </span>
      </Cell>
    </li>
  );
}

/** Column headings, shown only once rows are laid out as columns. */
export function AgentListHeader() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'hidden gap-x-6 border-b px-4 py-2 text-xs font-medium text-muted-foreground @3xl:grid',
        ROW_GRID,
      )}
    >
      <span>Agent</span>
      <span>Status</span>
      <span>Capability</span>
      <span>Type</span>
      <span>Uptime</span>
    </div>
  );
}

export function AgentList({ agents }: { agents: RegistryEntry[] }) {
  return (
    <ul aria-label="Agents" className="divide-y">
      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} />
      ))}
    </ul>
  );
}
