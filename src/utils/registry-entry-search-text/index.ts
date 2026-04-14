export function normalizeRegistryEntrySearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeRegistryEntrySearchQuery(value: string): string {
  return normalizeRegistryEntrySearchText(value).replace(/[\\%_]/g, '\\$&');
}
