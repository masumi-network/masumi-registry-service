import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { buildRegistryQueryBody, type AgentFilters, type Network } from '@/lib/agent-filters';
import {
  activeFilterKeys,
  explainEmptyResult,
  planEmptyResultProbes,
  type EmptyResultExplanation,
  type ProbeId,
  type ProbeOutcome,
} from '@/lib/agent-empty-result';
import { fetchRegistryEntries } from './useAgents';
import { queryKeys } from './query-keys';

function toOutcome(result: UseQueryResult<boolean>): ProbeOutcome {
  if (result.isPending) return 'pending';
  if (result.isError) return 'error';
  return result.data ? 'results' : 'empty';
}

/**
 * Why a view came back empty. Runs one single-row probe per active filter (each leaving
 * that filter out); mount it only once the view is known to be empty.
 */
export function useEmptyResultExplanation(
  filters: AgentFilters,
  network: Network,
): EmptyResultExplanation {
  const probes = useMemo(
    () =>
      planEmptyResultProbes(filters).map((probe) => ({
        id: probe.id,
        body: buildRegistryQueryBody(probe.filters, network, { limit: 1 }),
      })),
    [filters, network],
  );

  const results = useQueries({
    queries: probes.map((probe) => ({
      queryKey: queryKeys.agentProbe(probe.body),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (await fetchRegistryEntries(probe.body, signal)).length > 0,
    })),
  });

  const outcomes: Partial<Record<ProbeId, ProbeOutcome>> = Object.fromEntries(
    probes.map((probe, index) => [probe.id, toOutcome(results[index])]),
  );
  return explainEmptyResult(activeFilterKeys({ ...filters, minHealthCheckDate: '' }), outcomes);
}
