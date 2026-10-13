export interface CapabilityOption {
  name: string;
  /** Newest first. */
  versions: string[];
}

interface CapabilityRecord {
  name: string;
  version: string;
}

/**
 * Name and version choices for the capability filter. Values are kept verbatim: the API
 * matches them exactly, so trimming one would make it match nothing.
 */
export function buildCapabilityOptions(
  capabilities: readonly CapabilityRecord[],
): CapabilityOption[] {
  const versionsByName = new Map<string, Set<string>>();
  for (const { name, version } of capabilities) {
    if (name.trim() === '') continue;
    const versions = versionsByName.get(name) ?? new Set<string>();
    if (version.trim() !== '') versions.add(version);
    versionsByName.set(name, versions);
  }

  return [...versionsByName.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map(([name, versions]) => ({
      name,
      versions: [...versions].sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true }),
      ),
    }));
}
