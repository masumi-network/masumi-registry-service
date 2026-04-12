import { inboxAgentRegistrationDiffSchemaInput } from '@/routes/api/inbox-agent-registration';
import { prisma } from '@/utils/db';
import { InboxAgentRegistrationStatus, Network } from '@prisma/client';
import { z } from '@/utils/zod-openapi';

async function getInboxAgentRegistrations(params: {
  agentSlug?: string;
  allowedStatuses: InboxAgentRegistrationStatus[];
  policyId?: string;
  cursorId?: string;
  limit: number;
  network: Network;
}) {
  const networkExists = await prisma.registrySource.findFirst({
    where: {
      network: params.network,
    },
  });
  if (!networkExists) {
    throw new Error('Network not found');
  }

  return prisma.inboxAgentRegistration.findMany({
    where: {
      agentSlug: params.agentSlug,
      status: { in: params.allowedStatuses },
      RegistrySource: {
        network: params.network,
        policyId: params.policyId,
      },
    },
    include: {
      RegistrySource: true,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    cursor: params.cursorId ? { id: params.cursorId } : undefined,
    take: params.limit,
  });
}

async function getInboxAgentRegistrationDiffEntries(
  input: z.infer<typeof inboxAgentRegistrationDiffSchemaInput>
) {
  const networkExists = await prisma.registrySource.findFirst({
    where: {
      network: input.network,
    },
  });
  if (!networkExists) {
    throw new Error('Network not found');
  }

  return prisma.inboxAgentRegistration.findMany({
    where: {
      OR: [
        {
          statusUpdatedAt: {
            gt: input.statusUpdatedAfter,
          },
        },
        {
          id: input.cursorId ? { gte: input.cursorId } : undefined,
          statusUpdatedAt: input.statusUpdatedAfter,
        },
      ],
      status: input.status?.length ? { in: input.status } : undefined,
      agentSlug: input.agentSlug,
      RegistrySource: {
        network: input.network,
        policyId: input.policyId,
      },
    },
    include: {
      RegistrySource: true,
    },
    orderBy: [
      {
        statusUpdatedAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    take: input.limit,
  });
}

export const inboxAgentRegistrationRepository = {
  getInboxAgentRegistrations,
  getInboxAgentRegistrationDiffEntries,
};
