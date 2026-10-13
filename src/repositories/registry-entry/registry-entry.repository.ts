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
      SupportedPaymentSources: {
        include: {
          Pricing: {
            include: { FixedPricing: { include: { Amounts: true } } },
          },
        },
        orderBy: { sourceIndex: 'asc' },
      },
      Verifications: true,
      A2A: true,
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

async function getRegistryEntryByIdentifier(params: {
  agentIdentifier: string;
  network: Network;
}) {
  return prisma.registryEntry.findFirst({
    where: {
      assetIdentifier: params.agentIdentifier,
      RegistrySource: {
        network: params.network,
      },
    },
    include: {
      Capability: true,
      RegistrySource: true,
      AgentPricing: {
        include: { FixedPricing: { include: { Amounts: true } } },
      },
      ExampleOutput: true,
      SupportedPaymentSources: {
        include: {
          Pricing: {
            include: { FixedPricing: { include: { Amounts: true } } },
          },
        },
        orderBy: { sourceIndex: 'asc' },
      },
      Verifications: true,
      A2A: true,
    },
  });
}

// Returns the assetIdentifiers of every stored registry entry whose
// version-root matches one of the given roots (an exact-prefix match, since the
// root is the assetIdentifier minus its 3-byte version postfix), scoped to a
// network. Used to derive supersedes/supersededBy links and to resolve an
// identifier to its latest version. The unique index on assetIdentifier makes
// each startsWith an index-backed prefix scan.
async function findVersionSiblingAssetIdentifiers(params: {
  roots: string[];
  network: Network;
}): Promise<string[]> {
  if (params.roots.length === 0) {
    return [];
  }
  const rows = await prisma.registryEntry.findMany({
    where: {
      OR: params.roots.map((root) => ({
        assetIdentifier: { startsWith: root },
      })),
      RegistrySource: { network: params.network },
    },
    select: { assetIdentifier: true },
  });
  return rows.map((row) => row.assetIdentifier);
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
      SupportedPaymentSources: {
        include: {
          Pricing: {
            include: { FixedPricing: { include: { Amounts: true } } },
          },
        },
        orderBy: { sourceIndex: 'asc' },
      },
      Verifications: true,
      A2A: true,
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

// Lean projection for the spec endpoint: just the cached snapshot + status, not
// the heavy relation graph getRegistryEntryByIdentifier pulls.
async function getRegistryEntrySpecByIdentifier(params: {
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
      spec: true,
      specValidatedAt: true,
    },
  });
}

export const registryEntryRepository = {
  getRegistryEntry,
  searchRegistryEntries,
  getRegistryEntryByIdentifier,
  getRegistryEntrySpecByIdentifier,
  findVersionSiblingAssetIdentifiers,
  getRegistryDiffEntries,
};
