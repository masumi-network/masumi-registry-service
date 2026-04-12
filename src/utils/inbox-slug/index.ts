export const RESERVED_INBOX_SLUGS = [
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
] as const;

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeInboxSlug(value: string): string {
  return stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const NORMALIZED_RESERVED_INBOX_SLUGS = new Set(
  RESERVED_INBOX_SLUGS.map((slug) => normalizeInboxSlug(slug))
);

export function isReservedInboxSlug(slug: string): boolean {
  const normalizedSlug = normalizeInboxSlug(slug);
  return NORMALIZED_RESERVED_INBOX_SLUGS.has(normalizedSlug);
}
