import { z } from '@/utils/zod-openapi';

// Legacy (x402 v1) network names -> CAIP-2, the form registered payment sources
// use. Any other name is kept as-is and simply reported as a mismatch.
const LEGACY_NETWORKS: Readonly<Record<string, string>> = {
  base: 'eip155:8453',
  'base-sepolia': 'eip155:84532',
};

// A type alias (not an interface) so it is assignable to Prisma's JSON input.
export type ProbeAccept = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number | null;
};

export type ParsedChallenge =
  | { kind: 'challenge'; x402Version: number; accepts: ProbeAccept[] }
  // 2xx: the resource answered without asking for payment.
  | { kind: 'free' }
  // 404/405: the probe only sends GET, which this resource does not serve (a
  // POST-only route answers 404 as often as 405, so a 404 is not "down").
  | { kind: 'unsupported-method' }
  // 402 without a usable challenge.
  | { kind: 'invalid'; reason: string }
  // Any other status (5xx, redirects, other 4xx): the resource did not challenge.
  | { kind: 'unreachable'; reason: string };

// Everything in a challenge is attacker-controlled and ends up in the database
// and the API: keep it short, printable ASCII, and numerically sane so a hostile
// value can neither be unstorable nor bloat a row.
const MAX_ACCEPTS = 10;
const MAX_PROTOCOL_VERSION = 1000;

const printable = z.string().regex(/^[\x21-\x7e]{1,128}$/);

// Atomic units: a digit string (up to uint256) or a safe integer.
const atomicAmount = z.union([
  z.string().regex(/^\d{1,78}$/),
  z.number().int().nonnegative().safe().transform(String),
]);

// Not compared, so a malformed value must not turn a payable resource Invalid.
const lenientTimeout = z
  .unknown()
  .transform((value) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : null
  );

// v1 carries `maxAmountRequired`, v2 carries `amount`.
const acceptSchema = z.object({
  scheme: printable,
  network: printable,
  amount: atomicAmount.optional(),
  maxAmountRequired: atomicAmount.optional(),
  asset: printable,
  payTo: printable,
  maxTimeoutSeconds: lenientTimeout.optional(),
});

const challengeSchema = z.object({
  x402Version: z.coerce.number().int().positive().max(MAX_PROTOCOL_VERSION),
  accepts: z.array(z.unknown()).min(1),
});

function normalizeChallenge(raw: unknown): ParsedChallenge | null {
  const envelope = challengeSchema.safeParse(raw);
  if (!envelope.success) return null;
  const accepts: ProbeAccept[] = [];
  for (const candidate of envelope.data.accepts) {
    if (accepts.length >= MAX_ACCEPTS) break;
    const parsed = acceptSchema.safeParse(candidate);
    const amount = parsed.success
      ? (parsed.data.amount ?? parsed.data.maxAmountRequired)
      : undefined;
    if (!parsed.success || amount == null) continue;
    accepts.push({
      scheme: parsed.data.scheme,
      network: LEGACY_NETWORKS[parsed.data.network] ?? parsed.data.network,
      amount,
      asset: parsed.data.asset,
      payTo: parsed.data.payTo,
      maxTimeoutSeconds: parsed.data.maxTimeoutSeconds ?? null,
    });
  }
  return accepts.length === 0
    ? null
    : { kind: 'challenge', x402Version: envelope.data.x402Version, accepts };
}

function decodeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Classify the response to an unpaid request. A v2 server puts the challenge in
 * the base64 `PAYMENT-REQUIRED` header, a v1 server in the JSON body.
 */
export function parseX402Challenge(response: {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}): ParsedChallenge {
  const { status, headers, body } = response;
  if (status >= 200 && status < 300) return { kind: 'free' };
  if (status === 404 || status === 405) return { kind: 'unsupported-method' };
  if (status !== 402) return { kind: 'unreachable', reason: `HTTP ${status}` };

  const header = headers['payment-required'];
  const fromHeader =
    header == null
      ? null
      : normalizeChallenge(
          decodeJson(Buffer.from(header, 'base64').toString('utf8'))
        );
  const challenge = fromHeader ?? normalizeChallenge(decodeJson(body));
  return (
    challenge ?? {
      kind: 'invalid',
      reason: 'HTTP 402 without a valid x402 challenge',
    }
  );
}

