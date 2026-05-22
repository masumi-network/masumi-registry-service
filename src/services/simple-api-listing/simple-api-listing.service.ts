import { Network } from '@prisma/client';
import { simpleApiListingRepository } from '@/repositories/simple-api-listing';
import { z } from '@/utils/zod-openapi';
import {
  querySimpleApiListingSchemaInput,
  searchSimpleApiListingSchemaInput,
  updateSimpleApiListingSchemaInput,
} from '@/routes/api/simple-api-listing/schemas';

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
  getSimpleApiListings,
  searchSimpleApiListings,
  getSimpleApiListingDiff,
  updateSimpleApiListing,
  deregisterSimpleApiListing,
};
