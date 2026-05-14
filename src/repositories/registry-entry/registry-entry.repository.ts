import { prisma } from '@/utils/db';
import { Network, PaymentType, Status } from '@prisma/client';

type RegistryEntryQueryParams = {
  capability:
    | { name: string | undefined; version: string | undefined }
    | undefined;
  allowedPaymentTypes: PaymentType[] | undefined;
  allowedStatuses: Status[];
  policyId: string | undefined;
  assetIdentifier: string | undefined;
  tags: string[] | undefined;
  cursorId: string | undefined;
  limit: number;
  network: Network;
  searchQuery?: string;
};

function buildRegistryEntryWhere(params: RegistryEntryQueryParams) {
  return {
    Capability: params.capability,
    paymentType: params.allowedPaymentTypes
      ? { in: params.allowedPaymentTypes }
      : undefined,
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

async function findRegistryEntries(params: RegistryEntryQueryParams) {
  const networkExists = await prisma.registrySource.findFirst({
    where: {
      network: params.network,
    },
  });
  if (!networkExists) {
    throw new Error('Network not found');
  }

  return await prisma.registryEntry.findMany({
    where: buildRegistryEntryWhere(params),
    include: {
      Capability: true,
      RegistrySource: true,
      AgentPricing: {
        include: { FixedPricing: { include: { Amounts: true } } },
      },
      ExampleOutput: true,
    },
    orderBy: [
      {
        id: 'desc',
      },
    ],
    cursor: params.cursorId ? { id: params.cursorId } : undefined,
    //over-fetching to account for health check failures
    take: params.limit,
  });
}

async function getRegistryEntry(params: RegistryEntryQueryParams) {
  return findRegistryEntries(params);
}

async function searchRegistryEntries(params: RegistryEntryQueryParams) {
  return findRegistryEntries(params);
}

async function getRegistryDiffEntries(
  statusUpdatedAfter: Date,
  cursorId: string | undefined,
  limit: number,
  network: Network,
  policyId?: string
) {
  const networkExists = await prisma.registrySource.findFirst({
    where: {
      network: network,
    },
  });
  if (!networkExists) {
    throw new Error('Network not found');
  }

  return await prisma.registryEntry.findMany({
    where: {
      OR: [
        {
          statusUpdatedAt: {
            gt: statusUpdatedAfter,
          },
        },
        {
          id: cursorId ? { gte: cursorId } : undefined,
          statusUpdatedAt: statusUpdatedAfter,
        },
      ],
      RegistrySource: {
        network: network,
        policyId: policyId ?? undefined,
      },
    },
    include: {
      Capability: true,
      RegistrySource: true,
      AgentPricing: {
        include: { FixedPricing: { include: { Amounts: true } } },
      },
      ExampleOutput: true,
    },
    orderBy: [
      {
        statusUpdatedAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    take: limit,
  });
}

export const registryEntryRepository = {
  getRegistryEntry,
  searchRegistryEntries,
  getRegistryDiffEntries,
};
