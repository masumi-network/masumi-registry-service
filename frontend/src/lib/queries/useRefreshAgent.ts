import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postRegistryEntryRefresh } from '@/lib/api/generated';
import type { Network } from '@/lib/agent-filters';
import { queryKeys } from './query-keys';

/** Re-syncs the registry from chain and re-runs this entry's health check now. */
export function useRefreshAgent(network: Network, agentIdentifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await postRegistryEntryRefresh({
        body: { network, agentIdentifier },
        throwOnError: true,
      });
      if (!data?.data?.entry) throw new Error('Unexpected registry entry refresh response');
      return data.data.entry;
    },
    onSuccess: (entry) => {
      queryClient.setQueryData(queryKeys.agent(network, agentIdentifier), entry);
      // The sync and health check can change what everything else shows about this agent.
      for (const queryKey of [
        queryKeys.agentLists,
        queryKeys.latestAgentVersion(network, agentIdentifier),
        queryKeys.agentSpec(network, agentIdentifier),
        queryKeys.paymentInformation(agentIdentifier),
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
