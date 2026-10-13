import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getHealth, type GetHealthResponse } from '@/lib/api/generated';
import { queryKeys } from './query-keys';

/** Registry API reachability and version. Public endpoint, no API key needed. */
export function useHealth(): UseQueryResult<GetHealthResponse> {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async ({ signal }) => {
      const { data } = await getHealth({ signal, throwOnError: true });
      // A proxy error page can arrive as a 200 with a non-JSON body.
      if (!data?.data?.version) throw new Error('Unexpected health response');
      return data;
    },
  });
}
