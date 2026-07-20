import { $Enums, PricingType, Prisma } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { metadataStringConvert } from '@/utils/metadata-string-convert';

const MAX_SUPPORTED_PAYMENT_SOURCES = 25;
const MAX_FIXED_PRICES = 5;

// On-chain metadata leaves are string | string[] (CIP-25 60-char chunks).
const metadataString = z.string().or(z.array(z.string()));

const v2AssetSchema = z.object({
  asset: metadataString,
  decimals: metadataString.optional(),
});

const v2AmountSchema = v2AssetSchema.extend({
  amount: metadataString,
});

const v2PricingSchema = z
  .object({
    pricingType: metadataString,
    fixed: z.array(v2AmountSchema).optional(),
    dynamic: z.array(v2AssetSchema).optional(),
  })
  .strict();

const v2SettlementSchema = z
  .object({
    paymentSourceType: metadataString.optional(),
    address: metadataString.optional(),
    scheme: metadataString.optional(),
    payTo: metadataString.optional(),
    resource: metadataString.optional(),
    extra: z.unknown().optional(),
  })
  .strict();

const v2SupportedPaymentSourceSchema = z
  .object({
    chain: metadataString,
    network: metadataString,
    settlement: v2SettlementSchema.optional(),
    pricing: v2PricingSchema.optional(),
  })
  .strict();

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
export const web3CardanoV2MetadataSchema = z
  .object({
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
    supported_payment_sources: z
      .array(v2SupportedPaymentSourceSchema)
      .min(1)
      .max(MAX_SUPPORTED_PAYMENT_SOURCES),
    verifications: z.array(v2VerificationSchema).optional(),
  })
  .strict();

export type Web3CardanoV2Metadata = z.infer<typeof web3CardanoV2MetadataSchema>;

const CARDANO_CHAIN = 'Cardano';
const EVM_CHAIN = 'EVM';
const POSTGRES_BIGINT_MAX = 9223372036854775807n;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

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

export function resolveV2PaymentType(
  metadata: Web3CardanoV2Metadata
): $Enums.PaymentType {
  const hasPaidCardanoSource = (metadata.supported_payment_sources ?? []).some(
    (source) => {
      if (metadataStringConvert(source.chain) !== CARDANO_CHAIN) return false;
      const pricingType = metadataStringConvert(source.pricing?.pricingType);
      return (
        pricingType === PricingType.Fixed || pricingType === PricingType.Dynamic
      );
    }
  );
  return hasPaidCardanoSource
    ? $Enums.PaymentType.Web3CardanoV2
    : $Enums.PaymentType.None;
}

