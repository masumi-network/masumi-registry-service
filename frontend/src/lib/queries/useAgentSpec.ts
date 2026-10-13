import { useQuery } from '@tanstack/react-query';
import { getRegistryEntrySpec } from '@/lib/api/generated';
import type { Network } from '@/lib/agent-filters';
import { queryKeys } from './query-keys';

/** The registry's cached, validated spec of an OpenApi, x402 or A2A entry. Standard entries have none. */
export function useAgentSpec(network: Network, agentIdentifier: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agentSpec(network, agentIdentifier),
    queryFn: async ({ signal }) => {
      const { data } = await getRegistryEntrySpec({
        query: { network, agentIdentifier },
        signal,
        throwOnError: true,
      });
      // A proxy error page can arrive as a 200 with a non-JSON body.
      if (!data?.data?.type) throw new Error('Unexpected registry entry spec response');
      return data.data;
    },
    enabled,
  });
}
