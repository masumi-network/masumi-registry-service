import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getCapability } from '@/lib/api/generated';
import { buildCapabilityOptions, type CapabilityOption } from '@/lib/capability-options';
import { collectInclusiveCursorPages } from '@/lib/pagination/cursor-pagination';
import { queryKeys } from './query-keys';

// GET /capability allows at most 100 per page. The registry holds well under one hundred
// distinct name/version pairs today, so the page cap is only a guard against a runaway loop.
const CAPABILITY_PAGE_LIMIT = 100;
const MAX_CAPABILITY_PAGES = 20;
const CAPABILITY_STALE_MS = 5 * 60 * 1000;

/**
 * Every capability name with its versions, for the capability filter. The endpoint only
 * lists capabilities of agents that are Online, on any network.
 */
export function useCapabilityOptions(): UseQueryResult<CapabilityOption[]> {
  return useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: async ({ signal }) => {
      const capabilities = await collectInclusiveCursorPages(
        async (cursorId) => {
          const { data } = await getCapability({
            query: { limit: CAPABILITY_PAGE_LIMIT, cursorId },
            signal,
            throwOnError: true,
          });
          if (!Array.isArray(data?.data?.capabilities)) {
            throw new Error('Unexpected capability response');
          }
          return data.data.capabilities;
        },
        (capability) => capability.id,
        { maxPages: MAX_CAPABILITY_PAGES },
      );
      return buildCapabilityOptions(capabilities);
    },
    staleTime: CAPABILITY_STALE_MS,
  });
}
