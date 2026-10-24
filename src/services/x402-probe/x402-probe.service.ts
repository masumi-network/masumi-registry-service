import { Semaphore } from 'async-mutex';
import { $Enums, type Prisma } from '@prisma/client';
import {
  x402ProbeRepository,
  type X402ProbeRecord,
} from '@/repositories/x402-probe';
import { x402ManifestSchema } from '@/services/spec-validation';
import { logger } from '@/utils/logger';
import { pinnedGet } from '@/utils/pinned-fetch';
import {
  compareChallengeToSources,
  parseX402Challenge,
  type RegisteredSource,
} from './challenge';
import { selectProbeTargets, type ProbeCandidateEntry } from './select-targets';

// Every resource is a request to a third party, and every value comes from an
// untrusted manifest, so all of this is bounded.
const MAX_RESOURCES_PER_ENTRY_PER_CYCLE = 25;
const MAX_PROBES_PER_CYCLE = 500;
const MAX_PROBES_PER_HOST_PER_CYCLE = 25;
// ponytail: only the first 100 resources of a manifest are tracked; raise (and
// paginate the endpoint) if agents with larger resource sets need coverage.
const MAX_TRACKED_RESOURCES_PER_ENTRY = 100;
// Beyond this the (entryId, resource) unique index cannot store the URL.
const MAX_RESOURCE_URL_LENGTH = 2048;
const MAX_STORED_TEXT_LENGTH = 500;
// Stops starting probes after this long, so one cycle (and a shutdown waiting
// for it) cannot run unbounded.
const CYCLE_BUDGET_MS = 10 * 60 * 1000;
// Probing resolves hostnames through the libuv pool (4 threads, shared with the
// rest of the process); a hostile DNS server must not be able to hold it all.
const ENTRY_CONCURRENCY = 2;
export const X402_PROBE_ENTRY_PAGE_SIZE = 50;

const clip = (text: string) => text.slice(0, MAX_STORED_TEXT_LENGTH);

// Storable and requestable as written: no whitespace or control characters.
const isStorableUrl = (value: string) =>
  value.length <= MAX_RESOURCE_URL_LENGTH && !/[\s\p{Cc}]/u.test(value);

// The same request, spelled differently: scheme/host case, fragment.
function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/**
 * The http resources of the cached manifest, or null when there is none. A
 * manifest too large to cache has no snapshot and is not probed: the probe never
 * contacts an agent-supplied manifest URL itself.
 */
export function manifestResources(spec: unknown): string[] | null {
  const manifest = x402ManifestSchema.safeParse(spec);
  if (!manifest.success) return null;
  const seen = new Set<string>();
  const resources: string[] = [];
  for (const { resource, type } of manifest.data.resources) {
    if (type === 'mcp' || !isStorableUrl(resource)) continue;
    const key = canonicalUrl(resource);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    resources.push(resource);
    if (resources.length >= MAX_TRACKED_RESOURCES_PER_ENTRY) break;
  }
  return resources;
}

// Pass 1: what could be probed, and when each resource was last probed. Rows of
// resources that left (or fell outside) the tracked set are dropped here.
async function collectCandidates(): Promise<ProbeCandidateEntry[]> {
  const candidates: ProbeCandidateEntry[] = [];
  let afterId: string | undefined;
  for (;;) {
    const page = await x402ProbeRepository.listProbeableEntries({
      afterId,
      take: X402_PROBE_ENTRY_PAGE_SIZE,
    });
    if (page.length === 0) return candidates;
    afterId = page[page.length - 1].id;

    const known = new Map<string, Map<string, Date>>();
    for (const row of await x402ProbeRepository.getProbeTimes(
      page.map((entry) => entry.id)
    )) {
      const times = known.get(row.registryEntryId) ?? new Map<string, Date>();
      times.set(row.resource, row.checkedAt);
      known.set(row.registryEntryId, times);
    }

    for (const entry of page) {
      const resources = manifestResources(entry.spec);
      if (resources == null) continue;
      const lastProbedAt = known.get(entry.id) ?? new Map<string, Date>();
      const tracked = new Set(resources);
      const stale = [...lastProbedAt.keys()].filter((r) => !tracked.has(r));
      if (stale.length > 0) {
        await x402ProbeRepository.deleteProbes(entry.id, stale);
      }
      candidates.push({ entryId: entry.id, resources, lastProbedAt });
    }
    if (page.length < X402_PROBE_ENTRY_PAGE_SIZE) return candidates;
  }
}

const OUTCOME_BY_KIND = {
  challenge: $Enums.X402ProbeOutcome.Payable,
  free: $Enums.X402ProbeOutcome.Free,
  'unsupported-method': $Enums.X402ProbeOutcome.Unsupported,
  invalid: $Enums.X402ProbeOutcome.Invalid,
  unreachable: $Enums.X402ProbeOutcome.Unreachable,
} as const;

function emptyRecord(
  resource: string,
  checkedAt = new Date()
): Omit<X402ProbeRecord, 'outcome'> {
  return {
    resource,
    httpStatus: null,
    x402Version: null,
    accepts: null,
    matchesRegisteredSources: null,
    mismatches: [],
    reason: null,
    checkedAt,
  };
}

