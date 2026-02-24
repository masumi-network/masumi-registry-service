import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { $Enums, Network } from '@prisma/client';

export const queryRegistrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  //optional data
  cursorId: z.string().min(1).max(50).optional(),
  filter: z
    .object({
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
    })
    .optional(),
  minHealthCheckDate: ez.dateIn().optional(),
});

export const registryDiffSchemaInput = z.object({
  network: z.nativeEnum(Network),
  statusUpdatedAfter: ez.dateIn(),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
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

export const registryEntrySchemaOutput = z
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
    apiBaseUrl: z.string(),
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
    paymentType: z.nativeEnum($Enums.PaymentType),
    RegistrySource: z.object({
      id: z.string(),
      type: z.nativeEnum($Enums.RegistryEntryType),
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
      ),
    ExampleOutput: z.array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        url: z.string(),
      })
    ),
    metadataVersion: z.number().int(),
    updatedAt: z.date(),
  })
  .openapi('RegistryEntry');

export const queryRegistrySchemaOutput = z.object({
  entries: z.array(registryEntrySchemaOutput),
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
  apiBaseUrl: string;
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
  paymentType: $Enums.PaymentType;
  metadataVersion: number;
  RegistrySource: {
    id: string;
    type: $Enums.RegistryEntryType;
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
  };
  ExampleOutput: { name: string; mimeType: string; url: string }[];
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
      lastUptimeCheck:
        entry.lastUptimeCheck instanceof Date
          ? entry.lastUptimeCheck
          : entry.lastUptimeCheck
            ? new Date(entry.lastUptimeCheck)
            : entry.lastUptimeCheck,
      AgentPricing:
        entry.AgentPricing.pricingType == $Enums.PricingType.Free
          ? {
              pricingType: $Enums.PricingType.Free,
            }
          : {
              pricingType: entry.AgentPricing.pricingType,
              FixedPricing: {
                Amounts:
                  entry.AgentPricing.FixedPricing?.Amounts?.map((amount) => ({
                    amount: amount.amount.toString(),
                    unit: amount.unit,
                  })) ?? [],
              },
            },
      ExampleOutput: (entry.ExampleOutput ?? []).map((output) => ({
        name: output.name,
        mimeType: output.mimeType,
        url: output.url,
      })),
      metadataVersion: entry.metadataVersion,
    }));

  return serialized as unknown as z.infer<
    typeof queryRegistrySchemaOutput
  >['entries'];
}
