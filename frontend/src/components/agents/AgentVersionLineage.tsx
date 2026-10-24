import Link from 'next/link';
import type { RegistryEntry } from '@/lib/api/generated';
import type { Client } from '@/lib/api/generated/client';
import type { Network } from '@/lib/agent-filters';
import { useLatestAgentVersion } from '@/lib/queries/useAgent';
import { DetailSection, Field, Mono } from './AgentDetailSection';

// A V2 asset name ends in a 3-byte version, bumped by one per update (src/utils/agent-version).
function versionOf(agentIdentifier: string): number {
  return parseInt(agentIdentifier.slice(-6), 16);
}

function VersionLink({ agentIdentifier }: { agentIdentifier: string }) {
  return (
    <Link
      href={{ pathname: '/agent', query: { agentIdentifier } }}
      className="group block rounded-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <span className="font-medium underline-offset-4 group-hover:underline">
        Version {versionOf(agentIdentifier)}
      </span>
      <span className="block text-muted-foreground">
        <Mono>{agentIdentifier}</Mono>
      </span>
    </Link>
  );
}

/** Where a V2 agent sits among its versions. Renders nothing for agents with one version. */
export function AgentVersionLineage({
  agent,
  network,
  apiClient,
}: {
  agent: RegistryEntry;
  network: Network;
  apiClient: Client;
}) {
  const previous = agent.supersedesAgentIdentifier;
  const next = agent.supersededByAgentIdentifier;
  // Only a superseded version needs the lookup; otherwise this one is the latest.
  const latest = useLatestAgentVersion(network, agent.agentIdentifier, next !== null, apiClient);
  if (previous === null && next === null) return null;

  return (
    <DetailSection
      id="agent-lineage-heading"
      title="Version lineage"
      description={`Version ${versionOf(agent.agentIdentifier)} of this V2 agent.`}
    >
      <dl className="grid gap-4 @xl:grid-cols-3">
        <Field label="Previous version">
          {previous ? <VersionLink agentIdentifier={previous} /> : 'None, this is the first'}
        </Field>
        <Field label="Next version">{next ? <VersionLink agentIdentifier={next} /> : 'None'}</Field>
        <Field label="Latest version">
          {next === null ? (
            'This version'
          ) : latest.isPending ? (
            <span className="text-muted-foreground">Looking up…</span>
          ) : latest.data ? (
            <VersionLink agentIdentifier={latest.data.agentIdentifier} />
          ) : (
            <span className="text-muted-foreground">Could not look up the latest version.</span>
          )}
        </Field>
      </dl>
    </DetailSection>
  );
}
