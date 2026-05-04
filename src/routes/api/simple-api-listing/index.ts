import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { z } from '@/utils/zod-openapi';
import { simpleApiListingService } from '@/services/simple-api-listing';
import { tokenCreditService } from '@/services/token-credit';
import {
  createSimpleApiListingSchemaInput,
  createSimpleApiListingSchemaOutput,
  querySimpleApiListingSchemaInput,
  querySimpleApiListingSchemaOutput,
  searchSimpleApiListingSchemaInput,
  diffSimpleApiListingSchemaInput,
  updateSimpleApiListingSchemaInput,
  updateSimpleApiListingSchemaOutput,
  deleteSimpleApiListingSchemaInput,
  deleteSimpleApiListingSchemaOutput,
  serializeSimpleApiListing,
  serializeSimpleApiListings,
} from './schemas';

export * from './schemas';

type AuthOptions = {
  id: string;
  accumulatedUsageCredits: number;
  maxUsageCredits: number | null;
  usageLimited: boolean;
};

// ---------------------------------------------------------------------------
// POST /api/v1/simple-api-listing — register a new listing
// ---------------------------------------------------------------------------

export const createSimpleApiListingPost = authenticatedEndpointFactory.build<
  typeof createSimpleApiListingSchemaOutput,
  typeof createSimpleApiListingSchemaInput
>({
  method: 'post',
  input: createSimpleApiListingSchemaInput,
  output: createSimpleApiListingSchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof createSimpleApiListingSchemaInput>;
    options: AuthOptions;
  }) => {
    await tokenCreditService.handleTokenCredits(
      options,
      0,
      'submit simple-api-listing: ' + input.url
    );
    const listing = await simpleApiListingService.submitSimpleApiListing(
      input,
      options.id
    );
    return createSimpleApiListingSchemaOutput.parse({
      listing: serializeSimpleApiListing(listing),
    });
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/simple-api-listing-query — paginated list
// ---------------------------------------------------------------------------

export const querySimpleApiListingPost = authenticatedEndpointFactory.build<
  typeof querySimpleApiListingSchemaOutput,
  typeof querySimpleApiListingSchemaInput
>({
  method: 'post',
  input: querySimpleApiListingSchemaInput,
  output: querySimpleApiListingSchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof querySimpleApiListingSchemaInput>;
    options: AuthOptions;
  }) => {
    await tokenCreditService.handleTokenCredits(
      options,
      0,
      'query simple-api-listings'
    );
    const data = await simpleApiListingService.getSimpleApiListings(input);
    return querySimpleApiListingSchemaOutput.parse({
      listings: serializeSimpleApiListings(data),
    });
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/simple-api-listing-search — full-text search
// ---------------------------------------------------------------------------

export const searchSimpleApiListingPost = authenticatedEndpointFactory.build<
  typeof querySimpleApiListingSchemaOutput,
  typeof searchSimpleApiListingSchemaInput
>({
  method: 'post',
  input: searchSimpleApiListingSchemaInput,
  output: querySimpleApiListingSchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof searchSimpleApiListingSchemaInput>;
    options: AuthOptions;
  }) => {
    await tokenCreditService.handleTokenCredits(
      options,
      0,
      'search simple-api-listings: ' + input.query
    );
    const data = await simpleApiListingService.searchSimpleApiListings(input);
    return querySimpleApiListingSchemaOutput.parse({
      listings: serializeSimpleApiListings(data),
    });
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/simple-api-listing-diff — status diff for sync consumers
// ---------------------------------------------------------------------------

export const diffSimpleApiListingPost = authenticatedEndpointFactory.build<
  typeof querySimpleApiListingSchemaOutput,
  typeof diffSimpleApiListingSchemaInput
>({
  method: 'post',
  input: diffSimpleApiListingSchemaInput,
  output: querySimpleApiListingSchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof diffSimpleApiListingSchemaInput>;
    options: AuthOptions;
  }) => {
    await tokenCreditService.handleTokenCredits(
      options,
      0,
      'diff simple-api-listings'
    );
    const data = await simpleApiListingService.getSimpleApiListingDiff({
      network: input.network,
      statusUpdatedAfter: input.statusUpdatedAfter,
      cursorId: input.cursorId,
      limit: input.limit,
    });
    return querySimpleApiListingSchemaOutput.parse({
      listings: serializeSimpleApiListings(data),
    });
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/simple-api-listing — admin: update metadata
// ---------------------------------------------------------------------------

export const updateSimpleApiListingPatch =
  adminAuthenticatedEndpointFactory.build({
    method: 'patch',
    input: updateSimpleApiListingSchemaInput,
    output: updateSimpleApiListingSchemaOutput,
    handler: async ({
      input,
    }: {
      input: z.infer<typeof updateSimpleApiListingSchemaInput>;
    }) => {
      const listing =
        await simpleApiListingService.updateSimpleApiListing(input);
      return updateSimpleApiListingSchemaOutput.parse({
        listing: serializeSimpleApiListing(listing),
      });
    },
  });

// ---------------------------------------------------------------------------
// DELETE /api/v1/simple-api-listing — admin: deregister
// ---------------------------------------------------------------------------

export const deleteSimpleApiListingDelete =
  adminAuthenticatedEndpointFactory.build({
    method: 'delete',
    input: deleteSimpleApiListingSchemaInput,
    output: deleteSimpleApiListingSchemaOutput,
    handler: async ({
      input,
    }: {
      input: z.infer<typeof deleteSimpleApiListingSchemaInput>;
    }) => {
      await simpleApiListingService.deregisterSimpleApiListing(input.id);
      return deleteSimpleApiListingSchemaOutput.parse({ id: input.id });
    },
  });
