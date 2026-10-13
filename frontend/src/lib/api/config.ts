import type { CreateClientConfig } from './generated/client.gen';

// The user-supplied registry API key. Kept in memory only, never persisted here.
let apiKey: string | undefined;

/**
 * Sets the key sent on secured operations; `null` stops sending it.
 * Callers changing the key must also clear the query cache, or data fetched
 * under the previous key keeps being served.
 */
export function setApiKey(key: string | null): void {
  apiKey = key ?? undefined;
}

// Loaded by the generated client on init (runtimeConfigPath in openapi-ts.config.ts).
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  // Same origin as the Express server in production; override for `next dev`.
  // Generated paths start with `/`, so a trailing slash here would double it.
  baseURL: (process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL || '/api/v1').replace(/\/+$/, ''),
  // Called per request for operations the spec marks as secured. hey-api puts the
  // result in the header the spec's security scheme names (`token`).
  auth: () => apiKey,
});
