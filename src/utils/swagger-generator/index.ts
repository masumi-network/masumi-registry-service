import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { CONFIG } from '@/utils/config';
import { healthResponseSchema } from '@/routes/api/health';
import {
  queryRegistrySchemaInput,
  queryRegistrySchemaOutput,
  registryDiffSchemaInput,
} from '@/routes/api/registry-entry/schemas';
import {
  capabilitySchemaInput,
  capabilitySchemaOutput,
} from '@/routes/api/capability';
import {
  apiKeySchemaOutput,
  addAPIKeySchemaInput,
  getAPIKeySchemaInput,
  getAPIKeySchemaOutput,
  updateAPIKeySchemaInput,
  deleteAPIKeySchemaInput,
} from '@/routes/api/api-key';
import {
  getRegistrySourceSchemaInput,
  getRegistrySourceSchemaOutput,
  addRegistrySourceSchemaInput,
  registrySourceSchemaOutput,
  updateRegistrySourceSchemaInput,
  deleteRegistrySourceSchemaInput,
} from '@/routes/api/registry-source';
import {
  queryPaymentInformationInput,
  queryPaymentInformationSchemaOutput,
} from '@/routes/api/payment-information';
import {
  PaymentType,
  RegistryEntryType,
  Status,
  PricingType,
  Network,
} from '@prisma/client';
import { getAPIKeyStatusSchemaInput } from '@/routes/api/api-key-status';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
export function generateOpenAPI() {
  const apiKeyAuth = registry.registerComponent('securitySchemes', 'API-Key', {
    type: 'apiKey',
    in: 'header',
    name: 'token',
    description: 'API key authentication via header (token)',
  });

  const registryEntriesResponseExample = {
    data: {
      entries: [
        {
          // MIP-001 entry example
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
          metadataVersion: 1,
          agentCardUrl: null,
          a2aProtocolVersions: [],
          a2aAgentVersion: null,
          a2aDefaultInputModes: [],
          a2aDefaultOutputModes: [],
          a2aProviderName: null,
          a2aProviderUrl: null,
          a2aDocumentationUrl: null,
          a2aIconUrl: null,
          agentIdentifier:
            '222222222222222222222222222222222222222222222222222222222222222222',
          RegistrySource: {
            id: 'unique_cuid_v2',
            policyId: 'policy_id',
            type: RegistryEntryType.Web3CardanoV1,
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
          A2ASkills: [],
          A2ASupportedInterfaces: [],
          A2ACapabilities: null,
        },
        {
          // MIP-002 (A2A) entry example
          id: 'unique_cuid_v2_a2a',
          name: 'Example A2A Agent',
          description: 'An A2A protocol agent',
          status: Status.Online,
          statusUpdatedAt: new Date(120000),
          authorName: null,
          authorContactEmail: null,
          authorContactOther: null,
          image: null,
          otherLegal: null,
          privacyPolicy: null,
          tags: ['ai', 'a2a'],
          termsAndCondition: null,
          uptimeCheckCount: 5,
          uptimeCount: 5,
          lastUptimeCheck: new Date(0),
          apiBaseUrl: 'https://a2a-agent.example.com/',
          authorOrganization: null,
          paymentType: PaymentType.None,
          metadataVersion: 2,
          agentCardUrl:
            'https://a2a-agent.example.com/.well-known/agent-card.json',
          a2aProtocolVersions: ['1.0'],
          a2aAgentVersion: '1.0.0',
          a2aDefaultInputModes: ['text/plain', 'application/json'],
          a2aDefaultOutputModes: ['text/plain', 'application/json'],
          a2aProviderName: 'Example Org',
          a2aProviderUrl: 'https://example-org.com',
          a2aDocumentationUrl: 'https://a2a-agent.example.com/docs',
          a2aIconUrl: 'https://a2a-agent.example.com/icon.png',
          agentIdentifier:
            '333333333333333333333333333333333333333333333333333333333333333333',
          RegistrySource: {
            id: 'unique_cuid_v2',
            policyId: 'policy_id',
            type: RegistryEntryType.Web3CardanoV1,
            url: null,
          },
          Capability: null,
          AgentPricing: {
            pricingType: PricingType.Free,
          },
          ExampleOutput: [],
          A2ASkills: [
            {
              id: 'skill_cuid',
              skillId: 'text-summarization',
              name: 'Text Summarization',
              description: 'Summarizes long documents into concise summaries',
              tags: ['text', 'summarization', 'nlp'],
              examples: ['Summarize this article for me'],
              inputModes: ['text/plain', 'application/json'],
              outputModes: ['text/plain', 'application/json'],
            },
          ],
          A2ASupportedInterfaces: [
            {
              id: 'iface_cuid',
              url: 'https://a2a-agent.example.com/',
              protocolBinding: 'HTTP+JSON',
              protocolVersion: '1.0',
            },
          ],
          A2ACapabilities: {
            streaming: false,
            pushNotifications: false,
            extensions: [
              {
                uri: 'https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2',
                description: 'x402 payment extension',
                required: false,
              },
            ],
          },
        },
      ],
    },
    status: 'success',
  };

  const registrySourceResponseExample = {
    data: {
      id: 'unique-cuid-v2-auto-generated',
      type: RegistryEntryType.Web3CardanoV1,
      network: Network.Preprod,
      url: 'https://example.com/api/',
      policyId: 'policy_id',
      note: 'optional_note',
      rpcProviderApiKey: 'apikey',
      latestPage: 1,
      latestIdentifier: null,
    },
    status: 'success',
  };

  registry.registerPath({
    method: 'get',
    path: '/health/',
    summary: 'Get the status of the API server',
    request: {},
    responses: {
      200: {
        description: 'Object with health and version information.',
        content: {
          'application/json': {
            schema: z
              .object({ data: healthResponseSchema, status: z.string() })
              .openapi({
                example: {
                  data: { type: 'masumi-registry', version: '0.1.2' },
                  status: 'success',
                },
              }),
          },
        },
      },
    },
  });
  /************************** Payment Information **************************/

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
    security: [{ [apiKeyAuth.name]: [] }],
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
                      type: 'Web3CardanoV1',
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
                  metadataVersion: [1, 2],
                },
                minHealthCheckDate: new Date(0).toISOString(),
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
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
  /************************** Sources **************************/
  registry.registerPath({
    method: 'get',
    path: '/registry-source/',
    description: 'Gets all registry sources',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['registry-source'],
    request: {
      query: getRegistrySourceSchemaInput.openapi({
        example: {
          limit: 10,
          cursorId: 'optional_last_paginated_item',
        },
      }),
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'Registry sources',
        content: {
          'application/json': {
            schema: z
              .object({
                data: getRegistrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    sources: [
                      {
                        id: 'unique-cuid-v2-auto-generated',
                        type: 'Web3CardanoV1',
                        policyId: 'policyId',
                        url: 'optional_url',
                        note: 'optional_note',
                        rpcProviderApiKey: 'optional_apikey',
                        network: 'Preprod',
                        latestPage: 1,
                        latestIdentifier: 'optional_latestIdentifier',
                      },
                    ],
                  },
                  status: 'success',
                },
              }),
          },
        },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/registry-source/',
    description: 'Creates a new registry source',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['registry-source'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: addRegistrySourceSchemaInput.openapi({
              example: {
                type: 'Web3CardanoV1',
                policyId: 'policyId',
                rpcProviderApiKey: 'apikey',
                note: 'optional_note',
                network: 'Preprod',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'Registry source',
        content: {
          'application/json': {
            schema: z
              .object({
                data: registrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: registrySourceResponseExample,
              }),
          },
        },
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
                metadataVersion: [1, 2],
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
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
    method: 'patch',
    path: '/registry-source/',
    description: 'Updates a registry source',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['registry-source'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: updateRegistrySourceSchemaInput.openapi({
              example: {
                id: 'unique-cuid-v2-auto-generated',
                note: 'optional_note',
                rpcProviderApiKey: 'optional_apiKey',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'Registry source',
        content: {
          'application/json': {
            schema: z
              .object({
                data: registrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: registrySourceResponseExample,
              }),
          },
        },
      },
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/registry-source/',
    description: 'Updates a registry source',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['registry-source'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: deleteRegistrySourceSchemaInput.openapi({
              example: {
                id: 'unique-cuid-v2-auto-generated',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'Registry source',
        content: {
          'application/json': {
            schema: z
              .object({
                data: registrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: registrySourceResponseExample,
              }),
          },
        },
      },
    },
  });
  /************************** Capabilities **************************/
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
    security: [{ [apiKeyAuth.name]: [] }],
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

  /************************** API Key Status **************************/
  registry.registerPath({
    method: 'get',
    path: '/api-key-status/',
    description: 'Gets the status of an API key',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['api-key-status'],
    request: {
      query: getAPIKeyStatusSchemaInput.openapi({
        example: {},
      }),
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'API Key Status',
        content: {
          'application/json': {
            schema: z
              .object({ data: apiKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
                    token: 'masumi-registry-api-key-secret',
                    permission: 'Admin',
                    usageLimited: true,
                    maxUsageCredits: 1000000,
                    accumulatedUsageCredits: 0,
                    status: 'Active',
                  },
                  status: 'success',
                },
              }),
          },
        },
      },
    },
  });

  /************************** API Key **************************/
  registry.registerPath({
    method: 'get',
    path: '/api-key/',
    description: 'Gets registry sources, can be paginated',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['api-key'],
    request: {
      query: getAPIKeySchemaInput.openapi({
        example: {
          cursorId: 'last_paginated_item_api_key',
          limit: 10,
        },
      }),
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'Registry entries',
        content: {
          'application/json': {
            schema: z
              .object({ data: getAPIKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    apiKeys: [
                      {
                        id: 'unique-cuid-v2-auto-generated',
                        token: 'masumi-registry-api-key-secret',
                        permission: 'Admin',
                        usageLimited: true,
                        maxUsageCredits: 1000000,
                        accumulatedUsageCredits: 0,
                        status: 'Active',
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

  registry.registerPath({
    method: 'post',
    path: '/api-key/',
    description: 'Create a new API key',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['api-key'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: addAPIKeySchemaInput.openapi({
              example: {
                permission: 'Admin',
                usageLimited: true,
                maxUsageCredits: 1000000,
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'API Key',
        content: {
          'application/json': {
            schema: z
              .object({ data: apiKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
                    status: 'Active',
                    token: 'masumi-registry-api-key-secret',
                    permission: 'User',
                    usageLimited: true,
                    maxUsageCredits: 1000000,
                    accumulatedUsageCredits: 0,
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

  registry.registerPath({
    method: 'patch',
    path: '/api-key/',
    description: 'Updates a API key',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['api-key'],
    request: {
      body: {
        description: 'Undefined fields will not be changed',
        content: {
          'application/json': {
            schema: updateAPIKeySchemaInput.openapi({
              example: {
                token: 'id_or_apiKey_api-key-to-update',
                usageLimited: true,
                maxUsageCredits: 1000000,
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'Registry entries',
        content: {
          'application/json': {
            schema: z
              .object({ data: apiKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
                    token: 'masumi-registry-api-key-secret',
                    permission: 'User',
                    usageLimited: true,
                    maxUsageCredits: 1000000,
                    accumulatedUsageCredits: 0,
                    status: 'Active',
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

  registry.registerPath({
    method: 'delete',
    path: '/api-key/',
    description: 'Removes a API key',
    summary: 'REQUIRES API KEY Authentication (+admin)',
    tags: ['api-key'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: deleteAPIKeySchemaInput.openapi({
              example: {
                token: 'api-key-to-delete',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuth.name]: [] }],
    responses: {
      200: {
        description: 'API Key',
        content: {
          'application/json': {
            schema: z
              .object({ data: apiKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
                    token: 'deleted-masumi-registry-api-key-secret',
                    permission: 'User',
                    usageLimited: true,
                    maxUsageCredits: 1000000,
                    accumulatedUsageCredits: 0,
                    status: 'Active',
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

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.0',
    info: {
      version: CONFIG.VERSION,
      title: 'Masumi Registry Service API',
      description:
        'A comprehensive API for querying and managing the Masumi network registry of agents and nodes',
    },

    servers: [{ url: './../api/v1/' }],
  });
}
