import { Badge } from '@/components/ui/badge';
import type { RegistryEntry } from '@/lib/api/generated';
import { formatUptime } from '@/lib/display-labels';
import { explainStatus } from '@/lib/health-reason';
import { DetailSection, Field } from './AgentDetailSection';
import { RelativeTime, STATUS_BADGE } from './AgentList';

function DateTime({ date }: { date: Date }) {
  if (Number.isNaN(date.getTime())) return <>Never</>;
  return (
    <>
      {date.toLocaleString()}
      <span className="block text-xs text-muted-foreground">
        <RelativeTime date={date} />
      </span>
    </>
  );
}

/** Current status, when it was last checked, and why it is not Online. */
export function AgentHealth({ agent }: { agent: RegistryEntry }) {
  const reason = explainStatus(agent);

  return (
    <DetailSection id="agent-health-heading" title="Health">
      <div className="space-y-4">
        <div className="space-y-2">
          <Badge variant={STATUS_BADGE[agent.status]}>{agent.status}</Badge>
          {reason && <p className="max-w-prose text-sm">{reason}</p>}
        </div>
        <dl className="grid gap-4 @md:grid-cols-3">
          <Field label="Last check">
            <DateTime date={agent.lastUptimeCheck} />
          </Field>
          <Field label="Status since">
            <DateTime date={agent.statusUpdatedAt} />
          </Field>
          <Field label="Uptime">
            <span className="tabular-nums">
              {formatUptime(agent.uptimeCount, agent.uptimeCheckCount)}
            </span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {agent.uptimeCount} of {agent.uptimeCheckCount} checks passed
            </span>
          </Field>
        </dl>
      </div>
    </DetailSection>
  );
}
