import { Semaphore } from 'async-mutex';
import { x402DiscoveryRepository } from '@/repositories/x402-discovery';
import {
  checkX402Manifest,
  x402ManifestSchema,
} from '@/services/spec-validation';
import { CONFIG } from '@/utils/config';
import { pinnedGet } from '@/utils/pinned-fetch';
import { canonicalUrl } from '@/utils/resource-url';
import {
  buildSuggestedManifest,
  groupByHost,
  normalizeBazaarItem,
  type DiscoveredCandidate,
  type DiscoveredResource,
} from './normalize';

// Every call is a request to a third party and every value is untrusted.
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
// Per cached address: bounds memory (entries x resources x schemas).
const MAX_SCHEMA_BYTES_PER_ADDRESS = 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 50;
// Uncached lookups the facilitator sees from this process: a key can name any
// address, so each one is a guaranteed miss.
const MAX_UPSTREAM_CONCURRENCY = 4;
const MAX_UPSTREAM_LOOKUPS_PER_MINUTE = 60;

export class X402DiscoveryError extends Error {}
/** Too many uncached lookups right now; the caller should retry later. */
export class X402DiscoveryBusyError extends X402DiscoveryError {}

interface DiscoveryCandidate extends DiscoveredCandidate {
  /** A manifest the registry would accept, or null if none would validate. */
  suggestedManifest: ReturnType<typeof buildSuggestedManifest> | null;
  manifestValid: boolean;
  /**
   * A stored X402 entry lists one of these resources. A hint, not proof of
   * ownership: anyone can register an entry that names an address.
   */
  registered: boolean;
}

export interface DiscoveryResult {
  payTo: string;
  candidates: DiscoveryCandidate[];
  /** The facilitator holds more resources than were read. */
  truncated: boolean;
  /** X402 entries that sell to this address on any registry network. */
  registeredEntries: {
    assetIdentifier: string;
    network: string;
    status: string;
  }[];
}

interface Fetched {
  resources: DiscoveredResource[];
  truncated: boolean;
}

// One bounded map for both outcomes: a fetched catalog, or a recent failure
// (so a struggling facilitator is not hammered).
type Settled =
  | { expiresAt: number; value: Fetched }
  | { expiresAt: number; error: string };
const settled = new Map<string, Settled>();
const inFlight = new Map<string, Promise<Fetched>>();
const upstream = new Semaphore(MAX_UPSTREAM_CONCURRENCY);
let lookupTimes: number[] = [];

function remember(key: string, entry: Settled) {
  // Re-inserting moves the key to the end, so FIFO eviction drops the oldest.
  settled.delete(key);
  if (settled.size >= MAX_CACHE_ENTRIES) {
    settled.delete(settled.keys().next().value as string);
  }
  settled.set(key, entry);
}

