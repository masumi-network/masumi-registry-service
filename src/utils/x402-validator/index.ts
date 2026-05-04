import { createHash } from 'node:crypto';
import { z } from '@/utils/zod-openapi';
import {
  validatePublicUrl,
  PublicUrlValidationError,
} from '@/utils/public-url';
import { logger } from '@/utils/logger';

// ---------------------------------------------------------------------------
// Zod schemas matching the x402 spec (github.com/coinbase/x402)
// ---------------------------------------------------------------------------

export const x402PaymentRequirementSchema = z.object({
  scheme: z.string().min(1),
  network: z.string().min(1),
  maxAmountRequired: z
    .string()
    .min(1)
    .regex(/^\d+$/, 'maxAmountRequired must be a non-negative integer string'),
  resource: z.string().min(1),
  description: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  payTo: z.string().min(1),
  asset: z.string().min(1),
  outputSchema: z.unknown().optional(),
});

export const x402BodySchema = z.object({
  x402Version: z.number().int().min(1),
  accepts: z.array(x402PaymentRequirementSchema).min(1),
  error: z.string().optional().nullable(),
});

// Bazaar / agentic.market services.json manifest format
export const bazaarEndpointSchema = z.object({
  url: z.string().min(1),
  method: z.string().optional(),
  description: z.string().optional().nullable(),
  accepts: z.array(x402PaymentRequirementSchema).optional(),
});

export const bazaarManifestSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional().nullable(),
  x402Version: z.number().int().min(1).optional(),
  networks: z.array(z.string()).optional(),
  endpoints: z.array(bazaarEndpointSchema).min(1),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type X402PaymentRequirement = z.infer<
  typeof x402PaymentRequirementSchema
>;

export type X402ValidationSuccess = {
  outcome: 'success';
  accepts: X402PaymentRequirement[];
  httpMethod: string | null;
  extra: Record<string, unknown> | null;
  source: 'x402-body' | 'services-json' | 'well-known';
};

export type X402ValidationFailure = {
  outcome: 'failure';
  reason: string;
};

export type X402ValidationResult =
  | X402ValidationSuccess
  | X402ValidationFailure;

// ---------------------------------------------------------------------------
// Normalise a URL to a stable hash used as the unique key
// ---------------------------------------------------------------------------

export function computeUrlHash(url: string): string {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

// ---------------------------------------------------------------------------
// Core validation: try x402 body first, then manifest fallbacks
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryFetchX402Body(
  normalizedUrl: string
): Promise<X402ValidationResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(normalizedUrl, {
      method: 'GET',
      redirect: 'manual',
    });
  } catch (error) {
    return {
      outcome: 'failure',
      reason:
        error instanceof Error
          ? `Network error: ${error.message}`
          : 'Network error',
    };
  }

  if (response.status !== 402) {
    try {
      await response.text();
    } catch {
      // ignore
    }
    return {
      outcome: 'failure',
      reason: `Expected HTTP 402 but got ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      outcome: 'failure',
      reason: 'HTTP 402 response body is not valid JSON',
    };
  }

  const parsed = x402BodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      outcome: 'failure',
      reason: `HTTP 402 body does not match x402 spec: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    };
  }

  const { accepts, ...rest } = parsed.data;

  return {
    outcome: 'success',
    accepts,
    httpMethod: 'GET',
    extra:
      Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : null,
    source: 'x402-body',
  };
}

async function tryFetchManifest(
  origin: string,
  path: string
): Promise<X402ValidationResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${origin}${path}`, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { outcome: 'failure', reason: `Could not reach ${path}` };
  }

  if (!response.ok) {
    try {
      await response.text();
    } catch {
      // ignore
    }
    return {
      outcome: 'failure',
      reason: `${path} returned HTTP ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      outcome: 'failure',
      reason: `${path} response is not valid JSON`,
    };
  }

  const parsed = bazaarManifestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      outcome: 'failure',
      reason: `${path} does not match Bazaar manifest schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    };
  }

  // Flatten all accepts across all endpoints
  const allAccepts: X402PaymentRequirement[] = [];
  for (const endpoint of parsed.data.endpoints) {
    if (endpoint.accepts) {
      allAccepts.push(...endpoint.accepts);
    }
  }

  if (allAccepts.length === 0) {
    return {
      outcome: 'failure',
      reason: `${path} manifest has no payment requirements`,
    };
  }

  return {
    outcome: 'success',
    accepts: allAccepts,
    httpMethod: parsed.data.endpoints[0]?.method?.toUpperCase() ?? null,
    extra: null,
    source: path === '/services.json' ? 'services-json' : 'well-known',
  };
}

/**
 * Validates that a URL is an x402-gated endpoint.
 *
 * Tries in order:
 *   1. GET url → expects HTTP 402 + valid x402 body
 *   2. GET origin/services.json → valid Bazaar manifest
 *   3. GET origin/.well-known/x402 → valid Bazaar manifest
 *
 * Returns the first successful result, or the last failure reason.
 */
export async function validateX402Url(
  rawUrl: string
): Promise<X402ValidationResult> {
  // SSRF-safe URL normalisation (reuses existing utility)
  let normalizedUrl: string;
  let origin: string;
  try {
    const validated = await validatePublicUrl(rawUrl);
    normalizedUrl = validated.normalizedUrl;
    origin = validated.url.origin;
  } catch (error) {
    const reason =
      error instanceof PublicUrlValidationError ? error.message : 'Invalid URL';
    return { outcome: 'failure', reason };
  }

  // 1. Try direct 402 response
  const directResult = await tryFetchX402Body(normalizedUrl);
  if (directResult.outcome === 'success') {
    logger.debug('x402 validation: direct 402 body succeeded', {
      url: normalizedUrl,
    });
    return directResult;
  }

  logger.debug('x402 validation: direct 402 failed, trying manifests', {
    url: normalizedUrl,
    reason: directResult.reason,
  });

  // 2. Try /services.json
  const servicesResult = await tryFetchManifest(origin, '/services.json');
  if (servicesResult.outcome === 'success') {
    logger.debug('x402 validation: /services.json succeeded', {
      url: normalizedUrl,
    });
    return servicesResult;
  }

  // 3. Try /.well-known/x402
  const wellKnownResult = await tryFetchManifest(origin, '/.well-known/x402');
  if (wellKnownResult.outcome === 'success') {
    logger.debug('x402 validation: /.well-known/x402 succeeded', {
      url: normalizedUrl,
    });
    return wellKnownResult;
  }

  return {
    outcome: 'failure',
    reason: `No valid x402 payment information found. Direct: ${directResult.reason}; /services.json: ${servicesResult.reason}; /.well-known/x402: ${wellKnownResult.reason}`,
  };
}
