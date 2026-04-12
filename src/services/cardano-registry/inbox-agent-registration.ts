import { InboxAgentRegistrationStatus } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { isReservedInboxSlug, normalizeInboxSlug } from '@/utils/inbox-slug';

const METADATA_VERSION = 1;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_AGENT_SLUG_LENGTH = 80;

export const inboxAgentRegistrationMetadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  description: z.string().or(z.array(z.string())).optional(),
  agentslug: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  metadata_version: z
    .number({ coerce: true })
    .int()
    .min(METADATA_VERSION)
    .max(METADATA_VERSION),
});

export type NormalizedInboxAgentRegistrationMetadata = {
  name: string;
  description: string | null;
  agentSlug: string;
  metadataVersion: number;
};

type InboxAgentRegistrationContent = Pick<
  NormalizedInboxAgentRegistrationMetadata,
  'name' | 'description' | 'agentSlug'
>;

function requireStringValue(
  value: string | string[] | undefined,
  field: string
): string {
  const normalized = metadataStringConvert(value);
  if (normalized == null || normalized.length === 0) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeRequiredText(
  value: string | string[] | undefined,
  field: string,
  maxLength: number
): string {
  const rawValue = requireStringValue(value, field);
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    throw new Error(`${field} is required`);
  }
  if (trimmedValue.length > maxLength) {
    throw new Error(
      `${field} must be ${maxLength.toString()} characters or fewer`
    );
  }
  return trimmedValue;
}

function normalizeOptionalText(
  value: string | string[] | undefined,
  field: string,
  maxLength: number
): string | null {
  if (value == null) return null;
  const rawValue = metadataStringConvert(value);
  const trimmedValue = rawValue?.trim();
  if (!trimmedValue) return null;
  if (trimmedValue.length > maxLength) {
    throw new Error(
      `${field} must be ${maxLength.toString()} characters or fewer`
    );
  }
  return trimmedValue;
}

function normalizeAgentSlug(value: string | string[] | undefined): string {
  const rawValue = requireStringValue(value, 'agentslug');
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    throw new Error('agentslug is required');
  }
  if (trimmedValue.length > MAX_AGENT_SLUG_LENGTH) {
    throw new Error(
      `agentslug must be ${MAX_AGENT_SLUG_LENGTH.toString()} characters or fewer`
    );
  }
  if (rawValue !== trimmedValue) {
    throw new Error(
      'agentslug must not contain leading or trailing whitespace'
    );
  }

  const normalizedSlug = normalizeInboxSlug(trimmedValue);
  if (!normalizedSlug) {
    throw new Error('agentslug is required');
  }
  if (isReservedInboxSlug(normalizedSlug)) {
    throw new Error('agentslug is reserved');
  }
  if (trimmedValue !== normalizedSlug) {
    throw new Error('agentslug must already be canonical');
  }

  return normalizedSlug;
}

export function normalizeInboxAgentRegistrationMetadata(
  metadata: z.infer<typeof inboxAgentRegistrationMetadataSchema>
): NormalizedInboxAgentRegistrationMetadata {
  return {
    name: normalizeRequiredText(metadata.name, 'name', MAX_NAME_LENGTH),
    description: normalizeOptionalText(
      metadata.description,
      'description',
      MAX_DESCRIPTION_LENGTH
    ),
    agentSlug: normalizeAgentSlug(metadata.agentslug),
    metadataVersion: metadata.metadata_version,
  };
}

export function parseInboxAgentRegistrationMetadata(
  metadata: unknown
): NormalizedInboxAgentRegistrationMetadata | null {
  const parsedMetadata =
    inboxAgentRegistrationMetadataSchema.safeParse(metadata);
  if (!parsedMetadata.success) {
    return null;
  }

  try {
    return normalizeInboxAgentRegistrationMetadata(parsedMetadata.data);
  } catch {
    return null;
  }
}

export function hasInboxAgentRegistrationContentChanged(
  current: InboxAgentRegistrationContent,
  next: InboxAgentRegistrationContent
): boolean {
  return (
    current.name !== next.name ||
    current.description !== next.description ||
    current.agentSlug !== next.agentSlug
  );
}

export function nextInboxAgentRegistrationStatus(params: {
  currentStatus: InboxAgentRegistrationStatus;
  changed: boolean;
}): InboxAgentRegistrationStatus {
  const stableStatuses: InboxAgentRegistrationStatus[] = [
    InboxAgentRegistrationStatus.Pending,
    InboxAgentRegistrationStatus.Verified,
    InboxAgentRegistrationStatus.Invalid,
  ];

  if (!params.changed && stableStatuses.includes(params.currentStatus)) {
    return params.currentStatus;
  }

  return InboxAgentRegistrationStatus.Pending;
}