async function fetchPage(payTo: string, offset: number) {
  const url = `${CONFIG.X402_DISCOVERY_FACILITATOR_URL}/discovery/merchant?payTo=${encodeURIComponent(payTo)}&limit=${PAGE_SIZE}&offset=${offset}`;
  const response = await pinnedGet(url, {
    readBodyFor: (status) => status === 200,
    maxBodyBytes: MAX_BODY_BYTES,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  if (!response.ok || response.status !== 200) {
    throw new X402DiscoveryError(
      response.ok
        ? `facilitator answered HTTP ${response.status}`
        : `facilitator request failed: ${response.reason}`
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw new X402DiscoveryError('facilitator answered with invalid JSON');
  }
  const record = (body ?? {}) as Record<string, unknown>;
  // Coinbase CDP answers `resources`; the x402 spec's list shape is `items`.
  const list = Array.isArray(record.resources)
    ? record.resources
    : Array.isArray(record.items)
      ? record.items
      : null;
  if (list == null) {
    throw new X402DiscoveryError(
      'facilitator answered without a resource list'
    );
  }
  const total = (record.pagination as { total?: unknown } | undefined)?.total;
  return {
    // A facilitator may ignore `limit`: never take more than a page.
    list: list.slice(0, PAGE_SIZE),
    total: Number.isSafeInteger(total) ? (total as number) : null,
  };
}

async function walkCatalog(payTo: string): Promise<Fetched> {
  const resources = new Map<string, DiscoveredResource>();
  let seen = 0;
  let total: number | null = null;
  let pages = 0;
  let more = false;
  let schemaBytes = 0;
  while (pages < MAX_PAGES) {
    // Advance by what was received: a facilitator may clamp the page size.
    const page = await fetchPage(payTo, seen);
    pages += 1;
    total = page.total;
    seen += page.list.length;
    for (const raw of page.list) {
      const resource = normalizeBazaarItem(raw);
      if (resource == null) continue;
      // Only accepts that pay this address: the catalog is open to anyone, and
      // a lookup by address must not return other sellers' prices.
      const accepts = resource.accepts.filter(
        (accept) => accept.payTo.toLowerCase() === payTo
      );
      if (accepts.length === 0) continue;
      const key = canonicalUrl(resource.resource) ?? resource.resource;
      if (resources.has(key)) continue;
      schemaBytes += JSON.stringify([
        resource.inputSchema,
        resource.outputSchema,
      ]).length;
      resources.set(
        key,
        schemaBytes > MAX_SCHEMA_BYTES_PER_ADDRESS
          ? { ...resource, accepts, inputSchema: null, outputSchema: null }
          : { ...resource, accepts }
      );
    }
    more =
      page.list.length > 0 &&
      (total == null ? page.list.length === PAGE_SIZE : seen < total);
    if (!more) break;
  }
  // An empty page while the facilitator still reports more is also truncated.
  const truncated = more || (total != null && seen < total);
  return { resources: [...resources.values()], truncated };
}

function lookupUpstream(key: string, payTo: string): Promise<Fetched> {
  const now = Date.now();
  lookupTimes = lookupTimes.filter((time) => now - time < 60_000);
  if (lookupTimes.length >= MAX_UPSTREAM_LOOKUPS_PER_MINUTE) {
    throw new X402DiscoveryBusyError('too many facilitator lookups');
  }
  lookupTimes.push(now);

  const run = upstream
    .runExclusive(() => walkCatalog(payTo))
    .then((value) => {
      remember(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    })
    .catch((error: unknown) => {
      // Brief negative cache: do not hammer a struggling facilitator.
      remember(key, {
        expiresAt: Date.now() + FAILURE_TTL_MS,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function fetchResources(payTo: string): Promise<Fetched> {
  const key = `${CONFIG.X402_DISCOVERY_FACILITATOR_URL}|${payTo}`;
  const hit = settled.get(key);
  if (hit != null && hit.expiresAt > Date.now()) {
    if ('error' in hit) throw new X402DiscoveryError(hit.error);
    return hit.value;
  }
  return inFlight.get(key) ?? lookupUpstream(key, payTo);
}

// The registry's own validator decides, resource by resource: a schema it would
// reject (unknown dialect, too deep) is dropped from that resource only, so a
// suggestion always registers cleanly.
function suggestManifest(resources: DiscoveredResource[]) {
  const usable = resources.map((resource) =>
    checkX402Manifest(buildSuggestedManifest([resource])).outcome === 'valid'
      ? resource
      : { ...resource, inputSchema: null, outputSchema: null }
  );
  const manifest = buildSuggestedManifest(usable);
  return checkX402Manifest(manifest).outcome === 'valid' ? manifest : null;
}

function listedResources(spec: unknown): string[] {
  const manifest = x402ManifestSchema.safeParse(spec);
  return manifest.success
    ? manifest.data.resources.map(
        (item) => canonicalUrl(item.resource) ?? item.resource
      )
    : [];
}

/**
 * Discover the x402 APIs a facilitator's catalog holds for one seller address,
 * grouped into candidate agents with a ready-to-use manifest each. Read-only:
 * nothing is registered, and the registry cannot mint.
 */
export async function discoverX402ByPayTo(params: {
  payTo: string;
  caip2Network?: string;
}): Promise<DiscoveryResult> {
  const payTo = params.payTo.toLowerCase();
  const { resources, truncated } = await fetchResources(payTo);
  const network = params.caip2Network;
  const selected =
    network == null
      ? resources
      : resources.flatMap((resource) => {
          const accepts = resource.accepts.filter((a) => a.network === network);
          return accepts.length > 0 ? [{ ...resource, accepts }] : [];
        });

  const entries = await x402DiscoveryRepository.findRegisteredByPayTo(payTo);
  const listed = new Set(
    entries.flatMap((entry) => listedResources(entry.spec))
  );

  return {
    payTo,
    truncated,
    registeredEntries: entries.map((entry) => ({
      assetIdentifier: entry.assetIdentifier,
      network: entry.RegistrySource.network,
      status: entry.status,
    })),
    candidates: groupByHost(selected).map((candidate) => {
      const suggestedManifest = suggestManifest(candidate.resources);
      return {
        ...candidate,
        suggestedManifest,
        manifestValid: suggestedManifest != null,
        registered: candidate.resources.some((r) =>
          listed.has(canonicalUrl(r.resource) ?? r.resource)
        ),
      };
    }),
  };
}
