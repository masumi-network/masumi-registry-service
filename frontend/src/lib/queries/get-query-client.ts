import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { classifyAuthError } from '@/lib/auth/errors';
import { queryKeys } from './query-keys';

// A rejected key will not improve by asking again; an unreachable API might.
function shouldRetry(failureCount: number, error: unknown): boolean {
  return classifyAuthError(error).kind === 'unavailable' && failureCount < 1;
}

function makeQueryClient() {
  // A 401/403 from any call means the key's standing may have changed since its status
  // was read (revoked, or demoted from Admin). Re-read the status: it is the single place
  // that decides what the session may do, and it signs the user out if the key is no
  // longer accepted. Needs the generated client to throw, see createClientConfig.
  function revalidateKeyOnAuthFailure(error: unknown) {
    if (classifyAuthError(error).kind === 'unavailable') return;
    // Many calls failing together must not keep restarting the same status read.
    void queryClient.invalidateQueries(
      { queryKey: queryKeys.apiKeyStatus },
      { cancelRefetch: false },
    );
  }

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] === queryKeys.apiKeyStatus[0]) return;
        revalidateKeyOnAuthFailure(error);
      },
    }),
    mutationCache: new MutationCache({ onError: (error) => revalidateKeyOnAuthFailure(error) }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
    },
  });
  return queryClient;
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
