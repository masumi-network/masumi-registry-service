import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { $Enums, Network, Prisma } from '@prisma/client';

const a2aRegistryEntryFilterSchema = z.object({
  status: z.array(z.nativeEnum($Enums.Status)).max(5).optional(),
  policyId: z.string().min(1).max(250).optional(),
  assetIdentifier: z.string().min(1).max(250).optional(),
  tags: z.array(z.string().min(1).max(150)).optional(),
});

export const queryA2ARegistrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  filter: a2aRegistryEntryFilterSchema.optional(),
  minHealthCheckDate: ez.dateIn().optional(),
});

export const searchA2ARegistrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      'Case-insensitive fuzzy match against A2A registry entry metadata, asset identifier, and tags.'
    ),
  filter: a2aRegistryEntryFilterSchema.optional(),
  minHealthCheckDate: ez.dateIn().optional(),
});

export const a2aRegistryDiffSchemaInput = z.object({
  network: z.nativeEnum(Network),
  statusUpdatedAfter: ez.dateIn(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursorId: z
    .string()
    .min(1)
    .max(75)
    .optional()
    .describe(
      'The ID of the last item in the previous page. Use the last item statusUpdatedAt plus cursorId to paginate forward.'
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

const a2aRegistryEntrySchemaOutput = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
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
      policyId: z.string().nullable(),
      url: z.string().nullable(),
    }),
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
        tenant: z.string().nullable(),
      })
    ),
    A2ACapabilities: z
      .object({
        streaming: z.boolean().nullable(),
        pushNotifications: z.boolean().nullable(),
        extendedAgentCard: z.boolean().nullable(),
        extensions: z
          .array(
            z.object({
              uri: z.string(),
              description: z.string().optional(),
              required: z.boolean().optional(),
              params: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
      })
      .nullable(),
  })
  .openapi('A2ARegistryEntry');

export const queryA2ARegistrySchemaOutput = z.object({
  entries: z.array(a2aRegistryEntrySchemaOutput),
});

type A2ARegistryEntrySerializable = {
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
  metadataVersion: number;
  agentCardUrl: string | null;
  a2aProtocolVersions: string[];
  a2aAgentVersion: string | null;
  a2aDefaultInputModes: string[];
  a2aDefaultOutputModes: string[];
  a2aProviderName: string | null;
  a2aProviderUrl: string | null;
  a2aDocumentationUrl: string | null;
  a2aIconUrl: string | null;
  RegistrySource: {
    id: string;
    policyId: string | null;
    url: string | null;
  };
  A2ASkills: Array<{
    id: string;
    skillId: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes: string[];
    outputModes: string[];
  }>;
  A2ASupportedInterfaces: Array<{
    id: string;
    url: string;
    protocolBinding: string;
    protocolVersion: string;
    tenant: string | null;
  }>;
  A2ACapabilities?: {
    streaming: boolean | null;
    pushNotifications: boolean | null;
    extendedAgentCard: boolean | null;
    extensions: Prisma.JsonValue | null;
  } | null;
} & Record<string, unknown>;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function serializeA2ARegistryEntries(
  entries: A2ARegistryEntrySerializable[],
  limit: number
): z.infer<typeof queryA2ARegistrySchemaOutput>['entries'] {
  const serialized = entries
    .slice(0, Math.min(limit, entries.length))
    .map((entry) => ({
      ...entry,
      agentIdentifier: entry.assetIdentifier,
      createdAt: toDate(entry.createdAt),
      updatedAt: toDate(entry.updatedAt),
      statusUpdatedAt: toDate(entry.statusUpdatedAt),
      lastUptimeCheck: toDate(entry.lastUptimeCheck),
      A2ASkills: entry.A2ASkills ?? [],
      A2ASupportedInterfaces: entry.A2ASupportedInterfaces ?? [],
      A2ACapabilities: entry.A2ACapabilities ?? null,
    }));

  return serialized as unknown as z.infer<
    typeof queryA2ARegistrySchemaOutput
  >['entries'];
}
