import { prisma } from '@/utils/db';
import { Network, Status } from '@prisma/client';

type A2ARegistryEntryQueryParams = {
  allowedStatuses: Status[];
  policyId: string | undefined;
  assetIdentifier: string | undefined;
  tags: string[] | undefined;
  cursorId: string | undefined;
  limit: number;
  network: Network;
  searchQuery?: string;
};

function buildA2ARegistryEntryWhere(params: A2ARegistryEntryQueryParams) {
  return {
    status: { in: params.allowedStatuses },
    assetIdentifier: params.assetIdentifier,
    RegistrySource: {
      policyId: params.policyId,
      network: params.network,
    },
    tags: params.tags ? { hasSome: params.tags } : undefined,
    searchText: params.searchQuery
      ? { contains: params.searchQuery }
      : undefined,
  };
}

async function findA2ARegistryEntries(params: A2ARegistryEntryQueryParams) {
  const networkExists = await prisma.registrySource.findFirst({
    where: { network: params.network },
  });
  if (!networkExists) {
    throw new Error('Network not found');
  }

  return prisma.a2ARegistryEntry.findMany({
    where: buildA2ARegistryEntryWhere(params),
    include: {
      RegistrySource: true,
      A2ASkills: true,
      A2ASupportedInterfaces: true,
      A2ACapabilities: true,
    },
    orderBy: [{ id: 'desc' }],
    cursor: params.cursorId ? { id: params.cursorId } : undefined,
    take: params.limit,
  });
}

async function getA2ARegistryEntries(params: A2ARegistryEntryQueryParams) {
  return findA2ARegistryEntries(params);
}

async function searchA2ARegistryEntries(params: A2ARegistryEntryQueryParams) {
  return findA2ARegistryEntries(params);
}

async function getA2ARegistryDiffEntries(
  statusUpdatedAfter: Date,
  cursorId: string | undefined,
  limit: number,
  network: Network,
  policyId?: string
) {
  const networkExists = await prisma.registrySource.findFirst({
    where: { network },
  });
  if (!networkExists) {
    throw new Error('Network not found');
  }

  return prisma.a2ARegistryEntry.findMany({
    where: {
      OR: [
        {
          statusUpdatedAt: { gt: statusUpdatedAfter },
        },
        {
          id: cursorId ? { gte: cursorId } : undefined,
          statusUpdatedAt: statusUpdatedAfter,
        },
      ],
      RegistrySource: {
        network,
        policyId: policyId ?? undefined,
      },
    },
    include: {
      RegistrySource: true,
      A2ASkills: true,
      A2ASupportedInterfaces: true,
      A2ACapabilities: true,
    },
    orderBy: [{ statusUpdatedAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });
}

export const a2aRegistryEntryRepository = {
  getA2ARegistryEntries,
  searchA2ARegistryEntries,
  getA2ARegistryDiffEntries,
};
