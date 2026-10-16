import type { AxiosInstance } from 'axios';
import type { Client } from '@/lib/api/generated/client';
import { isApiAuthRejection } from '@/lib/utils';

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
