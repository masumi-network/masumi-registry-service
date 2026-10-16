import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { postRegistryEntry, type RegistryEntry } from '@/lib/api/generated';
import type { Client } from '@/lib/api/generated/client';
import {
  buildRegistryQueryBody,
  type AgentFilters,
  type Network,
  type RegistryQueryBody,
} from '@/lib/agent-filters';
import {
  flattenInclusiveCursorPages,
  nextInclusiveCursor,
  type InclusiveCursorPage,
} from '@/lib/pagination/cursor-pagination';
import { queryKeys } from './query-keys';

// POST /registry-entry caps `limit` at 50 (queryRegistrySchemaInput).
const API_MAX_LIMIT = 50;

const entryKey = (entry: RegistryEntry) => entry.id;

export async function fetchRegistryEntries(
  body: RegistryQueryBody,
  signal?: AbortSignal,
  client?: Client,
): Promise<RegistryEntry[]> {
  const { data } = await postRegistryEntry({ body, signal, throwOnError: true, client });
  // A proxy error page can arrive as a 200 with a non-JSON body.
  if (!Array.isArray(data?.data?.entries)) throw new Error('Unexpected registry entry response');
  return data.data.entries;
}

/**
 * The agent list for one view, a page at a time ("Load more"). The registry's cursor is
 * inclusive, so later pages repeat a row; `agents` is the de-duplicated list to render.
 */
export function useAgents(filters: AgentFilters, network: Network, enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.agentList(network, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<InclusiveCursorPage<RegistryEntry>> => {
      // A later page spends its first row on the repeated cursor row, so it asks for one
      // more to still add a full page, within the API's maximum.
      const limit = pageParam ? Math.min(filters.pageSize + 1, API_MAX_LIMIT) : filters.pageSize;
      const body = buildRegistryQueryBody(filters, network, { limit, cursorId: pageParam });
      const items = await fetchRegistryEntries(body, signal);
      return { items, limit, cursorId: pageParam };
    },
    getNextPageParam: (lastPage) => nextInclusiveCursor(lastPage, entryKey),
    enabled,
  });

  const pages = query.data?.pages;
  const agents = useMemo(
    () => flattenInclusiveCursorPages(pages?.map((page) => page.items) ?? [], entryKey),
    [pages],
  );

  return { query, agents };
}