function buildPricingCreate(
  source: NonNullable<
    Web3CardanoV2Metadata['supported_payment_sources']
  >[number],
  sourceIndex: number,
  chain: string
): {
  pricing: Prisma.AgentPricingCreateWithoutSupportedPaymentSourceInput;
  dynamicAsset: string | null;
  dynamicDecimals: number | null;
  fixedDecimals: number | null;
  canonicalPricing: string;
} {
  const pricingType = metadataStringConvert(source.pricing?.pricingType);
  const optionLabel = `supported_payment_sources[${sourceIndex}]`;
  if (
    pricingType !== PricingType.Fixed &&
    pricingType !== PricingType.Dynamic &&
    pricingType !== PricingType.Free
  ) {
    throw new Error(`${optionLabel}.pricing.pricingType is missing or invalid`);
  }

  if (pricingType === PricingType.Free) {
    if (source.pricing?.fixed != null || source.pricing?.dynamic != null) {
      throw new Error(
        `${optionLabel}.pricing must not set fixed or dynamic values when pricingType is Free`
      );
    }
    return {
      pricing: { pricingType },
      dynamicAsset: null,
      dynamicDecimals: null,
      fixedDecimals: null,
      canonicalPricing: JSON.stringify({ pricingType }),
    };
  }

  if (pricingType === PricingType.Dynamic) {
    if (source.pricing?.fixed != null) {
      throw new Error(
        `${optionLabel}.pricing.fixed is only valid when pricingType is Fixed`
      );
    }
    if (chain === CARDANO_CHAIN && source.pricing?.dynamic != null) {
      throw new Error(
        `${optionLabel}.pricing.dynamic is not supported for Cardano`
      );
    }
    const dynamic = source.pricing?.dynamic?.[0];
    if (
      source.pricing?.dynamic != null &&
      source.pricing.dynamic.length !== 1
    ) {
      throw new Error(
        `${optionLabel}.pricing.dynamic must contain exactly one accepted asset`
      );
    }
    const asset = metadataStringConvert(dynamic?.asset);
    const decimalsRaw = metadataStringConvert(dynamic?.decimals);
    const decimals = parseAssetDecimals(decimalsRaw);
    if (
      chain === EVM_CHAIN &&
      dynamic != null &&
      (asset == null ||
        !EVM_ADDRESS.test(asset) ||
        decimalsRaw == null ||
        decimals == null)
    ) {
      throw new Error(
        `${optionLabel}.pricing.dynamic[0] must contain an ERC-20 contract and valid decimals`
      );
    }
    return {
      pricing: { pricingType },
      dynamicAsset: asset?.toLowerCase() ?? null,
      dynamicDecimals: decimals,
      fixedDecimals: null,
      canonicalPricing: JSON.stringify({
        pricingType,
        dynamic:
          asset != null && decimals != null
            ? [{ asset: asset.toLowerCase(), decimals }]
            : [],
      }),
    };
  }

  if (source.pricing?.dynamic != null) {
    throw new Error(
      `${optionLabel}.pricing.dynamic is only valid when pricingType is Dynamic`
    );
  }
  const fixed = source.pricing?.fixed;
  if (fixed == null || fixed.length === 0) {
    throw new Error(
      `${optionLabel}.pricing.fixed requires at least one asset and amount`
    );
  }
  if (fixed.length > MAX_FIXED_PRICES) {
    throw new Error(
      `${optionLabel}.pricing.fixed must not contain more than ${MAX_FIXED_PRICES} assets`
    );
  }
  if (chain === EVM_CHAIN && fixed.length !== 1) {
    throw new Error(
      `${optionLabel}.pricing.fixed requires exactly one ERC-20 asset for x402`
    );
  }

  const amounts = fixed.map((entry, priceIndex) => {
    const asset = metadataStringConvert(entry.asset);
    const amount = parseAtomicAmount(metadataStringConvert(entry.amount));
    const decimalsRaw = metadataStringConvert(entry.decimals);
    const decimals = parseAssetDecimals(decimalsRaw);
    if (asset == null || amount == null) {
      throw new Error(
        `${optionLabel}.pricing.fixed[${priceIndex}] requires a valid asset and positive atomic amount`
      );
    }
    if (chain === CARDANO_CHAIN && decimalsRaw != null) {
      throw new Error(
        `${optionLabel}.pricing.fixed[${priceIndex}].decimals is not valid for Cardano`
      );
    }
    if (
      chain === EVM_CHAIN &&
      (!EVM_ADDRESS.test(asset) || decimalsRaw == null || decimals == null)
    ) {
      throw new Error(
        `${optionLabel}.pricing.fixed[${priceIndex}] requires an ERC-20 contract and valid decimals`
      );
    }
    return {
      unit: chain === EVM_CHAIN ? asset.toLowerCase() : asset,
      amount,
      decimals,
    };
  });

  return {
    pricing: {
      pricingType,
      FixedPricing: {
        create: {
          Amounts: {
            createMany: {
              data: amounts.map(({ unit, amount }) => ({ unit, amount })),
            },
          },
        },
      },
    },
    dynamicAsset: null,
    dynamicDecimals: null,
    fixedDecimals: chain === EVM_CHAIN ? (amounts[0]?.decimals ?? null) : null,
    canonicalPricing: JSON.stringify({
      pricingType,
      fixed: amounts
        .map(({ unit, amount, decimals }) => ({
          asset: unit.toLowerCase(),
          amount: amount.toString(),
          decimals,
        }))
        .sort((left, right) =>
          `${left.asset}:${left.amount}:${left.decimals ?? ''}`.localeCompare(
            `${right.asset}:${right.amount}:${right.decimals ?? ''}`
          )
        ),
    }),
  };
}

