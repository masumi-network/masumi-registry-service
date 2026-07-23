import { z } from '@/utils/zod-openapi';
import { logger } from '@/utils/logger';
import {
  PublicUrlValidationError,
  validatePublicUrl,
} from '@/utils/public-url';

// Bounds for fetching an untrusted, agent-supplied spec URL (OWASP SSRF):
// resolve+reject non-public targets, never follow redirects (a public URL could
// 30x into an internal address), and cap time + size.
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SPEC_BYTES = 5 * 1024 * 1024; // 5 MiB

export type SpecKind = 'openapi' | 'x402';

// `valid`       — reachable and a valid spec (-> Online, cache the snapshot)
// `invalid`     — reachable but not a valid spec (-> Invalid)
// `unreachable` — network error / SSRF rejection / timeout (-> Offline)
export type SpecValidationOutcome =
  | { outcome: 'valid'; spec: unknown }
  | { outcome: 'invalid'; reason: string }
  | { outcome: 'unreachable'; reason: string };

// Structural validation only, and JSON-only parsing. Two follow-ups (both
// blocked on adding deps this environment cannot currently install): (1) accept
// YAML OpenAPI documents (needs `yaml`); (2) deeply validate every embedded
// JSON Schema against the 2020-12 dialect (needs `ajv` v8 — the resolvable ajv
// is v6/draft-07). We DO enforce the OpenAPI 3.1 spec's "valid document"
// requirements: openapi + info(title, version) + at least one of paths /
// components / webhooks, and the x402 manifest's resource shape. External $refs
// are never dereferenced, so there is no $ref-based SSRF channel.
const jsonObjectSchema = z.record(z.string(), z.unknown());

const openApiDocumentSchema = z
  .object({
    // 3.0.x or 3.1.x; the doc self-declares its patch version.
    openapi: z
      .string()
      .regex(/^3\.(0|1)\.\d+$/, 'openapi must be a 3.0.x or 3.1.x version'),
    info: z.object({
      title: z.string().min(1),
      version: z.string().min(1),
    }),
    paths: jsonObjectSchema.optional(),
    components: jsonObjectSchema.optional(),
    webhooks: jsonObjectSchema.optional(),
  })
  // OpenAPI 3.1 relaxed 3.0's "paths required" to "at least one of paths,
  // components or webhooks".
  .refine(
    (doc) =>
      doc.paths != null || doc.components != null || doc.webhooks != null,
    'document must contain at least one of paths, components or webhooks'
  );

// x402 resource manifest (Masumi-defined; see docs/x402-agent-manifest.md).
// Pricing is agent-level (SupportedPaymentSources), so resources carry no
// `accepts`. Embedded input/output schemas are accepted as objects here; strict
// JSON-Schema-dialect validation is the deferred follow-up.
const x402ManifestSchema = z.object({
  x402Version: z.number().int().optional(),
  resources: z
    .array(
      z.object({
        resource: z.string().url(),
        type: z.enum(['http', 'mcp']).optional(),
        description: z.string().optional(),
        mimeType: z.string().optional(),
        inputSchema: jsonObjectSchema.optional(),
        outputSchema: jsonObjectSchema.optional(),
      })
    )
    .min(1),
});

type FetchResult =
  | { ok: true; body: string }
  | { ok: false; reason: string; unreachable: boolean };

async function fetchSpecBody(url: string): Promise<FetchResult> {
  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    // SSRF guard: resolves DNS and rejects private/loopback/metadata targets.
    const { normalizedUrl } = await validatePublicUrl(url, {
      allowQuery: true,
    });
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(normalizedUrl, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'application/json, application/yaml, text/yaml, text/plain',
      },
    });
    if (!response.ok || response.body == null) {
      return {
        ok: false,
        reason: `HTTP ${response.status}`,
        unreachable: true,
      };
    }
    // Enforce the size cap while streaming so an unbounded body can never
    // exhaust memory, even when the server omits Content-Length.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_SPEC_BYTES) {
          await reader.cancel();
          return {
            ok: false,
            reason: `spec exceeds ${MAX_SPEC_BYTES} byte limit`,
            unreachable: false,
          };
        }
        chunks.push(value);
      }
    }
    return { ok: true, body: Buffer.concat(chunks).toString('utf8') };
  } catch (error) {
    // A blocked (SSRF) URL is a hard config error, not a transient outage, but
    // both map to "unreachable" so the caller marks Offline and the periodic
    // loop keeps re-checking (a DNS record can later resolve to a public IP).
    const reason =
      error instanceof PublicUrlValidationError
        ? `blocked url: ${error.code}`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, reason, unreachable: true };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    controller?.abort();
  }
}

/** Fetch + structurally validate an OpenAPI 3.0/3.1 document (JSON only). */
export async function validateOpenApiSpec(
  url: string
): Promise<SpecValidationOutcome> {
  const fetched = await fetchSpecBody(url);
  if (!fetched.ok) {
    return {
      outcome: fetched.unreachable ? 'unreachable' : 'invalid',
      reason: fetched.reason,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.body);
  } catch (error) {
    return {
      outcome: 'invalid',
      reason: `not JSON (YAML support pending): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = openApiDocumentSchema.safeParse(parsed);
  if (!result.success) {
    return {
      outcome: 'invalid',
      reason: `not a valid OpenAPI document: ${result.error.issues[0]?.message ?? 'unknown'}`,
    };
  }
  return { outcome: 'valid', spec: parsed };
}

/** Fetch + structurally validate an x402 resource manifest. */
export async function validateX402Manifest(
  url: string
): Promise<SpecValidationOutcome> {
  const fetched = await fetchSpecBody(url);
  if (!fetched.ok) {
    return {
      outcome: fetched.unreachable ? 'unreachable' : 'invalid',
      reason: fetched.reason,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.body);
  } catch (error) {
    return {
      outcome: 'invalid',
      reason: `manifest is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = x402ManifestSchema.safeParse(parsed);
  if (!result.success) {
    return {
      outcome: 'invalid',
      reason: `manifest shape invalid: ${result.error.issues[0]?.message ?? 'unknown'}`,
    };
  }
  return { outcome: 'valid', spec: parsed };
}

/** Validate whichever spec kind an entry advertises. */
export async function validateSpecUrl(
  kind: SpecKind,
  url: string
): Promise<SpecValidationOutcome> {
  const outcome =
    kind === 'openapi'
      ? await validateOpenApiSpec(url)
      : await validateX402Manifest(url);
  if (outcome.outcome !== 'valid') {
    logger.info('Spec validation did not pass', {
      kind,
      url,
      outcome: outcome.outcome,
      reason: outcome.reason,
    });
  }
  return outcome;
}
