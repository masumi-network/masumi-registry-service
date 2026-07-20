import { $Enums, PricingType, Prisma } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { metadataStringConvert } from '@/utils/metadata-string-convert';

// On-chain metadata leaves are string | string[] (CIP-25 60-char chunks).
const metadataString = z.string().or(z.array(z.string()));

const v2AssetSchema = z.object({
  asset: metadataString,
  decimals: metadataString.optional(),
});

const v2AmountSchema = v2AssetSchema.extend({
  amount: metadataString,
});

const v2PricingSchema = z.object({
  pricingType: metadataString,
  fixed: z.array(v2AmountSchema).optional(),
  dynamic: z.array(v2AssetSchema).optional(),
});

const v2SettlementSchema = z.object({
  paymentSourceType: metadataString.optional(),
  address: metadataString.optional(),
  scheme: metadataString.optional(),
  payTo: metadataString.optional(),
  resource: metadataString.optional(),
  extra: z.unknown().optional(),
});

const v2SupportedPaymentSourceSchema = z.object({
  chain: metadataString,
  network: metadataString,
  settlement: v2SettlementSchema.optional(),
  pricing: v2PricingSchema.optional(),
});

const v2VerificationRefSchema = z.object({
  aid: metadataString.optional(),
  said: metadataString.optional(),
  oobi: metadataString.optional(),
  registry: metadataString.optional(),
});

const v2VerificationSchema = z.object({
  method: metadataString,
  schemaVersion: metadataString.optional(),
  issuer: v2VerificationRefSchema.optional(),
  schema: v2VerificationRefSchema.optional(),
  credential: v2VerificationRefSchema.optional(),
  holder: v2VerificationRefSchema.optional(),
  baseUrl: metadataString.optional(),
});

/**
 * V2 agent registry metadata: grouped `supported_payment_sources` (with
 * per-source pricing) + `verifications`, and NO top-level `agentPricing`
 * (pricing is resolved from the Cardano source). Mirrors what
 * masumi-payment-service mints for Web3CardanoV2 entries.
 */
export const web3CardanoV2MetadataSchema = z.object({
  name: metadataString,
  description: metadataString.optional(),
  api_base_url: metadataString,
  example_output: z
    .array(
      z.object({
        name: metadataString,
        mime_type: metadataString,
        url: metadataString,
      })
    )
    .optional(),
  capability: z
    .object({ name: metadataString, version: metadataString })
    .optional(),
  author: z.object({
    name: metadataString,
    contact_email: metadataString.optional(),
    contact_other: metadataString.optional(),
    organization: metadataString.optional(),
  }),
  legal: z
    .object({
      privacy_policy: metadataString.optional(),
      terms: metadataString.optional(),
      other: metadataString.optional(),
    })
    .optional(),
  tags: z.array(z.string().min(1)).min(1),
  image: metadataString,
  metadata_version: z.coerce.number().int().min(2).max(2),
  supported_payment_sources: z.array(v2SupportedPaymentSourceSchema).optional(),
  verifications: z.array(v2VerificationSchema).optional(),
});

export type Web3CardanoV2Metadata = z.infer<typeof web3CardanoV2MetadataSchema>;

const CARDANO_CHAIN = 'Cardano';
const EVM_CHAIN = 'EVM';
const POSTGRES_BIGINT_MAX = 9223372036854775807n;

function parseAtomicAmount(value: string | undefined): bigint | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const amount = BigInt(value);
  return amount > 0n && amount <= POSTGRES_BIGINT_MAX ? amount : null;
}

function parseAssetDecimals(value: string | undefined): number | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const decimals = Number(value);
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
    ? decimals
    : null;
}

function findCardanoPricing(metadata: Web3CardanoV2Metadata) {
  const cardano = (metadata.supported_payment_sources ?? []).find(
    (source) => metadataStringConvert(source.chain) === CARDANO_CHAIN
  );
  return cardano?.pricing;
}

// V2 has no top-level agentPricing; resolve it from the Cardano source pricing.
export function resolveV2AgentPricingCreate(
  metadata: Web3CardanoV2Metadata
): Prisma.AgentPricingCreateWithoutRegistryEntryInput {
  const pricing = findCardanoPricing(metadata);
  const pricingType = pricing
    ? metadataStringConvert(pricing.pricingType)
    : undefined;

  if (pricingType === PricingType.Fixed && pricing?.fixed?.length) {
    return {
      pricingType: PricingType.Fixed,
      FixedPricing: {
        create: {
          Amounts: {
            createMany: {
              data: pricing.fixed.map((entry) => ({
                amount: BigInt(metadataStringConvert(entry.amount) ?? '0'),
                unit: metadataStringConvert(entry.asset) ?? '',
              })),
            },
          },
        },
      },
    };
  }
  if (pricingType === PricingType.Dynamic) {
    return { pricingType: PricingType.Dynamic };
  }
  // Free, or no resolvable pricing.
  return { pricingType: PricingType.Free };
}

