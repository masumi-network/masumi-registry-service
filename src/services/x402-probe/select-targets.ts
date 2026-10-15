export interface ProbeCandidateEntry {
  entryId: string;
  resources: string[];
  lastProbedAt: ReadonlyMap<string, Date>;
}

export interface ProbeTargets {
  entryId: string;
  resources: string[];
}

// Never-probed resources sort before every probed one.
const NEVER = -1;

function hostOf(resource: string): string {
  try {
    return new URL(resource).host;
  } catch {
    return '';
  }
}

/**
 * Pick which resources to probe this cycle. Outbound load is bounded twice (per
 * entry, so one huge manifest cannot hammer one host, and in total) and the
 * stalest resources win, so everything is eventually revisited. A host never
 * receives more than `maxPerHost` requests, however many entries point at it.
 */
export function selectProbeTargets(
  entries: readonly ProbeCandidateEntry[],
  limits: { maxPerEntry: number; maxTotal: number; maxPerHost?: number }
): ProbeTargets[] {
  const candidates = entries.flatMap((entry) =>
    [...new Set(entry.resources)]
      .map((resource) => ({
        entryId: entry.entryId,
        resource,
        probedAt: entry.lastProbedAt.get(resource)?.getTime() ?? NEVER,
      }))
      .sort((a, b) => a.probedAt - b.probedAt)
      .slice(0, limits.maxPerEntry)
  );
  candidates.sort((a, b) => a.probedAt - b.probedAt);

  const byEntry = new Map<string, string[]>();
  const perHost = new Map<string, number>();
  let taken = 0;
  for (const { entryId, resource } of candidates) {
    if (taken >= limits.maxTotal) break;
    // Several entries can point at one host: cap what that host receives.
    const host = hostOf(resource);
    const hostCount = perHost.get(host) ?? 0;
    if (hostCount >= (limits.maxPerHost ?? Infinity)) continue;
    perHost.set(host, hostCount + 1);
    byEntry.set(entryId, [...(byEntry.get(entryId) ?? []), resource]);
    taken += 1;
  }
  return [...byEntry].map(([entryId, resources]) => ({ entryId, resources }));
}
