import { prisma } from '@/utils/db';
import { $Enums, Network, Prisma } from '@prisma/client';

export interface X402ProbeRecord {
  resource: string;
  outcome: $Enums.X402ProbeOutcome;
  httpStatus: number | null;
  x402Version: number | null;
  accepts: Prisma.InputJsonValue | null;
  matchesRegisteredSources: boolean | null;
  mismatches: string[];
  reason: string | null;
  checkedAt: Date;
}

const sourceSelect = {
  chain: true,
  network: true,
  scheme: true,
  payTo: true,
  resource: true,
  dynamicAsset: true,
  Pricing: {
    select: {
      pricingType: true,
      FixedPricing: {
        select: { Amounts: { select: { unit: true, amount: true } } },
      },
    },
  },
} satisfies Prisma.SupportedPaymentSourceSelect;

// Entries whose manifest was last proven valid: only those have resources worth
// probing. The cached manifest is selected too, so the job never fetches it.
// Keyset pagination (id > afterId), so a row deleted between pages cannot end
// the walk early.
async function listProbeableEntries(params: {
  afterId?: string;
  take: number;
}) {
  return prisma.registryEntry.findMany({
    where: {
      type: $Enums.RegistryEntryType.X402,
      status: $Enums.Status.Online,
      ...(params.afterId != null ? { id: { gt: params.afterId } } : {}),
    },
    select: { id: true, spec: true },
    orderBy: { id: 'asc' },
    take: params.take,
  });
}

async function getProbeTimes(entryIds: string[]) {
  return prisma.x402ResourceProbe.findMany({
    where: { registryEntryId: { in: entryIds } },
    select: { registryEntryId: true, resource: true, checkedAt: true },
  });
}

async function getEntriesWithSources(entryIds: string[]) {
  return prisma.registryEntry.findMany({
    where: { id: { in: entryIds } },
    select: {
      id: true,
      SupportedPaymentSources: {
        select: sourceSelect,
        orderBy: { sourceIndex: 'asc' },
      },
    },
  });
}

async function deleteProbes(registryEntryId: string, resources: string[]) {
  return prisma.x402ResourceProbe.deleteMany({
    where: { registryEntryId, resource: { in: resources } },
  });
}

async function saveProbe(registryEntryId: string, record: X402ProbeRecord) {
  const { accepts, ...rest } = record;
  const data = {
    ...rest,
    accepts: accepts ?? Prisma.JsonNull,
  };
  return prisma.x402ResourceProbe.upsert({
    where: {
      registryEntryId_resource: {
        registryEntryId,
        resource: record.resource,
      },
    },
    create: { ...data, registryEntryId },
    update: data,
  });
}

// Lean projection for the probe endpoint, mirroring the spec endpoint's lookup.
async function getProbesByIdentifier(params: {
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
      X402ResourceProbes: {
        orderBy: { resource: 'asc' },
        select: {
          resource: true,
          outcome: true,
          httpStatus: true,
          x402Version: true,
          accepts: true,
          matchesRegisteredSources: true,
          mismatches: true,
          reason: true,
          checkedAt: true,
        },
      },
    },
  });
}

export const x402ProbeRepository = {
  listProbeableEntries,
  getProbeTimes,
  getEntriesWithSources,
  deleteProbes,
  saveProbe,
  getProbesByIdentifier,
};