export function resolveV2PaymentType(
  metadata: Web3CardanoV2Metadata
): $Enums.PaymentType {
  const pricing = findCardanoPricing(metadata);
  const pricingType = pricing
    ? metadataStringConvert(pricing.pricingType)
    : undefined;
  // No Cardano source (e.g. an x402/EVM-only entry) means no Cardano escrow, so
  // the Cardano payment type is None — same as Free. Keeps paymentType consistent
  // with resolveV2AgentPricingCreate, which resolves to Free in both cases.
  return pricingType == null || pricingType === PricingType.Free
    ? $Enums.PaymentType.None
    : $Enums.PaymentType.Web3CardanoV2;
}

// Flatten the grouped on-chain sources into SupportedPaymentSource rows.
export function buildV2SupportedPaymentSourceRows(
  metadata: Web3CardanoV2Metadata
): Prisma.SupportedPaymentSourceCreateManyRegistryEntryInput[] {
  const rows: Prisma.SupportedPaymentSourceCreateManyRegistryEntryInput[] = [];
  for (const source of metadata.supported_payment_sources ?? []) {
    const chain = metadataStringConvert(source.chain);
    const network = metadataStringConvert(source.network);
    if (chain == null || network == null) continue;
    const settlement = source.settlement ?? {};

    if (chain === EVM_CHAIN) {
      const pricingType = metadataStringConvert(source.pricing?.pricingType);
      const payTo = metadataStringConvert(settlement.payTo);
      const scheme = metadataStringConvert(settlement.scheme);
      if (
        payTo == null ||
        scheme == null ||
        (pricingType !== PricingType.Fixed &&
          pricingType !== PricingType.Dynamic &&
          pricingType !== PricingType.Free)
      ) {
        continue;
      }

      let asset: string | null = null;
      let amount: bigint | null = null;
      let decimals: number | null = null;
      if (pricingType === PricingType.Fixed) {
        const fixed = source.pricing?.fixed?.[0];
        const fixedAsset = metadataStringConvert(fixed?.asset);
        const fixedAmount = metadataStringConvert(fixed?.amount);
        const fixedDecimals = metadataStringConvert(fixed?.decimals);
        const parsedAmount = parseAtomicAmount(fixedAmount);
        const parsedDecimals = parseAssetDecimals(fixedDecimals);
        if (
          fixedAsset == null ||
          parsedAmount == null ||
          parsedDecimals == null
        ) {
          continue;
        }
        asset = fixedAsset;
        amount = parsedAmount;
        decimals = parsedDecimals;
      } else if (pricingType === PricingType.Dynamic) {
        const dynamic = source.pricing?.dynamic?.[0];
        const dynamicAsset = metadataStringConvert(dynamic?.asset);
        const dynamicDecimals = metadataStringConvert(dynamic?.decimals);
        if ((dynamicAsset == null) !== (dynamicDecimals == null)) {
          continue;
        }
        asset = dynamicAsset ?? null;
        decimals =
          dynamicDecimals != null ? parseAssetDecimals(dynamicDecimals) : null;
        if (dynamicDecimals != null && decimals == null) {
          continue;
        }
      }

      rows.push({
        chain,
        network,
        address: payTo,
        scheme,
        pricingType,
        asset,
        amount,
        decimals,
        payTo,
        resource: metadataStringConvert(settlement.resource) ?? null,
        ...(settlement.extra !== undefined
          ? { extra: settlement.extra as Prisma.InputJsonValue }
          : {}),
      });
      continue;
    }

    const address = metadataStringConvert(settlement.address);
    if (address == null) continue;
    rows.push({
      chain,
      network,
      address,
      paymentSourceType:
        metadataStringConvert(settlement.paymentSourceType) ?? null,
    });
  }
  return rows;
}

// Flatten the grouped on-chain verifications into AgentVerification rows. Drops
// entries missing any required KERI anchor rather than persisting partials.
export function buildV2VerificationRows(
  metadata: Web3CardanoV2Metadata
): Prisma.AgentVerificationCreateManyRegistryEntryInput[] {
  return (metadata.verifications ?? []).flatMap((verification) => {
    const method = metadataStringConvert(verification.method);
    const issuerAid = metadataStringConvert(verification.issuer?.aid);
    const issuerOobi = metadataStringConvert(verification.issuer?.oobi);
    const schemaSaid = metadataStringConvert(verification.schema?.said);
    const schemaOobi = metadataStringConvert(verification.schema?.oobi);
    const credentialSaid = metadataStringConvert(verification.credential?.said);
    const credentialOobi = metadataStringConvert(verification.credential?.oobi);
    const holderAid = metadataStringConvert(verification.holder?.aid);
    const holderOobi = metadataStringConvert(verification.holder?.oobi);

    if (
      method == null ||
      issuerAid == null ||
      issuerOobi == null ||
      schemaSaid == null ||
      schemaOobi == null ||
      credentialSaid == null ||
      credentialOobi == null ||
      holderAid == null ||
      holderOobi == null
    ) {
      return [];
    }

    return [
      {
        method,
        schemaVersion:
          metadataStringConvert(verification.schemaVersion) ?? null,
        issuerAid,
        issuerOobi,
        schemaSaid,
        schemaOobi,
        credentialSaid,
        credentialOobi,
        credentialRegistry:
          metadataStringConvert(verification.credential?.registry) ?? null,
        holderAid,
        holderOobi,
        baseUrl: metadataStringConvert(verification.baseUrl) ?? null,
      },
    ];
  });
}
