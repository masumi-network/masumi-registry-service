import Ajv2020 from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';
import { z } from '@/utils/zod-openapi';
import { logger } from '@/utils/logger';
import {
  PublicUrlValidationError,
  validatePublicUrl,
} from '@/utils/public-url';
import { agentCardSchema } from '@/utils/a2a/agent-card';

// Bounds for fetching an untrusted, agent-supplied spec URL (OWASP SSRF):
// resolve+reject non-public targets, never follow redirects (a public URL could
// 30x into an internal address), and cap time + size.
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SPEC_BYTES = 5 * 1024 * 1024; // 5 MiB

export type SpecKind = 'openapi' | 'x402' | 'a2a';

// `valid`       — reachable and a valid spec (-> Online, cache the snapshot)
// `invalid`     — reachable but not a valid spec (-> Invalid)
// `unreachable` — network error / SSRF rejection / timeout (-> Offline)
export type SpecValidationOutcome =
  | { outcome: 'valid'; spec: unknown }
  | { outcome: 'invalid'; reason: string }
  | { outcome: 'unreachable'; reason: string };

// OpenAPI validation enforces the 3.1 spec's "valid document" requirements
// structurally (openapi + info{title,version} + at least one of paths /
// components / webhooks) and accepts JSON or YAML. x402 manifests are validated
// structurally AND each embedded input/output schema is checked against the JSON
// Schema 2020-12 dialect (ajv). External $refs are never dereferenced, so there
// is no $ref-based SSRF channel. (Full OpenAPI conformance — every embedded
// Operation/Schema object — would need a dedicated 3.1 parser such as
// @readme/openapi-parser, which is not installed here.)
const jsonObjectSchema = z.record(z.string(), z.unknown());

// 2020-12 validator, reused across calls. strict:false so an agent schema may
// carry annotation keywords ajv does not recognise; validateSchema still rejects
// anything that violates the 2020-12 meta-schema.
const ajv2020 = new Ajv2020({ strict: false });

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
          controller.abort(); // also tear down the underlying request, not just the body stream
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
    // Abort a still-pending request on the error path only (on success the body
    // is already fully read, so aborting there would be a confusing no-op).
    controller?.abort();
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
  }
}

function parseJsonOrYaml(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    // OpenAPI documents are commonly YAML; fall back before giving up.
    return parseYaml(body);
  }
}

/** Fetch + structurally validate an OpenAPI 3.0/3.1 document (JSON or YAML). */
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
    parsed = parseJsonOrYaml(fetched.body);
  } catch (error) {
    return {
      outcome: 'invalid',
      reason: `not JSON or YAML: ${error instanceof Error ? error.message : String(error)}`,
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
  // Each embedded input/output schema must be a valid JSON Schema 2020-12 doc.
  for (const [index, resource] of result.data.resources.entries()) {
    for (const key of ['inputSchema', 'outputSchema'] as const) {
      const schema = resource[key];
      if (schema != null && !ajv2020.validateSchema(schema)) {
        return {
          outcome: 'invalid',
          reason: `resources[${index}].${key} is not a valid JSON Schema`,
        };
      }
    }
  }
  return { outcome: 'valid', spec: parsed };
}

export async function validateAgentCard(
  url: string,
  declaredProtocolVersions: string[]
): Promise<SpecValidationOutcome> {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return { outcome: 'invalid', reason: 'agent card url is not a valid URL' };
  }
  if (protocol !== 'https:') {
    return { outcome: 'invalid', reason: 'agent card url must use https' };
  }

  const fetched = await fetchSpecBody(url);
  if (!fetched.ok) {
    return {
      outcome: fetched.unreachable ? 'unreachable' : 'invalid',
      reason: fetched.reason,
    };
  }
  let parsed: unknown;
  try {
    // Agent cards are JSON (unlike OpenAPI documents, which are often YAML).
    parsed = JSON.parse(fetched.body);
  } catch (error) {
    return {
      outcome: 'invalid',
      reason: `agent card is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = agentCardSchema.safeParse(parsed);
  if (!result.success) {
    return {
      outcome: 'invalid',
      reason: `not a valid agent card: ${result.error.issues[0]?.message ?? 'unknown'}`,
    };
  }
  const missingVersions = declaredProtocolVersions.filter(
    (version) => !result.data.protocolVersions.includes(version)
  );
  if (missingVersions.length > 0) {
    return {
      outcome: 'invalid',
      reason: `agent card does not support declared protocol version(s): ${missingVersions.join(', ')}`,
    };
  }
  return { outcome: 'valid', spec: parsed };
}

/** Validate whichever spec kind an entry advertises. */
export async function validateSpecUrl(
  kind: SpecKind,
  url: string,
  options: { declaredProtocolVersions?: string[] } = {}
): Promise<SpecValidationOutcome> {
  let outcome: SpecValidationOutcome;
  switch (kind) {
    case 'openapi':
      outcome = await validateOpenApiSpec(url);
      break;
    case 'x402':
      outcome = await validateX402Manifest(url);
      break;
    case 'a2a':
      outcome = await validateAgentCard(
        url,
        options.declaredProtocolVersions ?? []
      );
      break;
    default: {
      const exhaustiveKind: never = kind;
      throw new Error(`unhandled spec kind: ${String(exhaustiveKind)}`);
    }
  }
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
