type RegistryEntrySearchTextInput = {
  name?: string | null;
  description?: string | null;
  authorName?: string | null;
  authorOrganization?: string | null;
  apiBaseUrl?: string | null;
  assetIdentifier?: string | null;
  capabilityName?: string | null;
  capabilityVersion?: string | null;
  tags?: string[] | null;
};

export function normalizeRegistryEntrySearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeRegistryEntrySearchQuery(value: string): string {
  return normalizeRegistryEntrySearchText(value).replace(/[\\%_]/g, '\\$&');
}

function normalizeSearchSegment(
  value: string | null | undefined
): string | undefined {
  if (value == null) {
    return undefined;
  }

  const normalizedValue = normalizeRegistryEntrySearchText(value);
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export function buildRegistryEntrySearchText(
  input: RegistryEntrySearchTextInput
): string {
  return [
    input.name,
    input.description,
    input.authorName,
    input.authorOrganization,
    input.apiBaseUrl,
    input.assetIdentifier,
    input.capabilityName,
    input.capabilityVersion,
    ...(input.tags ?? []),
  ]
    .map((value) => normalizeSearchSegment(value))
    .filter((value): value is string => value != null)
    .join(' ');
}
