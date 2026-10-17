import type { AxiosInstance } from 'axios';
import type { Client } from '@/lib/api/generated/client';
import { createClient } from '@/lib/api/generated/client';
import { isApiAuthRejection } from '@/lib/utils';

const registryBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

function asAxiosInstance(value: unknown): AxiosInstance | null {
  if (!value || typeof value !== 'object' || !('interceptors' in value)) return null;
  return value as AxiosInstance;
}

/** Signs the user out when the registry rejects the API key (401/403). */
export function attachUnauthorizedSignOut(client: Client, signOut: () => void): void {
  const axios = asAxiosInstance(client.getConfig().axios);
  if (!axios) return;

  axios.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (isApiAuthRejection(error)) {
        signOut();
      }
      return Promise.reject(error);
    },
  );
}

/** AppContext API client with token header (and optional 401 sign-out). */
export function createRegistryClient(token: string | null, signOut?: () => void): Client {
  const client = createClient({
    headers: { token: token ?? 'invalid-api' },
    baseURL: registryBaseUrl(),
  });
  if (signOut) attachUnauthorizedSignOut(client, signOut);
  return client;
}
