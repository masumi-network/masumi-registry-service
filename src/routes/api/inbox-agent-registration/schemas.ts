import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { InboxAgentRegistrationStatus, Network } from '@prisma/client';

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

export const searchInboxAgentRegistrationSchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      'Case-insensitive fuzzy match against inbox agent slug, name, or linked email.'
    ),
  filter: z
    .object({
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
    providerUrl: z.string().nullable(),
    linkedEmail: z.string().nullable(),
    encryptionPublicKey: z.string().nullable(),
    encryptionKeyVersion: z.string().nullable(),
    signingPublicKey: z.string().nullable(),
    signingKeyVersion: z.string().nullable(),
    metadataVersion: z.number().int(),
    RegistrySource: z.object({
      id: z.string(),
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
  providerUrl: string | null;
  linkedEmail: string | null;
  encryptionPublicKey: string | null;
  encryptionKeyVersion: string | null;
  signingPublicKey: string | null;
  signingKeyVersion: string | null;
  metadataVersion: number;
  RegistrySource: {
    id: string;
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
      providerUrl: registration.providerUrl,
      linkedEmail: registration.linkedEmail,
      encryptionPublicKey: registration.encryptionPublicKey,
      encryptionKeyVersion: registration.encryptionKeyVersion,
      signingPublicKey: registration.signingPublicKey,
      signingKeyVersion: registration.signingKeyVersion,
      metadataVersion: registration.metadataVersion,
      RegistrySource: {
        id: registration.RegistrySource.id,
        policyId: registration.RegistrySource.policyId,
        url: registration.RegistrySource.url,
      },
    }));
}
