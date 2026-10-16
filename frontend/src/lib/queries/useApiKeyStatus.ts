import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getApiKeyStatus, type ApiKey } from '@/lib/api/generated';
import type { Client } from '@/lib/api/generated/client';
import { queryKeys } from './query-keys';

/** Reads the status of the key currently set with `setApiKey`. Throws on any failure. */
export async function fetchApiKeyStatus(signal?: AbortSignal, client?: Client): Promise<ApiKey> {
  const { data } = await getApiKeyStatus({ signal, throwOnError: true, client });
  // A proxy error page can arrive as a 200 with a non-JSON body.
  if (!data?.data?.permission) throw new Error('Unexpected API key status response');
  return data.data;
}

/**
 * Permission, usage credits and limit of the signed-in key. This is the one place
 * that decides what the session may do; pass `enabled: false` while no key is set.
 * Rejected keys are not retried: see the default `retry` in get-query-client.
 */
export function useApiKeyStatus(enabled = true, client?: Client): UseQueryResult<ApiKey> {
  return useQuery({
    queryKey: queryKeys.apiKeyStatus,
    queryFn: ({ signal }) => fetchApiKeyStatus(signal, client),
    enabled,
  });
}
