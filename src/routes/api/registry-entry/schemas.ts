import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { $Enums, Network } from '@prisma/client';

const registryEntryFilterSchema = z.object({
  paymentTypes: z.array(z.nativeEnum($Enums.PaymentType)).max(5).optional(),
  status: z.array(z.nativeEnum($Enums.Status)).max(5).optional(),
  policyId: z.string().min(1).max(250).optional(),
  assetIdentifier: z.string().min(1).max(250).optional(),
  tags: z.array(z.string().min(1).max(150)).optional(),
  capability: z
    .object({
      name: z.string().min(1).max(150),
      version: z.string().max(150).optional(),
    })
    .optional(),
  resolveToLatestVersion: z
    .boolean()
    .optional()
    .describe(
      'When true and an assetIdentifier filter is provided, the assetIdentifier ' +
        'is first resolved to the latest version of the same V2 agent (same ' +
        'root, highest version) before matching — so passing any older version ' +
        'returns the current one. No effect on V1 assets or when no ' +
        'assetIdentifier is given. The plain assetIdentifier filter always stays ' +
        'an exact match.'
    ),
});

export const registryEntrySortValues = [
  'createdAt-desc',
  'createdAt-asc',
  'name-asc',
  'name-desc',
  'lastUptimeCheck-desc',
  'lastUptimeCheck-asc',
] as const;

export const registryEntrySortSchema = z
  .enum(registryEntrySortValues)
  .describe(
    'Sort order for paginated results. Defaults to createdAt-desc. Cursor pagination stays stable via id tie-breakers.'
  );

export type RegistryEntrySort = (typeof registryEntrySortValues)[number];

export const queryRegistrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  //optional data
  cursorId: z.string().min(1).max(50).optional(),
  filter: registryEntryFilterSchema.optional(),
  sort: registryEntrySortSchema.optional(),
  minHealthCheckDate: ez.dateIn().optional(),
});

export const searchRegistrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      'Case-insensitive fuzzy match against registry entry core metadata, capability, asset identifier, api base URL, and tags.'
    ),
  filter: registryEntryFilterSchema.optional(),
  sort: registryEntrySortSchema.optional(),
  minHealthCheckDate: ez.dateIn().optional(),
});

export const refreshRegistryEntrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  agentIdentifier: z.string().min(1).max(250),
});