// Flatten the grouped on-chain sources into source-owned relational creates.
export function buildV2SupportedPaymentSourceRows(
  metadata: Web3CardanoV2Metadata
): Prisma.SupportedPaymentSourceCreateWithoutRegistryEntryInput[] {
  const rows: Prisma.SupportedPaymentSourceCreateWithoutRegistryEntryInput[] =
    [];
  const seenSources = new Set<string>();
  for (const [sourceIndex, source] of (
    metadata.supported_payment_sources ?? []
  ).entries()) {
    const chain = metadataStringConvert(source.chain);
    const network = metadataStringConvert(source.network);
    const optionLabel = `supported_payment_sources[${sourceIndex}]`;
    if ((chain !== CARDANO_CHAIN && chain !== EVM_CHAIN) || network == null) {
      throw new Error(`${optionLabel} has an unsupported chain or network`);
    }
    const settlement = source.settlement ?? {};
    const pricing = buildPricingCreate(source, sourceIndex, chain);

    if (chain === EVM_CHAIN) {
      const payTo = metadataStringConvert(settlement.payTo);
      const scheme = metadataStringConvert(settlement.scheme);
      if (payTo == null || !EVM_ADDRESS.test(payTo) || scheme !== 'Exact') {
        throw new Error(
          `${optionLabel}.settlement requires scheme Exact and a valid payTo address`
        );
      }
      const resource = metadataStringConvert(settlement.resource) ?? null;
      const canonicalSource = JSON.stringify({
        chain,
        network,
        scheme,
        payTo: payTo.toLowerCase(),
        resource: resource ?? '',
        pricing: pricing.canonicalPricing,
      });
      if (seenSources.has(canonicalSource)) {
        throw new Error(
          `${optionLabel} duplicates an earlier supported payment source`
        );
      }
      seenSources.add(canonicalSource);

      rows.push({
        chain,
        network,
        sourceIndex,
        address: payTo.toLowerCase(),
        scheme,
        payTo: payTo.toLowerCase(),
        dynamicAsset: pricing.dynamicAsset,
        dynamicDecimals: pricing.dynamicDecimals,
        fixedDecimals: pricing.fixedDecimals,
        Pricing: { create: pricing.pricing },
        resource,
        ...(settlement.extra !== undefined
          ? { extra: settlement.extra as Prisma.InputJsonValue }
          : {}),
      });
      continue;
    }

    const address = metadataStringConvert(settlement.address);
    const paymentSourceType = metadataStringConvert(
      settlement.paymentSourceType
    );
    if (address == null || paymentSourceType !== 'Web3CardanoV2') {
      throw new Error(
        `${optionLabel}.settlement requires a Web3CardanoV2 paymentSourceType and address`
      );
    }
    const canonicalSource = JSON.stringify({
      chain,
      network,
      paymentSourceType,
      address,
      pricing: pricing.canonicalPricing,
    });
    if (seenSources.has(canonicalSource)) {
      throw new Error(
        `${optionLabel} duplicates an earlier supported payment source`
      );
    }
    seenSources.add(canonicalSource);
    rows.push({
      chain,
      network,
      sourceIndex,
      address,
      paymentSourceType,
      Pricing: { create: pricing.pricing },
    });
  }
  if (rows.length === 0) {
    throw new Error(
      'V2 metadata requires at least one supported_payment_sources entry with source-local pricing'
    );
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
