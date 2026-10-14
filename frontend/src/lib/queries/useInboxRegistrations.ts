import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  postInboxAgentRegistration,
  postInboxAgentRegistrationRefresh,
  postInboxAgentRegistrationSearch,
  type InboxAgentRegistration,
} from '@/lib/api/generated';
import type { Network } from '@/lib/agent-filters';
import { buildInboxListRequest, type InboxFilters } from '@/lib/inbox-filters';
import {
  flattenInclusiveCursorPages,
  nextInclusiveCursor,
  type InclusiveCursorPage,
} from '@/lib/pagination/cursor-pagination';
import { queryKeys } from './query-keys';

const PAGE_SIZE = 20;
const API_MAX_LIMIT = 50;
const registrationKey = (registration: InboxAgentRegistration) => registration.id;

/** One view of the inbox registrations, a page at a time ("Load more"). */
export function useInboxRegistrations(filters: InboxFilters, network: Network, enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.inboxList(network, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<InclusiveCursorPage<InboxAgentRegistration>> => {
      // A later page repeats the cursor row, so it asks for one more to add a full page.
      const limit = pageParam ? Math.min(PAGE_SIZE + 1, API_MAX_LIMIT) : PAGE_SIZE;
      const request = buildInboxListRequest(filters, network, { limit, cursorId: pageParam });
      const { data } =
        request.endpoint === 'search'
          ? await postInboxAgentRegistrationSearch({
              body: request.body,
              signal,
              throwOnError: true,
            })
          : await postInboxAgentRegistration({ body: request.body, signal, throwOnError: true });
      if (!Array.isArray(data?.data?.registrations)) {
        throw new Error('Unexpected inbox registration response');
      }
      return { items: data.data.registrations, limit, cursorId: pageParam };
    },
    getNextPageParam: (lastPage) => nextInclusiveCursor(lastPage, registrationKey),
    enabled,
  });
  const pages = query.data?.pages;
  const registrations = useMemo(
    () => flattenInclusiveCursorPages(pages?.map((page) => page.items) ?? [], registrationKey),
    [pages],
  );
  return { query, registrations };
}

/** Re-syncs from chain and re-verifies one registration now. */
export function useRefreshInboxRegistration(network: Network) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agentIdentifier: string) => {
      await postInboxAgentRegistrationRefresh({
        body: { network, agentIdentifier },
        throwOnError: true,
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.inbox }),
  });
}
