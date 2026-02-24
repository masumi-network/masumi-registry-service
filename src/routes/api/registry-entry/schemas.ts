import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { $Enums, Network, Prisma } from '@prisma/client';

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
      metadataVersion: z
        .array(z.number({ coerce: true }).int().min(1).max(2))
        .max(2)
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
  metadataVersion: z
    .array(z.number({ coerce: true }).int().min(1).max(2))
    .max(2)
    .optional(),
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
    metadataVersion: z.number().int(),
    agentCardUrl: z.string().nullable(),
    a2aProtocolVersions: z.array(z.string()),
    a2aAgentVersion: z.string().nullable(),
    a2aDefaultInputModes: z.array(z.string()),
    a2aDefaultOutputModes: z.array(z.string()),
    a2aProviderName: z.string().nullable(),
    a2aProviderUrl: z.string().nullable(),
    a2aDocumentationUrl: z.string().nullable(),
    a2aIconUrl: z.string().nullable(),
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
    updatedAt: z.date(),
    A2ASkills: z.array(
      z.object({
        id: z.string(),
        skillId: z.string(),
        name: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        examples: z.array(z.string()),
        inputModes: z.array(z.string()),
        outputModes: z.array(z.string()),
      })
    ),
    A2ASupportedInterfaces: z.array(
      z.object({
        id: z.string(),
        url: z.string(),
        protocolBinding: z.string(),
        protocolVersion: z.string(),
      })
    ),
    A2ACapabilities: z
      .object({
        streaming: z.boolean().nullable(),
        pushNotifications: z.boolean().nullable(),
        extensions: z
          .array(
            z.object({
              uri: z.string(),
              description: z.string().optional(),
              required: z.boolean().optional(),
            })
          )
          .nullable(),
      })
      .nullable(),
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
  A2ASkills?: Array<{
    id: string;
    skillId: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes: string[];
    outputModes: string[];
  }>;
  A2ASupportedInterfaces?: Array<{
    id: string;
    url: string;
    protocolBinding: string;
    protocolVersion: string;
  }>;
  A2ACapabilities?: {
    streaming: boolean | null;
    pushNotifications: boolean | null;
    // Prisma returns JsonValue for JSONB fields; Zod validates the shape at the route layer
    extensions: Prisma.JsonValue | null;
  } | null;
  a2aAgentVersion?: string | null;
  a2aDefaultInputModes?: string[];
  a2aDefaultOutputModes?: string[];
  a2aProviderName?: string | null;
  a2aProviderUrl?: string | null;
  a2aDocumentationUrl?: string | null;
  a2aIconUrl?: string | null;
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
      ExampleOutput: (entry.ExampleOutput ?? []).map((output) => ({
        name: output.name,
        mimeType: output.mimeType,
        url: output.url,
      })),
      metadataVersion: entry.metadataVersion,
      A2ASkills: entry.A2ASkills ?? [],
      A2ASupportedInterfaces: entry.A2ASupportedInterfaces ?? [],
      A2ACapabilities: entry.A2ACapabilities ?? null,
      a2aProtocolVersions: (entry.a2aProtocolVersions as string[]) ?? [],
      agentCardUrl: (entry.agentCardUrl as string | null) ?? null,
      a2aAgentVersion: (entry.a2aAgentVersion as string | null) ?? null,
      a2aDefaultInputModes: (entry.a2aDefaultInputModes as string[]) ?? [],
      a2aDefaultOutputModes: (entry.a2aDefaultOutputModes as string[]) ?? [],
      a2aProviderName: (entry.a2aProviderName as string | null) ?? null,
      a2aProviderUrl: (entry.a2aProviderUrl as string | null) ?? null,
      a2aDocumentationUrl: (entry.a2aDocumentationUrl as string | null) ?? null,
      a2aIconUrl: (entry.a2aIconUrl as string | null) ?? null,
    }));

  return serialized as unknown as z.infer<
    typeof queryRegistrySchemaOutput
  >['entries'];
}