export const registryDiffSchemaInput = z.object({
  network: z.nativeEnum(Network),
  statusUpdatedAfter: ez.dateIn(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursorId: z
    .string()
    .min(1)
    .max(75)
    .optional()
    .describe(
      'The ID of the last item in the previous page, it and all items after it will be included in the next page response if they did not change since the last page (if they did they will be moved to the newer timestamp). Guaranteed to include all items at least once, when paginating forward. (always use statusUpdatedAt of the last item + its cursorId to paginate forward) '
    ),
  policyId: z
    .string()
    .min(1)
    .max(250)
    .optional()
    .describe(
      'The policy ID of the registry source to filter by. If not specified, queries all registry sources.'
    ),
});

const registryEntrySchemaOutput = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date(),
    description: z.string().nullable(),
    status: z.nativeEnum($Enums.Status),
    statusUpdatedAt: z.date(),
    lastUptimeCheck: z.date(),
    uptimeCount: z.number(),
    uptimeCheckCount: z.number(),
    type: z.nativeEnum($Enums.RegistryEntryType),
    apiBaseUrl: z.string().nullable(),
    openApiSpecUrl: z.string().nullable(),
    x402ResourcesUrl: z.string().nullable(),
    authorName: z.string().nullable(),
    authorOrganization: z.string().nullable(),
    authorContactEmail: z.string().nullable(),
    authorContactOther: z.string().nullable(),
    image: z.string().nullable(),
    privacyPolicy: z.string().nullable(),
    termsAndCondition: z.string().nullable(),
    otherLegal: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    agentIdentifier: z.string(),
    supersedesAgentIdentifier: z
      .string()
      .nullable()
      .describe(
        'For a V2 agent, the older version this entry replaced (same root, ' +
          'next-lower version), or null if this is the first/only version. ' +
          'Always null for V1 assets. Computed live from stored versions.'
      ),
    supersededByAgentIdentifier: z
      .string()
      .nullable()
      .describe(
        'For a V2 agent, the newer version that replaced this entry (same ' +
          'root, next-higher version), or null if this is the latest version. ' +
          'Always null for V1 assets. Computed live from stored versions.'
      ),
    paymentType: z.nativeEnum($Enums.PaymentType),
    RegistrySource: z.object({
      id: z.string(),
      policyId: z.string().nullable(),
      url: z.string().nullable(),
    }),
    Capability: z
      .object({
        name: z.string().nullable(),
        version: z.string().nullable(),
      })
      .nullable(),
    AgentPricing: z
      .object({
        pricingType: z.literal($Enums.PricingType.Fixed),
        FixedPricing: z.object({
          Amounts: z.array(
            z.object({
              amount: z.string(),
              unit: z.string(),
            })
          ),
        }),
      })
      .or(
        z.object({
          pricingType: z.literal($Enums.PricingType.Free),
        })
      )
      .or(
        z.object({
          pricingType: z.literal($Enums.PricingType.Dynamic),
        })
      )
      .nullable(),
    ExampleOutput: z.array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        url: z.string(),
      })
    ),
    SupportedPaymentSources: z.array(
      z.object({
        chain: z.string(),
        network: z.string(),
        sourceIndex: z.number().int().min(0),
        paymentSourceType: z.string().nullable(),
        address: z.string(),
        scheme: z.string().nullable(),
        pricing: z
          .object({
            pricingType: z.literal($Enums.PricingType.Fixed),
            fixed: z.array(
              z.object({
                asset: z.string(),
                amount: z.string(),
                decimals: z.number().int().min(0).max(255).optional(),
              })
            ),
          })
          .or(
            z.object({
              pricingType: z.literal($Enums.PricingType.Dynamic),
              dynamic: z
                .array(
                  z.object({
                    asset: z.string(),
                    decimals: z.number().int().min(0).max(255),
                  })
                )
                .max(1)
                .optional(),
            })
          )
          .or(
            z.object({
              pricingType: z.literal($Enums.PricingType.Free),
            })
          ),
        payTo: z.string().nullable(),
        resource: z.string().nullable(),
      })
    ),
    Verifications: z.array(
      z.object({
        method: z.string(),
        schemaVersion: z.string().nullable(),
        issuerAid: z.string(),
        issuerOobi: z.string(),
        schemaSaid: z.string(),
        schemaOobi: z.string(),
        credentialSaid: z.string(),
        credentialOobi: z.string(),
        credentialRegistry: z.string().nullable(),
        holderAid: z.string(),
        holderOobi: z.string(),
        baseUrl: z.string().nullable(),
      })
    ),
    metadataVersion: z.number().int(),
    updatedAt: z.date(),
  })
  .openapi('RegistryEntry');

export const queryRegistrySchemaOutput = z.object({
  entries: z.array(registryEntrySchemaOutput),
});

export const refreshRegistryEntrySchemaOutput = z.object({
  entry: registryEntrySchemaOutput,
});

export type RegistryEntrySerializable = {
  id: string;
  name: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  description: string | null;
  status: $Enums.Status;
  statusUpdatedAt: Date | string;
  lastUptimeCheck: Date | string;
  uptimeCount: number;
  uptimeCheckCount: number;
  type: $Enums.RegistryEntryType;
  apiBaseUrl: string | null;
  openApiSpecUrl: string | null;
  x402ResourcesUrl: string | null;
  authorName: string | null;
  authorOrganization: string | null;
  authorContactEmail: string | null;
  authorContactOther: string | null;
  image: string | null;
  privacyPolicy: string | null;
  termsAndCondition: string | null;
  otherLegal: string | null;
  tags: string[] | null;
  assetIdentifier: string;
  supersedesAgentIdentifier?: string | null;
  supersededByAgentIdentifier?: string | null;
  paymentType: $Enums.PaymentType;
  metadataVersion: number;
  RegistrySource: {
    id: string;
    policyId: string | null;
    url: string | null;
  };
  Capability: {
    name: string | null;
    version: string | null;
  } | null;
  AgentPricing: {
    pricingType: $Enums.PricingType;
    FixedPricing?: {
      Amounts?: { amount: bigint | number | string; unit: string }[] | null;
    } | null;
  } | null;
  ExampleOutput: { name: string; mimeType: string; url: string }[];
  SupportedPaymentSources: {
    chain: string;
    network: string;
    sourceIndex: number;
    paymentSourceType: string | null;
    address: string;
    scheme: string | null;
    dynamicAsset: string | null;
    dynamicDecimals: number | null;
    fixedDecimals: number | null;
    Pricing: {
      pricingType: $Enums.PricingType;
      FixedPricing?: {
        Amounts?: { amount: bigint | number | string; unit: string }[] | null;
      } | null;
    } | null;
    payTo: string | null;
    resource: string | null;
  }[];
  Verifications: {
    method: string;
    schemaVersion: string | null;
    issuerAid: string;
    issuerOobi: string;
    schemaSaid: string;
    schemaOobi: string;
    credentialSaid: string;
    credentialOobi: string;
    credentialRegistry: string | null;
    holderAid: string;
    holderOobi: string;
    baseUrl: string | null;
  }[];
};

