import type { RegistryEntry } from '@/lib/api/generated';

type HealthFields = Pick<
  RegistryEntry,
  'status' | 'type' | 'apiBaseUrl' | 'openApiSpecUrl' | 'x402ResourcesUrl' | 'A2A'
>;

export const SPEC_NAMES: Record<Exclude<RegistryEntry['type'], 'Standard'>, string> = {
  OpenApi: 'OpenAPI document',
  X402: 'x402 resource manifest',
  A2A: 'A2A agent card',
};

const SPEC_RULES: Record<Exclude<RegistryEntry['type'], 'Standard'>, string> = {
  OpenApi:
    'It must be JSON or YAML, at most 5 MiB, declare OpenAPI 3.0 or 3.1 with an info title and version, and contain paths, components or webhooks.',
  X402: 'It must be JSON, at most 5 MiB, list at least one resource with a valid URL, and every input or output schema must be valid JSON Schema.',
  A2A: 'It must be served over HTTPS, be a valid agent card, and support every protocol version the entry declares.',
};

/** Where an OpenApi, x402 or A2A entry's spec lives; null for Standard entries and missing URLs. */
export function specUrl(entry: HealthFields): string | null {
  if (entry.type === 'Standard') return null;
  if (entry.type === 'OpenApi') return entry.openApiSpecUrl;
  if (entry.type === 'X402') return entry.x402ResourcesUrl;
  return entry.A2A?.agentCardUrl ?? null;
}

/**
 * Why the last health check left an entry Offline, Invalid or Deregistered; null when it
 * is Online. The registry does not store the reason, so this restates the health check's
 * rules (src/services/health-check and spec-validation) for the entry's type, narrowed by
 * what the entry itself shows.
 */
export function explainStatus(entry: HealthFields): string | null {
  if (entry.status === 'Online') return null;
  if (entry.status === 'Deregistered') {
    return 'Its registry NFT was burned on chain, so the agent is no longer registered. The entry is kept for its history.';
  }

  if (entry.type === 'Standard') {
    const endpoint = `${entry.apiBaseUrl ?? 'The API base URL'}/availability`;
    return entry.status === 'Offline'
      ? `${endpoint} did not answer the last check: it was unreachable, took longer than 32 seconds, or returned an error status.`
      : `${endpoint} answered with a different agent identifier, did not identify itself as a Masumi agent, or the API base URL points to a private or blocked address.`;
  }

  const name = SPEC_NAMES[entry.type];
  const url = specUrl(entry);
  if (entry.status === 'Offline') {
    return `The ${name} at ${url ?? 'its URL'} could not be fetched: it was unreachable, took longer than 20 seconds, redirected, returned an error status, or points to a private or blocked address.`;
  }
  if (url == null) return `The entry's metadata has no ${name} URL.`;
  if (entry.type === 'A2A' && (entry.A2A?.protocolVersions.length ?? 0) === 0) {
    return 'The entry declares no A2A protocol versions.';
  }
  return `The ${name} at ${url} failed validation. ${SPEC_RULES[entry.type]}`;
}
