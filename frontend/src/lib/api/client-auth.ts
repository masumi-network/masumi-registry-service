import type { Client } from '@/lib/api/generated/client';
import { createClient } from '@/lib/api/generated/client';
import { isApiAuthRejection } from '@/lib/utils';

const registryBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

/** Signs the user out when the registry rejects the API key (401/403). */
export function attachUnauthorizedSignOut(client: Client, signOut: () => void): void {
  client.instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (isApiAuthRejection(error)) {
        signOut();
      }
      return Promise.reject(error);
    },
  );
}

export const UNAUTHENTICATED_CLIENT_TOKEN = 'invalid-api';

/** AppContext API client with token header (and optional 401 sign-out). */
export function createRegistryClient(token: string | null, signOut?: () => void): Client {
  const client = createClient({
    headers: { token: token ?? UNAUTHENTICATED_CLIENT_TOKEN },
    baseURL: registryBaseUrl(),
    throwOnError: true,
  });
  if (signOut) attachUnauthorizedSignOut(client, signOut);
  return client;
}

/** Clears a probe token from a shared client after failed sign-in or restore. */
export function resetRegistryClientAuth(client: Client): void {
  client.setConfig({ headers: { token: UNAUTHENTICATED_CLIENT_TOKEN } });
}
