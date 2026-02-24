import { prisma } from '@/utils/db';
import { Network, PaymentType, Status } from '@prisma/client';

async function getRegistryEntry(
  capability:
    | { name: string | undefined; version: string | undefined }
    | undefined,
  allowedPaymentTypes: PaymentType[] | undefined,
  allowedStatuses: Status[],
  currentRegistryPolicyId: string | undefined,
  currentAssetIdentifier: string | undefined,
  tags: string[] | undefined,
  currentCursorId: string | undefined,
  limit: number,
  network: Network
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
      Capability: capability,
      paymentType: allowedPaymentTypes
        ? { in: allowedPaymentTypes }
        : undefined,
      status: { in: allowedStatuses },
      assetIdentifier: currentAssetIdentifier,
      RegistrySource: {
        policyId: currentRegistryPolicyId,
        network: network,
      },
      tags: tags ? { hasSome: tags } : undefined,
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
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    cursor: currentCursorId ? { id: currentCursorId } : undefined,
    //over-fetching to account for health check failures
    take: limit,
  });
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
  getRegistryDiffEntries,
};
