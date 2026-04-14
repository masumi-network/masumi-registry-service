import { inboxAgentRegistrationRepository } from '@/repositories/inbox-agent-registration';
import {
  queryInboxAgentRegistrationSchemaInput,
  inboxAgentRegistrationDiffSchemaInput,
  searchInboxAgentRegistrationSchemaInput,
} from '@/routes/api/inbox-agent-registration';
import { cardanoRegistryService } from '@/services/cardano-registry';
import { normalizeInboxSlug } from '@/utils/inbox-slug';
import { InboxAgentRegistrationStatus } from '@prisma/client';
import { z } from '@/utils/zod-openapi';

const INVALID_AGENT_SLUG_FILTER = '__invalid__';

function normalizeAgentSlugFilter(
  agentSlug: string | undefined
): string | undefined {
  if (!agentSlug) return undefined;
  const normalized = normalizeInboxSlug(agentSlug);
  return normalized || INVALID_AGENT_SLUG_FILTER;
}

function getAllowedQueryStatuses(
  filter: z.infer<typeof queryInboxAgentRegistrationSchemaInput>['filter']
): InboxAgentRegistrationStatus[] {
  if (filter?.status?.length) {
    return filter.status;
  }

  return [
    InboxAgentRegistrationStatus.Pending,
    InboxAgentRegistrationStatus.Verified,
  ];
}

async function getInboxAgentRegistrations(
  input: z.infer<typeof queryInboxAgentRegistrationSchemaInput>
) {
  await cardanoRegistryService.updateLatestCardanoRegistryEntries();

  return inboxAgentRegistrationRepository.getInboxAgentRegistrations({
    agentSlug: normalizeAgentSlugFilter(input.filter?.agentSlug),
    allowedStatuses: getAllowedQueryStatuses(input.filter),
    policyId: input.filter?.policyId,
    cursorId: input.cursorId,
    limit: input.limit,
    network: input.network,
  });
}

async function searchInboxAgentRegistrations(
  input: z.infer<typeof searchInboxAgentRegistrationSchemaInput>
) {
  await cardanoRegistryService.updateLatestCardanoRegistryEntries();
  const normalizedSlugQuery = normalizeInboxSlug(input.query) || input.query;

  return inboxAgentRegistrationRepository.searchInboxAgentRegistrations({
    nameQuery: input.query,
    agentSlugQuery: normalizedSlugQuery,
    linkedEmailQuery: input.query,
    allowedStatuses: getAllowedQueryStatuses(input.filter),
    policyId: input.filter?.policyId,
    cursorId: input.cursorId,
    limit: input.limit,
    network: input.network,
  });
}

async function getInboxAgentRegistrationDiffEntries(
  input: z.infer<typeof inboxAgentRegistrationDiffSchemaInput>
) {
  return inboxAgentRegistrationRepository.getInboxAgentRegistrationDiffEntries({
    ...input,
    agentSlug: normalizeAgentSlugFilter(input.agentSlug),
  });
}

export const inboxAgentRegistrationService = {
  getInboxAgentRegistrations,
  searchInboxAgentRegistrations,
  getInboxAgentRegistrationDiffEntries,
};
