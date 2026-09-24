import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  queryRegistrySchemaInput,
  queryRegistrySchemaOutput,
  refreshRegistryEntrySchemaInput,
  refreshRegistryEntrySchemaOutput,
  registryDiffSchemaInput,
  searchRegistrySchemaInput,
} from '@/routes/api/registry-entry/schemas';
import {
  capabilitySchemaInput,
  capabilitySchemaOutput,
} from '@/routes/api/capability';
import {
  queryPaymentInformationInput,
  queryPaymentInformationSchemaOutput,
} from '@/routes/api/payment-information';
import { PaymentType, Status, PricingType } from '@prisma/client';

export function registerRegistryEntryPaths(
  registry: OpenAPIRegistry,
  apiKeyAuthName: string
) {
  const registryEntriesResponseExample = {
    data: {
      entries: [
        {
          id: 'unique_cuid_v2',
          name: 'Example API',
          createdAt: new Date(0),
          updatedAt: new Date(120000),
          description: 'Example API description',
          status: Status.Online,
          statusUpdatedAt: new Date(120000),
          authorName: null,
          authorContactEmail: null,
          authorContactOther: null,
          image: 'testimage.de',
          otherLegal: null,
          privacyPolicy: null,
          tags: [],
          termsAndCondition: 'If the answer is 42 what was the question',
          uptimeCheckCount: 10,
          uptimeCount: 8,
          lastUptimeCheck: new Date(0),
          apiBaseUrl: 'https://example.com/api/',
          authorOrganization: 'MASUMI',
          paymentType: PaymentType.Web3CardanoV1,
          agentIdentifier:
            '222222222222222222222222222222222222222222222222222222222222222222',

          RegistrySource: {
            id: 'unique_cuid_v2',
            policyId: 'policy_id',
            url: 'https://example.com/api/',
          },
          Capability: {
            name: 'Example Capability',
            version: '1.0.0',
          },
          AgentPricing: {
            pricingType: PricingType.Fixed,
            FixedPricing: {
              Amounts: [{ amount: '100', unit: 'USDC' }],
            },
          },
          ExampleOutput: [
            {
              name: 'Example Output',
              mimeType: 'image/png',
              url: 'https://example.com/image.png',
            },
          ],
          metadataVersion: 1,
        },
      ],
    },
    status: 'success',
  };

  registry.registerPath({
    method: 'get',
    path: '/payment-information/',
    description: 'Get payment information for a registry entry',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['payment-information'],
    request: {
      query: queryPaymentInformationInput.openapi({
        example: {
          agentIdentifier: 'agent_identifier',
        },
      }),
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Registry entries',
        content: {
          'application/json': {
            schema: z
              .object({
                data: queryPaymentInformationSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    createdAt: new Date(0),
                    updatedAt: new Date(120000),
                    metadataVersion: 1,
                    name: 'Example API',
                    description: 'Example Capability description',
                    status: 'Online',
                    RegistrySource: {
                      policyId:
                        '0000000000000000000000000000000000000000000000000000000000000000',
                      url: null,
                    },
                    Capability: {
                      name: 'Example Capability',
                      version: '1.0.0',
                    },
                    sellerWallet: {
                      address:
                        'addr1333333333333333333333333333333333333333333333333333333333333333',
                      vkey: 'sellerVKey',
                    },
                    AgentPricing: {
                      pricingType: 'Fixed',
                      FixedPricing: {
                        Amounts: [
                          { unit: 'USDC', amount: '100' },
                          { unit: 'USDM', amount: '15000' },
                        ],
                      },
                    },
                    authorContactEmail: null,
                    authorContactOther: null,
                    authorName: null,
                    apiBaseUrl: 'https://example.com/api/',
                    ExampleOutput: [
                      {
                        name: 'Example Output',
                        mimeType: 'image/png',
                        url: 'https://example.com/image.png',
                      },
                    ],
                    image: 'testimage.de',
                    otherLegal: null,
                    privacyPolicy: null,
                    tags: null,
                    termsAndCondition:
                      'If the answer is 42 what was the question',
                    uptimeCheckCount: 10,
                    uptimeCount: 8,
                    lastUptimeCheck: new Date(0),
                    authorOrganization: 'MASUMI',
                    paymentType: 'Web3CardanoV1',
                    agentIdentifier:
                      '222222222222222222222222222222222222222222222222222222222222222222',
                    id: 'unique_cuid_v2',
                  },
                  status: 'success',
                },
              }),
          },
        },
      },
      400: {
        description: 'Bad Request (possible parameters missing or invalid)',
      },
      401: {
        description: 'Unauthorized',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });

  /************************** Entries **************************/

  registry.registerPath({
    method: 'post',
    path: '/registry-entry/',
    description:
      'Query the registry for available and online (health-checked) entries. Registry filter, allows pagination, filtering by payment type and capability and optional date filters (to force update any entries checked before the specified date. Warning: this might take a bit of time as response is not cached). If no filter is set, only online entries are returned.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['registry-entry'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: queryRegistrySchemaInput.openapi({
              example: {
                limit: 10,
                cursorId: 'last_paginated_item',
                network: 'Preprod',
                filter: {
                  policyId: 'policy_id',
                  tags: ['tag1', 'tag2'],
                  assetIdentifier: 'asset_identifier',
                  paymentTypes: [PaymentType.Web3CardanoV1],
                  status: [Status.Online, Status.Offline],
                  capability: {
                    name: 'Example Capability',
                    version: 'Optional version',
                  },
                },
                minHealthCheckDate: new Date(0).toISOString(),
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Registry entries',
        content: {
          'application/json': {
            schema: z
              .object({ data: queryRegistrySchemaOutput, status: z.string() })
              .openapi({
                example: registryEntriesResponseExample,
              }),
          },
        },
      },
      400: {
        description: 'Bad Request (possible parameters missing or invalid)',
      },
      401: {
        description: 'Unauthorized',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/registry-entry-search/',
    description:
      'Fuzzy-search online (or explicitly filtered) registry entries by core metadata, capability, asset identifier, api base URL, and tags. Supports the same pagination, structured filters, and optional health-check refresh as the standard registry query endpoint.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['registry-entry'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: searchRegistrySchemaInput.openapi({
              example: {
                limit: 10,
                cursorId: 'last_paginated_item',
                network: 'Preprod',
                query: 'example capability',
                filter: {
                  policyId: 'policy_id',
                  tags: ['tag1', 'tag2'],
                  assetIdentifier: 'asset_identifier',
                  paymentTypes: [PaymentType.Web3CardanoV1],
                  status: [Status.Online, Status.Offline],
                  capability: {
                    name: 'Example Capability',
                    version: 'Optional version',
                  },
                },
                minHealthCheckDate: new Date(0).toISOString(),
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Registry entries matching the fuzzy search',
        content: {
          'application/json': {
            schema: z
              .object({ data: queryRegistrySchemaOutput, status: z.string() })
              .openapi({
                example: registryEntriesResponseExample,
              }),
          },
        },
      },
      400: {
        description: 'Bad Request (possible parameters missing or invalid)',
      },
      401: {
        description: 'Unauthorized',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/registry-entry-refresh/',
    description:
      'Refresh one registry entry by agent identifier. The service first syncs the blockchain cursor, then immediately re-runs the health check for the requested agent and returns the refreshed entry.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['registry-entry'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: refreshRegistryEntrySchemaInput.openapi({
              example: {
                network: 'Preprod',
                agentIdentifier:
                  '222222222222222222222222222222222222222222222222222222222222222222',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Refreshed registry entry',
        content: {
          'application/json': {
            schema: z
              .object({
                data: refreshRegistryEntrySchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    entry: registryEntriesResponseExample.data.entries[0],
                  },
                  status: 'success',
                },
              }),
          },
        },
      },
      400: {
        description: 'Bad Request (possible parameters missing or invalid)',
      },
      401: {
        description: 'Unauthorized',
      },
      404: {
        description: 'Registry entry not found',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/registry-diff/',
    description:
      'Query registry entries whose status was updated after the provided timestamp. Supports pagination. Always use statusUpdatedAt of the last item + its cursorId to paginate forward. This guarantees to include all items at least once, when paginating. Note: if the cursorId is not valid it will include all items with an id greater than the cursorId (in string comparison order). If no cursorId is provided, all items, including those with the same statusUpdatedAt, will be included. In case the statusUpdatedAt is before the provided statusUpdatedAfter, all items after the statusUpdatedAfter will be included, regardless of the cursorId.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['registry-entry'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: registryDiffSchemaInput.openapi({
              example: {
                limit: 10,
                cursorId: 'last_paginated_item',
                network: 'Preprod',
                statusUpdatedAfter: new Date(0).toISOString(),
                policyId:
                  '7e8bdaf2b2b919a3a4b94002cafb50086c0c845fe535d07a77ab7f77',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Registry entries with updated status',
        content: {
          'application/json': {
            schema: z
              .object({ data: queryRegistrySchemaOutput, status: z.string() })
              .openapi({
                example: registryEntriesResponseExample,
              }),
          },
        },
      },
      400: {
        description: 'Bad Request (possible parameters missing or invalid)',
      },
      401: {
        description: 'Unauthorized',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/capability/',
    description: 'Gets all capabilities that are currently online',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['capability'],
    request: {
      query: capabilitySchemaInput.openapi({
        example: {
          limit: 10,
          cursorId: 'last_paginated_item',
        },
      }),
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Registry entries',
        content: {
          'application/json': {
            schema: z
              .object({ data: capabilitySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    capabilities: [
                      {
                        id: 'unique-cuid-v2-auto-generated',
                        name: 'Example Capability',
                        version: '1.0.0',
                      },
                    ],
                  },
                  status: 'success',
                },
              }),
          },
        },
      },
      400: {
        description: 'Bad Request (possible parameters missing or invalid)',
      },
      401: {
        description: 'Unauthorized',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });
}
