import type { RegistryEntry } from '@/lib/api/generated';

// Why an entry is in a search result. The registry matches the query as a substring of one
// lower-cased, whitespace-collapsed `searchText` column (the computeRegistryEntrySearchText
// migration): name, description, author name, organization, API base URL, asset identifier,
// capability name and version, then the tags, joined by single spaces. The API does not say
// which part matched, so this re-runs the same check per field on the returned entry. It
// labels results; it never orders or filters them.

export type MatchSource = 'metadata' | 'capability' | 'tags' | 'across-fields';

export interface MatchedSource {
  source: MatchSource;
  /** The fields within the source that contain the query (tag values for `tags`). */
  fields: string[];
}

export type SearchableEntry = Pick<
  RegistryEntry,
  | 'name'
  | 'description'
  | 'authorName'
  | 'authorOrganization'
  | 'apiBaseUrl'
  | 'agentIdentifier'
  | 'Capability'
  | 'tags'
>;

/** The registry's normalization: trim, collapse whitespace, lower-case. */
function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Metadata fields in searchText order; `agentIdentifier` is the stored asset identifier. */
function metadataFields(entry: SearchableEntry): [string, string][] {
  return [
    ['name', entry.name],
    ['description', entry.description ?? ''],
    ['authorName', entry.authorName ?? ''],
    ['authorOrganization', entry.authorOrganization ?? ''],
    ['apiBaseUrl', entry.apiBaseUrl ?? ''],
    ['assetIdentifier', entry.agentIdentifier],
  ];
}

function capabilityFields(entry: SearchableEntry): [string, string][] {
  return [
    ['name', entry.Capability?.name ?? ''],
    ['version', entry.Capability?.version ?? ''],
  ];
}

function matchingFields(fields: [string, string][], needle: string): string[] {
  return fields.filter(([, value]) => normalize(value).includes(needle)).map(([key]) => key);
}

/** Which parts of an entry contain the query, as the registry's search would see them. */
export function matchSources(entry: SearchableEntry, query: string): MatchedSource[] {
  const needle = normalize(query);
  if (needle === '') return [];

  const tags = entry.tags ?? [];
  const matched: MatchedSource[] = [];

  const metadata = matchingFields(metadataFields(entry), needle);
  if (metadata.length > 0) matched.push({ source: 'metadata', fields: metadata });

  const capability = matchingFields(capabilityFields(entry), needle);
  if (capability.length > 0) matched.push({ source: 'capability', fields: capability });

  const matchingTags = tags.filter((tag) => normalize(tag).includes(needle));
  // Tags are joined by spaces in searchText, so a query can span two adjacent tags.
  if (matchingTags.length > 0 || normalize(tags.join(' ')).includes(needle)) {
    matched.push({ source: 'tags', fields: matchingTags });
  }
  if (matched.length > 0) return matched;

  // Only the joined column contains it: the query runs across a field boundary.
  // normalize() collapses the gaps empty fields leave, just as CONCAT_WS skips them.
  const values = [...metadataFields(entry), ...capabilityFields(entry)].map(([, value]) => value);
  const joined = normalize([...values, ...tags].join(' '));
  return joined.includes(needle) ? [{ source: 'across-fields', fields: [] }] : [];
}
