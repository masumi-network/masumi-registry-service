import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import {
  buildRegistryListRequest,
  type AgentFilters,
  type Network,
  type RegistryListRequest,
} from '@/lib/agent-filters';
import {
  activeFilterKeys,
  explainEmptyResult,
  planEmptyResultProbes,
  type EmptyResultExplanation,
  type ProbeId,
  type ProbeOutcome,
} from '@/lib/agent-empty-result';
import { fetchRegistryList } from './useAgents';
import { queryKeys } from './query-keys';

// A probe asks only whether anything matches. Any sortBy, the search default relevance
// included, makes the API rank the whole filtered set first, so probes send none.
function unsorted(request: RegistryListRequest): RegistryListRequest {
  return request.endpoint === 'search'
    ? { endpoint: 'search', body: { ...request.body, sortBy: undefined } }
    : { endpoint: 'query', body: { ...request.body, sortBy: undefined } };
}

function toOutcome(result: UseQueryResult<boolean>): ProbeOutcome {
  if (result.isPending) return 'pending';
  if (result.isError) return 'error';
  return result.data ? 'results' : 'empty';
}

/**
 * Why a view came back empty. Runs one single-row probe per active filter, search text
 * included (each leaving that one out); mount it only once the view is known to be empty.
 */
export function useEmptyResultExplanation(
  filters: AgentFilters,
  network: Network,
): EmptyResultExplanation {
  const probes = useMemo(
    () =>
      planEmptyResultProbes(filters).map((probe) => ({
        id: probe.id,
        request: unsorted(buildRegistryListRequest(probe.filters, network, { limit: 1 })),
      })),
    [filters, network],
  );

  const results = useQueries({
    queries: probes.map((probe) => ({
      queryKey: queryKeys.agentProbe(probe.request),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (await fetchRegistryList(probe.request, signal)).length > 0,
    })),
  });

  const outcomes: Partial<Record<ProbeId, ProbeOutcome>> = Object.fromEntries(
    probes.map((probe, index) => [probe.id, toOutcome(results[index])]),
  );
  return explainEmptyResult(activeFilterKeys({ ...filters, lastCheckedAfter: '' }), outcomes);
}
