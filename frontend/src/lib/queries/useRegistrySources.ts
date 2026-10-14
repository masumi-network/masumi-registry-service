import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteRegistrySource,
  getRegistrySource,
  patchRegistrySource,
  postRegistrySource,
  type PatchRegistrySourceData,
  type PostRegistrySourceData,
  type RegistrySource,
} from '@/lib/api/generated';
import { collectStatusDiff } from '@/lib/admin-dashboard';
import { DIFF_SCAN, fetchInboxDiffPage, fetchRegistryDiffPage } from './useAdminOverview';
import type { Network } from '@/lib/agent-filters';
import { collectInclusiveCursorPages } from '@/lib/pagination/cursor-pagination';
import { queryKeys } from './query-keys';

// GET /registry-source caps `limit` at 50; a registry has a handful of sources.
const SOURCE_PAGE_SIZE = 50;
const MAX_PAGES = 200;

async function fetchRegistrySources(signal?: AbortSignal): Promise<RegistrySource[]> {
  return collectInclusiveCursorPages(
    async (cursorId) => {
      const { data } = await getRegistrySource({
        query: { limit: SOURCE_PAGE_SIZE, cursorId },
        signal,
        throwOnError: true,
      });
      if (!Array.isArray(data?.data?.sources))
        throw new Error('Unexpected registry source response');
      return data.data.sources;
    },
    (source) => source.id,
    { maxPages: MAX_PAGES },
  );
}

export function useRegistrySources() {
  return useQuery({
    queryKey: queryKeys.registrySources,
    queryFn: ({ signal }) => fetchRegistrySources(signal),
  });
}

/** What removing a source deletes with it: its agents and inbox registrations (cascade). */
export interface SourceDependents {
  agents: number;
  inboxRegistrations: number;
  /** False when the count stopped at its page cap: the real numbers are higher. */
  isComplete: boolean;
}

async function countSourceDependents(
  network: Network,
  policyId: string,
  signal?: AbortSignal,
): Promise<SourceDependents> {
  const [agents, inbox] = await Promise.all([
    collectStatusDiff(fetchRegistryDiffPage(network, policyId, signal), DIFF_SCAN),
    collectStatusDiff(fetchInboxDiffPage(network, policyId, signal), DIFF_SCAN),
  ]);
  return {
    agents: agents.rows.length,
    inboxRegistrations: inbox.rows.length,
    isComplete: agents.isComplete && inbox.isComplete,
  };
}

/** Counts what a removal would delete; enable it only while the confirmation is open. */
export function useSourceDependents(source: RegistrySource) {
  const network = source?.network ?? null;
  const policyId = source?.policyId ?? null;
  return useQuery({
    queryKey: queryKeys.sourceDependents(network ?? 'Preprod', policyId ?? ''),
    queryFn: ({ signal }) => countSourceDependents(network!, policyId!, signal),
    enabled: network !== null && policyId !== null,
    // A destructive confirmation names current numbers: count afresh on every opening.
    staleTime: 0,
    gcTime: 0,
  });
}

function useInvalidateAfterSourceChange() {
  const queryClient = useQueryClient();
  return (removed: boolean) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.registrySources });
    if (!removed) return;
    // A removed source takes its agents and inbox registrations with it.
    for (const queryKey of [queryKeys.agentLists, ['overview'], queryKeys.inbox]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

export function useAddRegistrySource() {
  const invalidate = useInvalidateAfterSourceChange();
  return useMutation({
    mutationFn: async (body: NonNullable<PostRegistrySourceData['body']>) => {
      await postRegistrySource({ body, throwOnError: true });
    },
    onSuccess: () => invalidate(false),
  });
}

export function useUpdateRegistrySource() {
  const invalidate = useInvalidateAfterSourceChange();
  return useMutation({
    mutationFn: async (body: NonNullable<PatchRegistrySourceData['body']>) => {
      await patchRegistrySource({ body, throwOnError: true });
    },
    onSuccess: () => invalidate(false),
  });
}

export function useRemoveRegistrySource() {
  const invalidate = useInvalidateAfterSourceChange();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteRegistrySource({ body: { id }, throwOnError: true });
    },
    onSuccess: () => invalidate(true),
  });
}