async function probeResource(
  resource: string,
  sources: RegisteredSource[]
): Promise<X402ProbeRecord> {
  const base = emptyRecord(resource);
  try {
    const response = await pinnedGet(resource);
    if (!response.ok) {
      return {
        ...base,
        outcome: response.unreachable
          ? $Enums.X402ProbeOutcome.Unreachable
          : $Enums.X402ProbeOutcome.Invalid,
        reason: clip(response.reason),
      };
    }
    const parsed = parseX402Challenge(response);
    const accepts = parsed.kind === 'challenge' ? parsed.accepts : null;
    // Only a challenge or a free answer says anything about pricing.
    const compared =
      parsed.kind === 'challenge' || parsed.kind === 'free'
        ? compareChallengeToSources({ resource, accepts, sources })
        : { matches: null, mismatches: [] };
    return {
      ...base,
      outcome: OUTCOME_BY_KIND[parsed.kind],
      httpStatus: response.status,
      x402Version: parsed.kind === 'challenge' ? parsed.x402Version : null,
      accepts: accepts as Prisma.InputJsonValue | null,
      matchesRegisteredSources: compared.matches,
      mismatches: compared.mismatches.map(clip),
      reason: 'reason' in parsed ? clip(parsed.reason) : null,
    };
  } catch (error) {
    return {
      ...base,
      outcome: $Enums.X402ProbeOutcome.Unreachable,
      reason: clip(error instanceof Error ? error.message : 'probe failed'),
    };
  }
}

// A result that cannot be stored must still move the resource's checkedAt, or
// it would stay "never probed" and be selected first, every cycle, forever.
async function persist(entryId: string, record: X402ProbeRecord) {
  const failure = (message: string) => (error: unknown) =>
    logger.warn(message, {
      entryId,
      resource: record.resource,
      error: error instanceof Error ? error.message : String(error),
    });
  try {
    await x402ProbeRepository.saveProbe(entryId, record);
  } catch (error) {
    failure('Failed to save x402 probe result, storing a minimal one')(error);
    await x402ProbeRepository
      .saveProbe(entryId, {
        ...emptyRecord(record.resource, record.checkedAt),
        outcome: $Enums.X402ProbeOutcome.Invalid,
        reason: 'result could not be stored',
      })
      .catch(failure('Failed to save even a minimal x402 probe result'));
  }
}

async function probeEntry(
  target: { entryId: string; resources: string[] },
  sources: RegisteredSource[],
  isStopped: () => boolean
): Promise<number> {
  let probed = 0;
  for (const resource of target.resources) {
    if (isStopped()) break;
    const record = await probeResource(resource, sources);
    probed += 1;
    await persist(target.entryId, record);
  }
  return probed;
}

/**
 * Background job (MAS-455): send an unpaid GET to each x402 resource a valid
 * manifest declares, record what it answers, and compare the live challenge
 * with the entry's registered payment sources. Informational only — it never
 * changes an entry's status.
 */
export async function updateX402Probes(
  options: { budgetMs?: number; shouldStop?: () => boolean } = {}
): Promise<{ probed: number }> {
  const deadline = Date.now() + (options.budgetMs ?? CYCLE_BUDGET_MS);
  const isStopped = () =>
    Date.now() >= deadline || options.shouldStop?.() === true;
  if (isStopped()) return { probed: 0 };

  const targets = selectProbeTargets(await collectCandidates(), {
    maxPerEntry: MAX_RESOURCES_PER_ENTRY_PER_CYCLE,
    maxTotal: MAX_PROBES_PER_CYCLE,
    maxPerHost: MAX_PROBES_PER_HOST_PER_CYCLE,
  });
  if (targets.length === 0) return { probed: 0 };

  const entries = await x402ProbeRepository.getEntriesWithSources(
    targets.map((target) => target.entryId)
  );
  const sourcesByEntry = new Map(
    entries.map((entry) => [entry.id, entry.SupportedPaymentSources])
  );

  const semaphore = new Semaphore(ENTRY_CONCURRENCY);
  const results = await Promise.allSettled(
    targets.map((target) =>
      semaphore.runExclusive(() =>
        probeEntry(target, sourcesByEntry.get(target.entryId) ?? [], isStopped)
      )
    )
  );
  let probed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') probed += result.value;
    else {
      logger.error('x402 probe of an entry failed', {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  }
  logger.info('Finished probing x402 resources', {
    probed,
    entries: targets.length,
  });
  return { probed };
}

/**
 * What the registry last saw when it probed an x402 agent's resources. Null for
 * an unknown agent or one that is not an X402 entry (it has no resources).
 */
export async function getAgentX402Probes(params: {
  network: $Enums.Network;
  agentIdentifier: string;
}) {
  const entry = await x402ProbeRepository.getProbesByIdentifier(params);
  if (entry == null || entry.type !== $Enums.RegistryEntryType.X402) {
    return null;
  }
  return {
    agentIdentifier: params.agentIdentifier,
    status: entry.status,
    resources: entry.X402ResourceProbes,
  };
}