export interface RegisteredSource {
  chain: string;
  network: string;
  scheme: string | null;
  payTo: string | null;
  resource: string | null;
  dynamicAsset: string | null;
  Pricing: {
    pricingType: 'Fixed' | 'Free' | 'Dynamic';
    FixedPricing: { Amounts: { unit: string; amount: bigint }[] } | null;
  } | null;
}

export interface SourceComparison {
  // null: nothing to compare against (no applicable EVM source).
  matches: boolean | null;
  mismatches: string[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The economic fields the payment service also pins when it verifies a payment
// for a registered source (assertRequirementsMatchRegisteredSource): scheme,
// network, asset, amount, payTo. That service additionally pins
// maxTimeoutSeconds, extra.assetTransferMethod and extra.decimals; those only
// describe how a seller built on Masumi shapes its own challenge, so they are
// not compared here and a match does not promise the payment service accepts it.
function differences(source: RegisteredSource, accept: ProbeAccept): string[] {
  const found: string[] = [];
  const add = (field: string, required: string, registered: string) =>
    found.push(
      `${field}: resource requires ${required}, registered ${registered}`
    );

  if (source.scheme != null && !same(source.scheme, accept.scheme)) {
    add('scheme', accept.scheme, source.scheme);
  }
  if (source.network !== accept.network) {
    add('network', accept.network, source.network);
  }
  if (source.payTo != null && !same(source.payTo, accept.payTo)) {
    add('payTo', accept.payTo, source.payTo);
  }
  const fixed = source.Pricing?.FixedPricing?.Amounts[0];
  // A registered source with no price cannot be matched, whatever the resource
  // asks for (the payment service treats such a row as incomplete too).
  if (
    source.Pricing == null ||
    (source.Pricing.pricingType === 'Fixed' && fixed == null)
  ) {
    found.push('pricing: registered source has no price');
    return found;
  }
  const registeredAsset =
    source.Pricing?.pricingType === 'Fixed' ? fixed?.unit : source.dynamicAsset;
  if (registeredAsset != null && !same(registeredAsset, accept.asset)) {
    add('asset', accept.asset, registeredAsset);
  }
  if (
    source.Pricing?.pricingType === 'Fixed' &&
    fixed != null &&
    fixed.amount.toString() !== accept.amount
  ) {
    add('amount', accept.amount, fixed.amount.toString());
  }
  return found;
}

/**
 * Does the resource's live challenge agree with the payment sources the entry
 * registered on chain? `accepts: null` means the resource answered for free.
 * A source pinned to another resource does not apply (exact URL comparison, as
 * the payment service does).
 */
export function compareChallengeToSources(params: {
  resource: string;
  accepts: ProbeAccept[] | null;
  sources: RegisteredSource[];
}): SourceComparison {
  const applicable = params.sources.filter(
    (source) =>
      source.chain === 'EVM' &&
      (source.resource == null || source.resource === params.resource)
  );
  if (applicable.length === 0) return { matches: null, mismatches: [] };

  const isFree = (source: RegisteredSource) =>
    source.Pricing?.pricingType === 'Free';

  if (params.accepts == null) {
    if (applicable.some(isFree)) return { matches: true, mismatches: [] };
    const registered = applicable[0].Pricing?.pricingType ?? 'unpriced';
    return {
      matches: false,
      mismatches: [
        `pricing: registered as ${registered}, but the resource did not require payment`,
      ],
    };
  }

  const priced = applicable.filter((source) => !isFree(source));
  if (priced.length === 0) {
    return {
      matches: false,
      mismatches: [
        'pricing: registered as Free, but the resource requires payment',
      ],
    };
  }

  let closest: string[] | null = null;
  for (const source of priced) {
    for (const accept of params.accepts) {
      const found = differences(source, accept);
      if (found.length === 0) return { matches: true, mismatches: [] };
      if (closest == null || found.length < closest.length) closest = found;
    }
  }
  return { matches: false, mismatches: closest ?? [] };
}
