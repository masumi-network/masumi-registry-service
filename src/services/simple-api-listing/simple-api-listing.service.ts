import { Network, SimpleApiStatus } from '@prisma/client';
import createHttpError from 'http-errors';
import { simpleApiListingRepository } from '@/repositories/simple-api-listing';
import { validateX402Url, computeUrlHash } from '@/utils/x402-validator';
import { logger } from '@/utils/logger';
import { z } from '@/utils/zod-openapi';
import {
  createSimpleApiListingSchemaInput,
  querySimpleApiListingSchemaInput,
  searchSimpleApiListingSchemaInput,
  updateSimpleApiListingSchemaInput,
} from '@/routes/api/simple-api-listing/schemas';

async function submitSimpleApiListing(
  input: z.infer<typeof createSimpleApiListingSchemaInput>,
  submittedByApiKeyId: string
) {
  const { url, network, name, description, category, tags } = input;

  const urlHash = computeUrlHash(url);

  const existing =
    await simpleApiListingRepository.findSimpleApiListingByUrlHash(urlHash);
  if (existing) {
    if (existing.status !== SimpleApiStatus.Deregistered) {
      throw createHttpError(
        409,
        'A listing for this URL already exists in this registry'
      );
    }
    // Allow re-registration of a deregistered listing
    logger.info('Re-registering previously deregistered Simple API listing', {
      id: existing.id,
      url,
    });
  }

  const validation = await validateX402Url(url);
  if (validation.outcome === 'failure') {
    throw createHttpError(422, `URL validation failed: ${validation.reason}`);
  }

  logger.info('Simple API listing validated', {
    url,
    source: validation.source,
    acceptsCount: validation.accepts.length,
  });

  if (existing && existing.status === SimpleApiStatus.Deregistered) {
    // Update both payment metadata and user-supplied fields on re-registration
    await simpleApiListingRepository.updateSimpleApiListingMeta({
      id: existing.id,
      name,
      description,
      category,
      tags: tags ?? [],
    });
    return simpleApiListingRepository.updateSimpleApiListingStatus({
      id: existing.id,
      status: SimpleApiStatus.Online,
      lastActiveAt: new Date(),
      accepts: validation.accepts,
    });
  }

  return simpleApiListingRepository.createSimpleApiListing({
    network,
    name,
    description,
    url,
    urlHash,
    category,
    tags: tags ?? [],
    accepts: validation.accepts,
    httpMethod: validation.httpMethod,
    extra: validation.extra,
    submittedByApiKeyId,
  });
}

async function getSimpleApiListings(
  input: z.infer<typeof querySimpleApiListingSchemaInput>
) {
  return simpleApiListingRepository.getSimpleApiListings({
    network: input.network,
    status: input.filter?.status,
    category: input.filter?.category,
    tags: input.filter?.tags,
    cursorId: input.cursorId,
    limit: input.limit,
  });
}

async function searchSimpleApiListings(
  input: z.infer<typeof searchSimpleApiListingSchemaInput>
) {
  return simpleApiListingRepository.searchSimpleApiListings({
    network: input.network,
    status: input.filter?.status,
    category: input.filter?.category,
    tags: input.filter?.tags,
    cursorId: input.cursorId,
    limit: input.limit,
    searchQuery: input.query,
  });
}

async function getSimpleApiListingDiff(input: {
  network: Network;
  statusUpdatedAfter: Date;
  cursorId?: string;
  limit: number;
}) {
  return simpleApiListingRepository.getSimpleApiListingDiffEntries(
    input.statusUpdatedAfter,
    input.cursorId,
    input.limit,
    input.network
  );
}

async function updateSimpleApiListing(
  input: z.infer<typeof updateSimpleApiListingSchemaInput>
) {
  const { id, name, description, category, tags } = input;
  return simpleApiListingRepository.updateSimpleApiListingMeta({
    id,
    name,
    description,
    category,
    tags,
  });
}

async function deregisterSimpleApiListing(id: string) {
  return simpleApiListingRepository.deregisterSimpleApiListing(id);
}

export const simpleApiListingService = {
  submitSimpleApiListing,
  getSimpleApiListings,
  searchSimpleApiListings,
  getSimpleApiListingDiff,
  updateSimpleApiListing,
  deregisterSimpleApiListing,
};
