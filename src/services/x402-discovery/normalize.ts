import { isIP } from 'node:net';
import { normalizePublicUrl } from '@/utils/public-url';
import { isStorableUrl } from '@/utils/resource-url';
import {
  normalizeAccept,
  type ProbeAccept,
} from '@/services/x402-probe/challenge';

// A facilitator catalog is third-party data that ends up in our API response
// and, through a suggested manifest, in on-chain registrations: bound all of it.
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SERVICE_NAME_LENGTH = 120;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;
const MAX_ACCEPTS = 10;
const MAX_EXTRA_KEYS = 10;
const MAX_EXTRA_VALUE_LENGTH = 128;
const MAX_SCHEMA_BYTES = 16 * 1024;

type DiscoveredAccept = ProbeAccept & {
  extra: Record<string, string | number | boolean> | null;
};

export interface DiscoveredResource {
  resource: string;
  method: string | null;
  description: string | null;
  serviceName: string | null;
  tags: string[];
  x402Version: number | null;
  accepts: DiscoveredAccept[];
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  lastUpdated: string | null;
  quality: {
    l30DaysTotalCalls: number;
    l30DaysUniquePayers: number;
    lastCalledAt: string | null;
  } | null;
}

export interface DiscoveredCandidate {
  host: string;
  serviceName: string | null;
  networks: string[];
  resources: DiscoveredResource[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value != null && !Array.isArray(value);

// Free text from a third party: no control or formatting characters (ANSI
// escapes, bidi overrides), trimmed and bounded.
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return cleaned === '' ? null : cleaned.slice(0, max);
};

// Only what the registry's own probe would actually fetch: a public https host
// name on the default port, without credentials. Anything else is guaranteed to
// be Invalid or Offline once registered, so it is not worth suggesting.
function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !isStorableUrl(value)) return null;
  try {
    const { url, hostname } = normalizePublicUrl(value, {
      allowQuery: true,
      allowHash: true,
      trimTrailingSlash: false,
    });
    const isPlainHttps =
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      isIP(hostname) === 0;
    return isPlainHttps ? value : null;
  } catch {
    return null;
  }
}

// Only small primitive values survive: `extra` is where EIP-712 domain details
// live, and an arbitrary object there is an injection and bloat channel.
function boundedExtra(value: unknown): DiscoveredAccept['extra'] {
  if (!isObject(value)) return null;
  const kept: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Object.keys(kept).length >= MAX_EXTRA_KEYS) break;
    if (key.length > 40) continue;
    if (typeof entry === 'string' && entry.length <= MAX_EXTRA_VALUE_LENGTH) {
      kept[key] = entry;
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      kept[key] = entry;
    } else if (typeof entry === 'boolean') {
      kept[key] = entry;
    }
  }
  return Object.keys(kept).length === 0 ? null : kept;
}

// Deeper than any real request/response schema, and deep enough nesting makes
// validators exhaust the stack.
const MAX_SCHEMA_DEPTH = 32;

function withinDepth(value: unknown, depth = 0): boolean {
  if (depth > MAX_SCHEMA_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.every((entry) => withinDepth(entry, depth + 1));
  }
  if (isObject(value)) {
    return Object.values(value).every((entry) => withinDepth(entry, depth + 1));
  }
  return true;
}

function boundedSchema(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  if ('$schema' in value && typeof value.$schema !== 'string') return null;
  if (!withinDepth(value)) return null;
  try {
    return JSON.stringify(value).length <= MAX_SCHEMA_BYTES ? value : null;
  } catch {
    return null;
  }
}

function lastUpdated(value: unknown): string | null {
  // The x402 spec says unix seconds, but milliseconds turn up as well; CDP
  // sends an ISO string.
  const date =
    typeof value === 'number'
      ? new Date(value > 1e11 ? value : value * 1000)
      : typeof value === 'string'
        ? new Date(value)
        : null;
  return date != null && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : null;
}

function quality(value: unknown): DiscoveredResource['quality'] {
  if (!isObject(value)) return null;
  const { l30DaysTotalCalls: calls, l30DaysUniquePayers: payers } = value;
  if (!Number.isSafeInteger(calls) || !Number.isSafeInteger(payers)) {
    return null;
  }
  return {
    l30DaysTotalCalls: calls as number,
    l30DaysUniquePayers: payers as number,
    lastCalledAt: text(value.lastCalledAt, 40),
  };
}

