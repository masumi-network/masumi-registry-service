import { Semaphore } from 'async-mutex';
import { $Enums, Prisma } from '@prisma/client';
import { validateSpecUrl, type SpecKind } from '@/services/spec-validation';

// A health-check page can hold many OpenApi/X402 entries, each of which fetches
// its own (untrusted, up-to-5 MiB, up-to-20 s) spec URL. Bound how many run at
// once so a large page can't open a flood of concurrent outbound fetches.
const SPEC_FETCH_CONCURRENCY = 4;
const specFetchSemaphore = new Semaphore(SPEC_FETCH_CONCURRENCY);

/** null for Standard entries (no fetchable spec — use the /availability check). */
export function specKindForType(
  type: $Enums.RegistryEntryType
): SpecKind | null {
  if (type === $Enums.RegistryEntryType.OpenApi) return 'openapi';
  if (type === $Enums.RegistryEntryType.X402) return 'x402';
  return null;
}

export type SpecEntryCheck = { status: $Enums.Status; spec?: unknown };

/**
 * For OpenApi/X402 entries: fetch + validate the advertised spec URL and map the
 * outcome onto the registry Status (valid → Online, invalid → Invalid,
 * unreachable → Offline). The spec is returned only on success so the caller
 * caches a known-good snapshot; a failed check leaves any previously-cached
 * snapshot untouched, and the periodic health loop re-checks next cycle — the
 * existing reconcile/backoff, reused unchanged.
 */
export async function checkSpecEntry(entry: {
  type: $Enums.RegistryEntryType;
  openApiSpecUrl: string | null;
  x402ResourcesUrl: string | null;
}): Promise<SpecEntryCheck> {
  const kind = specKindForType(entry.type);
  const url =
    kind === 'openapi' ? entry.openApiSpecUrl : entry.x402ResourcesUrl;
  if (kind == null || url == null) {
    // A spec-type entry with no URL is malformed metadata; mark Invalid.
    return { status: $Enums.Status.Invalid };
  }
  const outcome = await specFetchSemaphore.runExclusive(() =>
    validateSpecUrl(kind, url)
  );
  switch (outcome.outcome) {
    case 'valid':
      // Online either way; only cache the snapshot when it is small enough to
      // sit inline in the row without bloating every RegistryEntry read.
      return isCacheableSpec(outcome.spec)
        ? { status: $Enums.Status.Online, spec: outcome.spec }
        : { status: $Enums.Status.Online };
    case 'invalid':
      return { status: $Enums.Status.Invalid };
    case 'unreachable':
      return { status: $Enums.Status.Offline };
  }
}

// A validated spec can be up to MAX_SPEC_BYTES (5 MiB); caching that inline in a
// JSONB column would bloat the table and every read. Only cache modest specs;
// larger ones stay valid (Online) but uncached — callers can fetch them live.
const MAX_CACHED_SPEC_BYTES = 256 * 1024;

function isCacheableSpec(spec: unknown): boolean {
  try {
    // Byte length (not char count): a multi-byte spec must not slip past the cap.
    return Buffer.byteLength(JSON.stringify(spec)) <= MAX_CACHED_SPEC_BYTES;
  } catch {
    return false;
  }
}

/**
 * Prisma update fragment that caches a just-validated spec snapshot. Returns an
 * empty object for non-spec results (Standard entries, or a failed check), so a
 * previously-cached snapshot is left untouched and GET /{id}/spec keeps serving
 * the last known-good copy.
 */
export function specCachePatch(result: {
  spec?: unknown;
}):
  | { spec: Prisma.InputJsonValue; specValidatedAt: Date }
  | Record<never, never> {
  return result.spec !== undefined
    ? {
        spec: result.spec as Prisma.InputJsonValue,
        specValidatedAt: new Date(),
      }
    : {};
}
