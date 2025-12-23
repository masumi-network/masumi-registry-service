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
  cursorId: z.string().min(1).max(50).optional(),
});

export const registryEntrySchemaOutput = z
  .object({
    id: z.string(),
    name: z.string(),
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
  })
  .openapi('RegistryEntry');

export const queryRegistrySchemaOutput = z.object({
  entries: z.array(registryEntrySchemaOutput),
});

export type RegistryEntrySerializable = {
  assetIdentifier: string;
  lastUptimeCheck?: Date | string;
  AgentPricing: {
    pricingType: $Enums.PricingType;
    FixedPricing?: {
      Amounts?: { amount: bigint | number | string; unit: string }[] | null;
    } | null;
  };
  ExampleOutput?: unknown[];
} & Record<string, unknown>;

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
      ExampleOutput: [],
    }));

  return serialized as unknown as z.infer<
    typeof queryRegistrySchemaOutput
  >['entries'];
}
