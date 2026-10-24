import { useQuery } from '@tanstack/react-query';
import { postInboxAgentRegistrationDiff, postRegistryDiff } from '@/lib/api/generated';
import { collectStatusDiff } from '@/lib/admin-dashboard';
import type { Network } from '@/lib/agent-filters';
import { queryKeys } from './query-keys';

// Both diff endpoints cap `limit` at 50. 400 pages covers 20,000 rows per network; a
// larger registry reports the scan as incomplete rather than looping on.
const PAGE_SIZE = 50;
const MAX_PAGES = 400;
// A full scan is many requests, and the API records each one as usage: reuse it for a
// while; the status page's Refresh button rescans on demand.
const SNAPSHOT_STALE_MS = 5 * 60 * 1000;

/** One registry-diff page, optionally for one source policy. */
export function fetchRegistryDiffPage(network: Network, policyId?: string, signal?: AbortSignal) {
  return async (after: Date, cursorId: string | undefined) => {
    const { data } = await postRegistryDiff({
      body: { network, policyId, statusUpdatedAfter: after, cursorId, limit: PAGE_SIZE },
      signal,
      throwOnError: true,
    });
    if (!Array.isArray(data?.data?.entries)) throw new Error('Unexpected registry diff response');
    return data.data.entries;
  };
}

/** One inbox-registration-diff page, optionally for one source policy. */
export function fetchInboxDiffPage(network: Network, policyId?: string, signal?: AbortSignal) {
  return async (after: Date, cursorId: string | undefined) => {
    const { data } = await postInboxAgentRegistrationDiff({
      body: { network, policyId, statusUpdatedAfter: after, cursorId, limit: PAGE_SIZE },
      signal,
      throwOnError: true,
    });
    if (!Array.isArray(data?.data?.registrations)) {
      throw new Error('Unexpected inbox registration diff response');
    }
    return data.data.registrations;
  };
}

export const DIFF_SCAN = { pageSize: PAGE_SIZE, maxPages: MAX_PAGES };

/** Every registry entry on a network, once, in its current state (see admin-dashboard). */
export function useRegistryEntriesSnapshot(network: Network) {
  return useQuery({
    queryKey: queryKeys.registryOverview(network),
    staleTime: SNAPSHOT_STALE_MS,
    queryFn: ({ signal }) =>
      collectStatusDiff(fetchRegistryDiffPage(network, undefined, signal), DIFF_SCAN),
  });
}

/** Every inbox agent registration on a network, once, in its current state. */
export function useInboxSnapshot(network: Network) {
  return useQuery({
    queryKey: queryKeys.inboxOverview(network),
    staleTime: SNAPSHOT_STALE_MS,
    queryFn: ({ signal }) =>
      collectStatusDiff(fetchInboxDiffPage(network, undefined, signal), DIFF_SCAN),
  });
}
