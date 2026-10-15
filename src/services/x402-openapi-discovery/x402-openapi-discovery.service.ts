import { Semaphore } from 'async-mutex';
import { $Enums, type Prisma } from '@prisma/client';
import {
  x402OpenApiDiscoveryRepository,
  type X402OpenApiDiscoveryRecord,
} from '@/repositories/x402-openapi-discovery';
import { x402ProbeRepository } from '@/repositories/x402-probe';
import { isCacheableSpec } from '@/services/health-check/spec-entry-check';
import {
  X402_PROBE_ENTRY_PAGE_SIZE,
  manifestResources,
} from '@/services/x402-probe/x402-probe.service';
import { logger } from '@/utils/logger';
import { pinnedGet } from '@/utils/pinned-fetch';
import { parseDiscoveredDocument } from './parse-document';
import {
  openApiCandidateUrls,
  originsOf,
  parseServiceDescLink,
} from './candidates';

// Every origin comes from an untrusted manifest and costs up to one request per
// candidate location, so all of this is bounded.
const MAX_ORIGINS_PER_ENTRY = 5;
const MAX_ORIGINS_PER_CYCLE = 100;
// Lookups run on the libuv pool (4 threads, shared with the rest of the
// process); a hostile DNS server must not be able to hold all of it, so only two
// origins are in flight at once, as in the probe job.
const ORIGIN_CONCURRENCY = 2;
// An origin that fails to answer this many candidates is given up on, so a
// tarpit costs two timeouts, not one per candidate.
const MAX_CANDIDATE_FAILURES = 2;
// A document over this is reported Invalid without being read.
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_STORED_TEXT_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
// Stops starting origins after this long, so one cycle (and a shutdown waiting
// for it) cannot run unbounded.
const CYCLE_BUDGET_MS = 10 * 60 * 1000;
const NEVER_CHECKED = -1;
const DOCUMENT_ACCEPT =
  'application/json, application/yaml, text/yaml, text/plain';

const clip = (text: string, length = MAX_STORED_TEXT_LENGTH) =>
  text.slice(0, length);

type DiscoveryResult = Omit<X402OpenApiDiscoveryRecord, 'origin' | 'checkedAt'>;

const emptyResult = (
  outcome: $Enums.X402OpenApiDiscoveryOutcome,
  reason: string | null = null
): DiscoveryResult => ({
  outcome,
  specUrl: null,
  openApiVersion: null,
  title: null,
  spec: null,
  reason,
});

function foundResult(specUrl: string, spec: unknown): DiscoveryResult {
  const doc = spec as { openapi: string; info: { title: string } };
  return {
    outcome: $Enums.X402OpenApiDiscoveryOutcome.Found,
    specUrl,
    openApiVersion: doc.openapi,
    title: clip(doc.info.title, MAX_TITLE_LENGTH),
    // Only a modest document sits inline; a larger one stays reachable by URL.
    spec: isCacheableSpec(spec) ? (spec as Prisma.InputJsonValue) : null,
    reason: null,
  };
}

/**
 * Look for an OpenAPI document at one origin: the one its root advertises in a
 * `Link: rel="service-desc"` header, then the conventional paths. The first
 * valid document wins. Null when asked to stop part-way, so the origin is not
 * recorded as checked.
 */
async function discoverOrigin(
  origin: string,
  isStopped: () => boolean
): Promise<DiscoveryResult | null> {
  const root = await pinnedGet(`${origin}/`);
  if (!root.ok) {
    return emptyResult(
      root.unreachable
        ? $Enums.X402OpenApiDiscoveryOutcome.Unreachable
        : $Enums.X402OpenApiDiscoveryOutcome.Invalid,
      clip(root.reason)
    );
  }

  const yamlBudget = { yamlParsesLeft: 1 };
  let invalidReason: string | null = null;
  let failureReason: string | null = null;
  let failures = 0;
  const advertised = parseServiceDescLink(root.headers.link, origin);
  for (const url of openApiCandidateUrls(origin, advertised)) {
    if (isStopped()) return null;
    const response = await pinnedGet(url, {
      readBodyFor: [200],
      accept: DOCUMENT_ACCEPT,
      maxBodyBytes: MAX_DOCUMENT_BYTES,
    });
    if (!response.ok) {
      if (!response.unreachable) {
        invalidReason ??= clip(response.reason);
        continue;
      }
      // The root answered, so this is one path that did not: it only decides
      // the outcome when nothing else was found.
      failureReason ??= clip(response.reason);
      failures += 1;
      if (failures >= MAX_CANDIDATE_FAILURES) break;
      continue;
    }
    // Redirects are never followed and any other status is just "not here".
    if (response.status !== 200) continue;

    const parsed = parseDiscoveredDocument(response.body, yamlBudget);
    if (parsed.outcome === 'valid') return foundResult(url, parsed.spec);
    invalidReason ??= clip(
      parsed.outcome === 'invalid' ? parsed.reason : 'not a document'
    );
  }
  if (invalidReason != null) {
    return emptyResult(
      $Enums.X402OpenApiDiscoveryOutcome.Invalid,
      invalidReason
    );
  }
  if (failureReason != null) {
    return emptyResult(
      $Enums.X402OpenApiDiscoveryOutcome.Unreachable,
      failureReason
    );
  }
  return emptyResult($Enums.X402OpenApiDiscoveryOutcome.NotFound);
}

interface Target {
  entryId: string;
  origin: string;
  checkedAt: number;
}