export function serializeRegistryEntries(
  entries: RegistryEntrySerializable[],
  limit: number
): z.infer<typeof queryRegistrySchemaOutput>['entries'] {
  const serialized = entries
    .slice(0, Math.min(limit, entries.length))
    .map((entry) => ({
      ...entry,
      agentIdentifier: entry.assetIdentifier,
      supersedesAgentIdentifier: entry.supersedesAgentIdentifier ?? null,
      supersededByAgentIdentifier: entry.supersededByAgentIdentifier ?? null,
      lastUptimeCheck:
        entry.lastUptimeCheck instanceof Date
          ? entry.lastUptimeCheck
          : entry.lastUptimeCheck
            ? new Date(entry.lastUptimeCheck)
            : entry.lastUptimeCheck,
      AgentPricing:
        entry.AgentPricing == null
          ? null
          : entry.AgentPricing.pricingType === $Enums.PricingType.Fixed
            ? {
                pricingType: $Enums.PricingType.Fixed,
                FixedPricing: {
                  Amounts:
                    entry.AgentPricing.FixedPricing?.Amounts?.map((amount) => ({
                      amount: amount.amount.toString(),
                      unit: amount.unit,
                    })) ?? [],
                },
              }
            : {
                // Free or Dynamic — no FixedPricing
                pricingType: entry.AgentPricing.pricingType,
              },
      ExampleOutput: (entry.ExampleOutput ?? []).map((output) => ({
        name: output.name,
        mimeType: output.mimeType,
        url: output.url,
      })),
      SupportedPaymentSources: [...(entry.SupportedPaymentSources ?? [])]
        .sort((left, right) => left.sourceIndex - right.sourceIndex)
        .map((source) => {
          if (source.Pricing == null) {
            throw new Error(
              `Registry entry ${entry.assetIdentifier} payment source ${source.sourceIndex} is missing pricing`
            );
          }
          const amounts = source.Pricing.FixedPricing?.Amounts ?? [];
          const pricing =
            source.Pricing.pricingType === $Enums.PricingType.Fixed
              ? {
                  pricingType: $Enums.PricingType.Fixed,
                  fixed: amounts.map((amount) => ({
                    asset: amount.unit,
                    amount: amount.amount.toString(),
                    ...(source.fixedDecimals != null
                      ? { decimals: source.fixedDecimals }
                      : {}),
                  })),
                }
              : source.Pricing.pricingType === $Enums.PricingType.Dynamic
                ? {
                    pricingType: $Enums.PricingType.Dynamic,
                    ...(source.dynamicAsset != null &&
                    source.dynamicDecimals != null
                      ? {
                          dynamic: [
                            {
                              asset: source.dynamicAsset,
                              decimals: source.dynamicDecimals,
                            },
                          ],
                        }
                      : {}),
                  }
                : { pricingType: $Enums.PricingType.Free };
          return {
            chain: source.chain,
            network: source.network,
            sourceIndex: source.sourceIndex,
            paymentSourceType: source.paymentSourceType,
            address: source.address,
            scheme: source.scheme,
            pricing,
            payTo: source.payTo,
            resource: source.resource,
          };
        }),
      Verifications: (entry.Verifications ?? []).map((verification) => ({
        method: verification.method,
        schemaVersion: verification.schemaVersion,
        issuerAid: verification.issuerAid,
        issuerOobi: verification.issuerOobi,
        schemaSaid: verification.schemaSaid,
        schemaOobi: verification.schemaOobi,
        credentialSaid: verification.credentialSaid,
        credentialOobi: verification.credentialOobi,
        credentialRegistry: verification.credentialRegistry,
        holderAid: verification.holderAid,
        holderOobi: verification.holderOobi,
        baseUrl: verification.baseUrl,
      })),
      metadataVersion: entry.metadataVersion,
    }));

  return serialized as unknown as z.infer<
    typeof queryRegistrySchemaOutput
  >['entries'];
}
