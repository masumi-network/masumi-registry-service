// Where an API conventionally publishes an OpenAPI 3 document, most common
// first. Not /swagger.json or /api-docs: those serve Swagger 2.0 or an HTML UI,
// which the validator never accepts.
export const OPENAPI_WELL_KNOWN_PATHS = [
  '/openapi.json',
  '/.well-known/openapi.json',
  '/openapi.yaml',
] as const;

/**
 * The https origins (default port, no userinfo) of a manifest's resources, each
 * once. The pinned fetcher refuses anything else, so such resources cannot be
 * discovered from.
 */
export function originsOf(resources: readonly string[], limit = Infinity) {
  const origins = new Set<string>();
  for (const resource of resources) {
    if (origins.size >= limit) break;
    try {
      const url = new URL(resource);
      if (url.protocol !== 'https:' || url.port !== '') continue;
      if (url.username || url.password) continue;
      origins.add(url.origin);
    } catch {
      // An unparsable resource has no origin.
    }
  }
  return [...origins];
}

/**
 * The `rel="service-desc"` target of an RFC 8631 `Link` header, resolved against
 * `origin`. Null when absent or when it points off-origin: a document is only
 * attributed to an origin that serves it itself.
 */
export function parseServiceDescLink(
  header: string | undefined,
  origin: string
): string | null {
  if (!header) return null;
  // ponytail: splits on every comma, so a target URL containing a comma is
  // missed; fine for the conventional path-only targets.
  for (const part of header.split(',')) {
    const match = /^\s*<([^>]*)>(.*)$/s.exec(part);
    if (match == null) continue;
    if (!/;\s*rel\s*=\s*"?service-desc"?\s*(;|$)/i.test(match[2])) continue;
    try {
      const target = new URL(match[1], origin);
      return target.origin === origin ? target.href : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Documents to try for an origin, an advertised one first, without repeats. */
export function openApiCandidateUrls(
  origin: string,
  advertised: string | null
): string[] {
  const wellKnown = OPENAPI_WELL_KNOWN_PATHS.map((path) => `${origin}${path}`);
  return [
    ...new Set(advertised != null ? [advertised, ...wellKnown] : wellKnown),
  ];
}