/**
 * One facilitator-catalog item in a stable shape, or null when it cannot be
 * used. The request/response schemas come from the item itself when it carries
 * them (PayAI) and otherwise from the bazaar extension (Coinbase CDP).
 */
export function normalizeBazaarItem(raw: unknown): DiscoveredResource | null {
  if (!isObject(raw)) return null;
  const resource = httpUrl(raw.resource);
  if (resource == null || (raw.type != null && raw.type !== 'http')) {
    return null;
  }

  const accepts: DiscoveredAccept[] = [];
  for (const candidate of Array.isArray(raw.accepts) ? raw.accepts : []) {
    if (accepts.length >= MAX_ACCEPTS) break;
    const accept = normalizeAccept(candidate);
    if (accept == null) continue;
    accepts.push({
      ...accept,
      extra: boundedExtra(isObject(candidate) ? candidate.extra : null),
    });
  }
  if (accepts.length === 0) return null;

  const bazaar = isObject(raw.extensions) ? raw.extensions.bazaar : null;
  const info = isObject(bazaar) && isObject(bazaar.info) ? bazaar.info : {};
  const input = isObject(info.input) ? info.input : {};
  const schema =
    isObject(bazaar) && isObject(bazaar.schema) ? bazaar.schema : {};
  const schemaProps = isObject(schema.properties) ? schema.properties : {};
  const inputProps =
    isObject(schemaProps.input) && isObject(schemaProps.input.properties)
      ? schemaProps.input.properties
      : {};
  const outputProps =
    isObject(schemaProps.output) && isObject(schemaProps.output.properties)
      ? schemaProps.output.properties
      : {};

  const method = text(raw.method ?? input.method, 7)?.toUpperCase() ?? null;
  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .map((tag) => text(tag, MAX_TAG_LENGTH))
    .filter((tag): tag is string => tag != null)
    .slice(0, MAX_TAGS);

  return {
    resource,
    method: method != null && /^[A-Z]{3,7}$/.test(method) ? method : null,
    description: text(raw.description, MAX_DESCRIPTION_LENGTH),
    serviceName: text(raw.serviceName, MAX_SERVICE_NAME_LENGTH),
    tags,
    x402Version: Number.isSafeInteger(raw.x402Version)
      ? (raw.x402Version as number)
      : null,
    accepts,
    inputSchema:
      boundedSchema(raw.inputSchema) ??
      boundedSchema(inputProps.body) ??
      boundedSchema(inputProps.queryParams),
    outputSchema:
      boundedSchema(raw.outputSchema) ?? boundedSchema(outputProps.example),
    lastUpdated: lastUpdated(raw.lastUpdated),
    quality: quality(raw.quality),
  };
}

const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);

const mostCommon = (values: (string | null)[]): string | null => {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * x402 has no notion of an agent: the catalog is a flat list of priced URLs.
 * Resources sold to one address on one host are the best available "agent".
 */
export function groupByHost(
  resources: readonly DiscoveredResource[]
): DiscoveredCandidate[] {
  const byHost = new Map<string, DiscoveredResource[]>();
  for (const resource of resources) {
    const { host } = new URL(resource.resource);
    byHost.set(host, [...(byHost.get(host) ?? []), resource]);
  }
  return [...byHost]
    .map(([host, items]) => ({
      host,
      serviceName: mostCommon(items.map((item) => item.serviceName)),
      networks: [
        ...new Set(items.flatMap((item) => item.accepts.map((a) => a.network))),
      ].sort(),
      resources: [...items].sort((a, b) => compare(a.resource, b.resource)),
    }))
    .sort(
      (a, b) =>
        b.resources.length - a.resources.length || compare(a.host, b.host)
    );
}

/** A manifest in the registry's own format; the caller validates it before use. */
export function buildSuggestedManifest(
  resources: readonly DiscoveredResource[]
) {
  return {
    x402Version:
      resources.find((item) => item.x402Version != null)?.x402Version ?? 2,
    resources: resources.map((item) => ({
      resource: item.resource,
      type: 'http' as const,
      ...(item.description != null ? { description: item.description } : {}),
      ...(item.inputSchema != null ? { inputSchema: item.inputSchema } : {}),
      ...(item.outputSchema != null ? { outputSchema: item.outputSchema } : {}),
    })),
  };
}