// What could be discovered, and when each (entry, origin) was last checked. Rows
// of origins that left (or fell outside) the tracked set are dropped here.
async function collectTargets(): Promise<Target[]> {
  const targets: Target[] = [];
  let afterId: string | undefined;
  for (;;) {
    const page = await x402ProbeRepository.listProbeableEntries({
      afterId,
      take: X402_PROBE_ENTRY_PAGE_SIZE,
    });
    if (page.length === 0) return targets;
    afterId = page[page.length - 1].id;

    const known = new Map<string, Map<string, Date>>();
    for (const row of await x402OpenApiDiscoveryRepository.getDiscoveryTimes(
      page.map((entry) => entry.id)
    )) {
      const times = known.get(row.registryEntryId) ?? new Map<string, Date>();
      times.set(row.origin, row.checkedAt);
      known.set(row.registryEntryId, times);
    }

    for (const entry of page) {
      const resources = manifestResources(entry.spec);
      if (resources == null) continue;
      const origins = originsOf(resources, MAX_ORIGINS_PER_ENTRY);
      const checked = known.get(entry.id) ?? new Map<string, Date>();
      const tracked = new Set(origins);
      const stale = [...checked.keys()].filter(
        (origin) => !tracked.has(origin)
      );
      if (stale.length > 0) {
        await x402OpenApiDiscoveryRepository.deleteDiscoveries(entry.id, stale);
      }
      for (const origin of origins) {
        targets.push({
          entryId: entry.id,
          origin,
          checkedAt: checked.get(origin)?.getTime() ?? NEVER_CHECKED,
        });
      }
    }
    if (page.length < X402_PROBE_ENTRY_PAGE_SIZE) return targets;
  }
}

// A result that cannot be stored must still move the origin's checkedAt, or it
// would stay "never checked" and be selected first, every cycle, forever.
async function persist(
  entryId: string,
  origin: string,
  result: DiscoveryResult
) {
  const checkedAt = new Date();
  const failure = (message: string) => (error: unknown) =>
    logger.warn(message, {
      entryId,
      origin,
      error: error instanceof Error ? error.message : String(error),
    });
  try {
    await x402OpenApiDiscoveryRepository.saveDiscovery(entryId, {
      ...result,
      origin,
      checkedAt,
    });
  } catch (error) {
    failure('Failed to save x402 OpenAPI discovery, storing a minimal one')(
      error
    );
    await x402OpenApiDiscoveryRepository
      .saveDiscovery(entryId, {
        ...emptyResult(
          $Enums.X402OpenApiDiscoveryOutcome.Invalid,
          'result could not be stored'
        ),
        origin,
        checkedAt,
      })
      .catch(failure('Failed to save even a minimal x402 OpenAPI discovery'));
  }
}

async function safelyDiscover(
  origin: string,
  isStopped: () => boolean
): Promise<DiscoveryResult | null> {
  try {
    return await discoverOrigin(origin, isStopped);
  } catch (error) {
    return emptyResult(
      $Enums.X402OpenApiDiscoveryOutcome.Unreachable,
      clip(error instanceof Error ? error.message : 'discovery failed')
    );
  }
}

/**
 * Background job (MAS-453): for each origin the resources of a valid x402
 * manifest live on, look for the OpenAPI document that describes it and record
 * what was found. Informational only — it never changes an entry's status.
 */
export async function updateX402OpenApiDiscoveries(
  options: { maxOrigins?: number; shouldStop?: () => boolean } = {}
): Promise<{ discovered: number }> {
  const deadline = Date.now() + CYCLE_BUDGET_MS;
  const isStopped = () =>
    Date.now() >= deadline || options.shouldStop?.() === true;
  if (isStopped()) return { discovered: 0 };

  // The stalest (entry, origin) pairs win, so everything is eventually revisited.
  const targets = (await collectTargets())
    .sort((a, b) => a.checkedAt - b.checkedAt)
    .slice(0, options.maxOrigins ?? MAX_ORIGINS_PER_CYCLE);
  if (targets.length === 0) return { discovered: 0 };

  // Several entries can share an origin: fetch it once, record it for each.
  const semaphore = new Semaphore(ORIGIN_CONCURRENCY);
  const results = new Map<string, Promise<DiscoveryResult | null>>();
  const discover = (origin: string) => {
    const existing = results.get(origin);
    if (existing != null) return existing;
    const started = semaphore.runExclusive(async () =>
      isStopped() ? null : safelyDiscover(origin, isStopped)
    );
    results.set(origin, started);
    return started;
  };

  await Promise.all(
    targets.map(async ({ entryId, origin }) => {
      const result = await discover(origin);
      if (result != null) await persist(entryId, origin, result);
    })
  );

  const discovered = (await Promise.all([...results.values()])).filter(
    (result) => result != null
  ).length;
  logger.info('Finished discovering x402 OpenAPI documents', {
    discovered,
    entries: new Set(targets.map((target) => target.entryId)).size,
  });
  return { discovered };
}

/**
 * What OpenAPI discovery last found at the origins of an x402 agent's
 * resources. Null for an unknown agent or one that is not an X402 entry.
 */
export async function getAgentX402OpenApi(params: {
  network: $Enums.Network;
  agentIdentifier: string;
}) {
  const entry =
    await x402OpenApiDiscoveryRepository.getDiscoveriesByIdentifier(params);
  if (entry == null || entry.type !== $Enums.RegistryEntryType.X402) {
    return null;
  }
  return {
    agentIdentifier: params.agentIdentifier,
    status: entry.status,
    origins: entry.X402OpenApiDiscoveries,
  };
}
