import { prisma } from '@/utils/db';
import { Network, Prisma, SimpleApiStatus } from '@prisma/client';
import type { X402PaymentRequirement } from '@/utils/x402-validator';

type CreateSimpleApiListingParams = {
  network: Network;
  name: string;
  description?: string | null;
  url: string;
  urlHash: string;
  category?: string | null;
  tags: string[];
  accepts: X402PaymentRequirement[];
  httpMethod?: string | null;
  extra?: Record<string, unknown> | null;
  submittedByApiKeyId?: string | null;
};

type SimpleApiListingQueryParams = {
  network: Network;
  status?: SimpleApiStatus[];
  category?: string | null;
  tags?: string[];
  cursorId?: string;
  limit: number;
};

async function createSimpleApiListing(params: CreateSimpleApiListingParams) {
  const first = params.accepts[0];
  return prisma.simpleApiListing.create({
    data: {
      network: params.network,
      name: params.name,
      description: params.description ?? null,
      url: params.url,
      urlHash: params.urlHash,
      category: params.category ?? null,
      tags: params.tags,
      // Scalar columns from the first accepted requirement
      scheme: first?.scheme ?? null,
      x402Network: first?.network ?? null,
      maxAmountRequired: first?.maxAmountRequired
        ? BigInt(first.maxAmountRequired)
        : null,
      payTo: first?.payTo ?? null,
      asset: first?.asset ?? null,
      resource: first?.resource ?? null,
      mimeType: first?.mimeType ?? null,
      httpMethod: params.httpMethod ?? null,
      rawAccepts: params.accepts as unknown as Prisma.InputJsonValue,
      extra:
        params.extra != null
          ? (params.extra as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      status: SimpleApiStatus.Online,
      statusUpdatedAt: new Date(),
      lastActiveAt: new Date(),
      submittedByApiKeyId: params.submittedByApiKeyId ?? null,
    },
  });
}

async function findSimpleApiListingByUrlHash(urlHash: string) {
  return prisma.simpleApiListing.findUnique({ where: { urlHash } });
}

async function getSimpleApiListings(params: SimpleApiListingQueryParams) {
  const allowedStatuses =
    params.status && params.status.length > 0
      ? params.status
      : [SimpleApiStatus.Online];

  return prisma.simpleApiListing.findMany({
    where: {
      network: params.network,
      status: { in: allowedStatuses },
      category: params.category ?? undefined,
      tags: params.tags ? { hasSome: params.tags } : undefined,
    },
    orderBy: [{ statusUpdatedAt: 'desc' }, { id: 'desc' }],
    cursor: params.cursorId ? { id: params.cursorId } : undefined,
    take: params.limit,
  });
}

async function searchSimpleApiListings(
  params: SimpleApiListingQueryParams & { searchQuery: string }
) {
  const allowedStatuses =
    params.status && params.status.length > 0
      ? params.status
      : [SimpleApiStatus.Online];

  return prisma.simpleApiListing.findMany({
    where: {
      network: params.network,
      status: { in: allowedStatuses },
      category: params.category ?? undefined,
      tags: params.tags ? { hasSome: params.tags } : undefined,
      OR: [
        { name: { contains: params.searchQuery, mode: 'insensitive' } },
        {
          description: {
            contains: params.searchQuery,
            mode: 'insensitive',
          },
        },
        {
          category: { contains: params.searchQuery, mode: 'insensitive' },
        },
        { url: { contains: params.searchQuery, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ statusUpdatedAt: 'desc' }, { id: 'desc' }],
    cursor: params.cursorId ? { id: params.cursorId } : undefined,
    take: params.limit,
  });
}

async function getSimpleApiListingDiffEntries(
  statusUpdatedAfter: Date,
  cursorId: string | undefined,
  limit: number,
  network: Network
) {
  return prisma.simpleApiListing.findMany({
    where: {
      network,
      statusUpdatedAt: { gt: statusUpdatedAfter },
    },
    orderBy: [{ statusUpdatedAt: 'asc' }, { id: 'asc' }],
    cursor: cursorId ? { id: cursorId } : undefined,
    take: limit,
  });
}

async function updateSimpleApiListingStatus(params: {
  id: string;
  status: SimpleApiStatus;
  lastActiveAt?: Date | null;
  lastValidationError?: string | null;
  accepts?: X402PaymentRequirement[];
}) {
  const first = params.accepts?.[0];
  return prisma.simpleApiListing.update({
    where: { id: params.id },
    data: {
      status: params.status,
      statusUpdatedAt: new Date(),
      lastActiveAt:
        params.lastActiveAt !== undefined
          ? params.lastActiveAt
          : params.status === SimpleApiStatus.Online
            ? new Date()
            : undefined,
      lastValidationError: params.lastValidationError ?? null,
      ...(first && {
        scheme: first.scheme,
        x402Network: first.network,
        maxAmountRequired: BigInt(first.maxAmountRequired),
        payTo: first.payTo,
        asset: first.asset,
        resource: first.resource,
        mimeType: first.mimeType ?? null,
        rawAccepts: params.accepts as unknown as Prisma.InputJsonValue,
      }),
    },
  });
}

async function updateSimpleApiListingMeta(params: {
  id: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}) {
  return prisma.simpleApiListing.update({
    where: { id: params.id },
    data: {
      name: params.name,
      description: params.description,
      category: params.category,
      tags: params.tags,
    },
  });
}

async function deregisterSimpleApiListing(id: string) {
  return prisma.simpleApiListing.update({
    where: { id },
    data: {
      status: SimpleApiStatus.Deregistered,
      statusUpdatedAt: new Date(),
    },
  });
}

async function getSimpleApiListingsForHealthCheck(params: {
  network: Network;
  limit: number;
  beforeLastActiveAt: Date;
}) {
  return prisma.simpleApiListing.findMany({
    where: {
      network: params.network,
      status: {
        in: [
          SimpleApiStatus.Online,
          SimpleApiStatus.Offline,
          SimpleApiStatus.Invalid,
        ],
      },
      OR: [
        { lastActiveAt: null },
        { lastActiveAt: { lt: params.beforeLastActiveAt } },
      ],
    },
    orderBy: [{ lastActiveAt: 'asc' }, { id: 'asc' }],
    take: params.limit,
  });
}

export const simpleApiListingRepository = {
  createSimpleApiListing,
  findSimpleApiListingByUrlHash,
  getSimpleApiListings,
  searchSimpleApiListings,
  getSimpleApiListingDiffEntries,
  updateSimpleApiListingStatus,
  updateSimpleApiListingMeta,
  deregisterSimpleApiListing,
  getSimpleApiListingsForHealthCheck,
};
