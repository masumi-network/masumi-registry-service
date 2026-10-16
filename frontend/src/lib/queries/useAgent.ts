import { useQuery } from '@tanstack/react-query';
import type { RegistryEntry } from '@/lib/api/generated';
import type { Client } from '@/lib/api/generated/client';
import { AGENT_STATUSES, type Network } from '@/lib/agent-filters';
import { fetchRegistryEntries } from './useAgents';
import { queryKeys } from './query-keys';

// Every status is asked for: without one the API answers Online entries only, which hides
// exactly the Offline and Invalid agents whose health the detail page explains.
async function fetchAgent(
  network: Network,
  agentIdentifier: string,
  resolveToLatestVersion: boolean,
  signal: AbortSignal,
  client: Client,
): Promise<RegistryEntry | null> {
  const [entry] = await fetchRegistryEntries(
    {
      network,
      limit: 1,
      filter: {
        assetIdentifier: agentIdentifier,
        status: [...AGENT_STATUSES],
        resolveToLatestVersion: resolveToLatestVersion || undefined,
      },
    },
    signal,
    client,
  );
  return entry ?? null;
}

/** One registry entry by asset identifier; null when the network has none. */
export function useAgent(network: Network, agentIdentifier: string, client: Client) {
  return useQuery({
    queryKey: queryKeys.agent(network, agentIdentifier),
    queryFn: ({ signal }) => fetchAgent(network, agentIdentifier, false, signal, client),
  });
}

/** The newest stored version of a V2 agent (`resolveToLatestVersion`). */
export function useLatestAgentVersion(
  network: Network,
  agentIdentifier: string,
  enabled: boolean,
  client: Client,
) {
  return useQuery({
    queryKey: queryKeys.latestAgentVersion(network, agentIdentifier),
    queryFn: ({ signal }) => fetchAgent(network, agentIdentifier, true, signal, client),
    enabled,
  });
}
