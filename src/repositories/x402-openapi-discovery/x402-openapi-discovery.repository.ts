import { prisma } from '@/utils/db';
import { $Enums, Network, Prisma } from '@prisma/client';

export interface X402OpenApiDiscoveryRecord {
  origin: string;
  outcome: $Enums.X402OpenApiDiscoveryOutcome;
  specUrl: string | null;
  openApiVersion: string | null;
  title: string | null;
  spec: Prisma.InputJsonValue | null;
  reason: string | null;
  checkedAt: Date;
}

async function getDiscoveryTimes(entryIds: string[]) {
  return prisma.x402OpenApiDiscovery.findMany({
    where: { registryEntryId: { in: entryIds } },
    select: { registryEntryId: true, origin: true, checkedAt: true },
  });
}

async function deleteDiscoveries(registryEntryId: string, origins: string[]) {
  return prisma.x402OpenApiDiscovery.deleteMany({
    where: { registryEntryId, origin: { in: origins } },
  });
}

async function saveDiscovery(
  registryEntryId: string,
  record: X402OpenApiDiscoveryRecord
) {
  const { spec, ...rest } = record;
  const data = { ...rest, spec: spec ?? Prisma.JsonNull };
  return prisma.x402OpenApiDiscovery.upsert({
    where: {
      registryEntryId_origin: { registryEntryId, origin: record.origin },
    },
    create: { ...data, registryEntryId },
    update: data,
  });
}

// Lean projection for the discovery endpoint, mirroring the probe endpoint's.
async function getDiscoveriesByIdentifier(params: {
  agentIdentifier: string;
  network: Network;
}) {
  return prisma.registryEntry.findFirst({
    where: {
      assetIdentifier: params.agentIdentifier,
      RegistrySource: { network: params.network },
    },
    select: {
      type: true,
      status: true,
      X402OpenApiDiscoveries: {
        orderBy: { origin: 'asc' },
        select: {
          origin: true,
          outcome: true,
          specUrl: true,
          openApiVersion: true,
          title: true,
          spec: true,
          reason: true,
          checkedAt: true,
        },
      },
    },
  });
}

export const x402OpenApiDiscoveryRepository = {
  getDiscoveryTimes,
  deleteDiscoveries,
  saveDiscovery,
  getDiscoveriesByIdentifier,
};
