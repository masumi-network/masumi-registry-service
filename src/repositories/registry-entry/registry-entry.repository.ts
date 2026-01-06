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
  skip: number,
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
      statusUpdatedAt: {
        gte: statusUpdatedAfter,
      },
      RegistrySource: {
        network: network,
      },
    },
    include: {
      Capability: true,
      RegistrySource: true,
      AgentPricing: {
        include: { FixedPricing: { include: { Amounts: true } } },
      },
    },
    orderBy: [
      {
        statusUpdatedAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    skip: skip,
    take: limit,
  });
}

export const registryEntryRepository = {
  getRegistryEntry,
  getRegistryDiffEntries,
};
