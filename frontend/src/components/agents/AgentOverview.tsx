import { CopyButton } from '@/components/ui/copy-button';
import type { RegistryEntry } from '@/lib/api/generated';
import type { Network } from '@/lib/agent-filters';
import { ENTRY_TYPE_LABELS } from '@/lib/display-labels';
import { SPEC_NAMES, specUrl } from '@/lib/health-reason';
import { Chips, DetailSection, Field, Mono, Prose, UrlText } from './AgentDetailSection';

function CopyableValue({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-start gap-1">
      <span className="min-w-0 pt-1.5">
        <Mono>{value}</Mono>
      </span>
      <CopyButton value={value} label={label} />
    </span>
  );
}

/** Core metadata: who the agent is, how to identify it, and where it is reached. */
export function AgentOverview({ agent, network }: { agent: RegistryEntry; network: Network }) {
  const tags = agent.tags ?? [];
  const capability = [agent.Capability?.name, agent.Capability?.version].filter(Boolean).join(' ');
  const author = [
    agent.authorName,
    agent.authorOrganization,
    agent.authorContactEmail,
    agent.authorContactOther,
  ].filter((value): value is string => Boolean(value));
  const spec = specUrl(agent);

  return (
    <DetailSection id="agent-overview-heading" title="Overview">
      <dl className="grid gap-4 @xl:grid-cols-2">
        <div className="@xl:col-span-2">
          <Field label="Description">
            {agent.description ? <Prose>{agent.description}</Prose> : '—'}
          </Field>
        </div>
        <Field label="Asset identifier">
          <CopyableValue value={agent.agentIdentifier} label="asset identifier" />
        </Field>
        <Field label="Policy ID">
          {agent.RegistrySource.policyId ? <Mono>{agent.RegistrySource.policyId}</Mono> : '—'}
        </Field>
        <Field label="API base URL">
          {agent.apiBaseUrl ? <CopyableValue value={agent.apiBaseUrl} label="API base URL" /> : '—'}
        </Field>
        {agent.type !== 'Standard' && (
          <Field label={SPEC_NAMES[agent.type]}>{spec ? <UrlText url={spec} /> : '—'}</Field>
        )}
        <Field label="Author">
          {author.length > 0 ? (
            <ul>
              {author.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Capability">{capability || '—'}</Field>
        <Field label="Type">{ENTRY_TYPE_LABELS[agent.type]}</Field>
        <Field label="Network">{network}</Field>
        <div className="@xl:col-span-2">
          <Field label="Tags">{tags.length > 0 ? <Chips values={tags} label="Tags" /> : '—'}</Field>
        </div>
      </dl>
    </DetailSection>
  );
}
