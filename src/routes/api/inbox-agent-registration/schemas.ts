import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { $Enums, InboxAgentRegistrationStatus, Network } from '@prisma/client';

export const queryInboxAgentRegistrationSchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  filter: z
    .object({
      agentSlug: z.string().min(1).max(80).optional(),
      status: z
        .array(z.nativeEnum(InboxAgentRegistrationStatus))
        .max(4)
        .optional(),
      policyId: z.string().min(1).max(250).optional(),
    })
    .optional(),
});

export const inboxAgentRegistrationDiffSchemaInput = z.object({
  network: z.nativeEnum(Network),
  statusUpdatedAfter: ez.dateIn(),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z
    .string()
    .min(1)
    .max(75)
    .optional()
    .describe(
      'The ID of the last item in the previous page. Use the last item statusUpdatedAt plus cursorId to paginate forward without missing transitions.'
    ),
  policyId: z.string().min(1).max(250).optional(),
  agentSlug: z.string().min(1).max(80).optional(),
  status: z.array(z.nativeEnum(InboxAgentRegistrationStatus)).max(4).optional(),
});

export const inboxAgentRegistrationSchemaOutput = z
  .object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    status: z.nativeEnum(InboxAgentRegistrationStatus),
    statusUpdatedAt: z.date(),
    name: z.string(),
    description: z.string().nullable(),
    agentSlug: z.string(),
    agentIdentifier: z.string(),
    metadataVersion: z.number().int(),
    RegistrySource: z.object({
      id: z.string(),
      type: z.literal($Enums.RegistryEntryType.MasumiInboxV1),
      policyId: z.string().nullable(),
      url: z.string().nullable(),
    }),
  })
  .openapi('InboxAgentRegistration');

export const queryInboxAgentRegistrationSchemaOutput = z.object({
  registrations: z.array(inboxAgentRegistrationSchemaOutput),
});

export type InboxAgentRegistrationSerializable = {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  status: InboxAgentRegistrationStatus;
  statusUpdatedAt: Date | string;
  name: string;
  description: string | null;
  agentSlug: string;
  assetIdentifier: string;
  metadataVersion: number;
  RegistrySource: {
    id: string;
    type: $Enums.RegistryEntryType;
    policyId: string | null;
    url: string | null;
  };
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function serializeInboxAgentRegistrations(
  registrations: InboxAgentRegistrationSerializable[],
  limit: number
): z.infer<typeof queryInboxAgentRegistrationSchemaOutput>['registrations'] {
  return registrations
    .slice(0, Math.min(limit, registrations.length))
    .map((registration) => ({
      id: registration.id,
      createdAt: toDate(registration.createdAt),
      updatedAt: toDate(registration.updatedAt),
      status: registration.status,
      statusUpdatedAt: toDate(registration.statusUpdatedAt),
      name: registration.name,
      description: registration.description,
      agentSlug: registration.agentSlug,
      agentIdentifier: registration.assetIdentifier,
      metadataVersion: registration.metadataVersion,
      RegistrySource: {
        id: registration.RegistrySource.id,
        type: $Enums.RegistryEntryType.MasumiInboxV1,
        policyId: registration.RegistrySource.policyId,
        url: registration.RegistrySource.url,
      },
    }));
}
