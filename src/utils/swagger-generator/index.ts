import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { healthResponseSchema } from '@/routes/api/health';
import {
  queryRegistrySchemaInput,
  queryRegistrySchemaOutput,
} from '@/routes/api/registry-entry';
import cuid2 from '@paralleldrive/cuid2';
import {
  capabilitySchemaInput,
  capabilitySchemaOutput,
} from '@/routes/api/capability';
import {
  addAPIKeySchemaOutput,
  addAPIKeySchemaInput,
  getAPIKeySchemaInput,
  getAPIKeySchemaOutput,
  updateAPIKeySchemaOutput,
  updateAPIKeySchemaInput,
  deleteAPIKeySchemaOutput,
  deleteAPIKeySchemaInput,
} from '@/routes/api/api-key';
import {
  getRegistrySourceSchemaInput,
  getRegistrySourceSchemaOutput,
  addRegistrySourceSchemaInput,
  addRegistrySourceSchemaOutput,
  updateRegistrySourceSchemaInput,
  deleteRegistrySourceSchemaInput,
  deleteRegistrySourceSchemaOutput,
  updateRegistrySourceSchemaOutput,
} from '@/routes/api/registry-source';
import {
  queryPaymentInformationInput,
  queryPaymentInformationSchemaOutput,
} from '@/routes/api/payment-information';
import { PaymentType } from '@prisma/client';
import { Status } from '@prisma/client';
import {
  getAPIKeyStatusSchemaInput,
  getAPIKeyStatusSchemaOutput,
} from '@/routes/api/api-key-status';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
export function generateOpenAPI() {
  const apiKeyAuth = registry.registerComponent('securitySchemes', 'API-Key', {
    type: 'apiKey',
    in: 'header',
    name: 'token',
    description: 'API key authentication via header (token)',
  });

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
          policyId: 'policy_id',
          assetName: 'asset_name',
        },
      }),
    },
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
                      description: 'Example Capability description',
                    },
                    PaymentIdentifier: [
                      {
                        paymentIdentifier:
                          'addr1333333333333333333333333333333333333333333333333333333333333333',
                        paymentType: 'Web3CardanoV1',
                        sellerVKey: 'sellerVKey',
                      },
                    ],
                    Prices: [
                      { unit: 'USDC', quantity: 100 },
                      { unit: 'USDM', quantity: 15000 },
                    ],
                    authorContact: null,
                    authorName: null,
                    image: 'testimage.de',
                    otherLegal: null,
                    privacyPolicy: null,
                    requestsPerHour: 15,
                    tags: null,
                    termsAndCondition:
                      'If the answer is 42 what was the question',
                    uptimeCheckCount: 10,
                    uptimeCount: 8,
                    lastUptimeCheck: new Date(0),
                    apiUrl: 'https://localhost:3000/api/',
                    authorOrganization: 'MASUMI',
                    agentIdentifier:
                      '222222222222222222222222222222222222222222222222222222222222222222',
                    id: cuid2.createId(),
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
                  assetName: 'asset_name',
                  paymentTypes: [PaymentType.Web3CardanoV1],
                  status: [Status.Online, Status.Offline],
                  capability: {
                    name: 'Example Capability',
                    version: 'Optional version',
                  },
                },
                minRegistryDate: new Date(0).toISOString(),
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
                example: {
                  data: {
                    entries: [
                      {
                        name: 'Example API',
                        description: 'Example Capability description',
                        status: 'Online',
                        RegistrySource: {
                          id: 'unique-cuid-v2-auto-generated',
                          type: 'Web3CardanoV1',
                          policyId:
                            '0000000000000000000000000000000000000000000000000000000000000000',
                          url: null,
                        },
                        Capability: {
                          name: 'Example Capability',
                          version: '1.0.0',
                          description: 'Example Capability description',
                        },
                        Prices: [{ unit: 'USDC', quantity: 100 }],
                        authorContact: null,
                        authorName: null,
                        image: 'testimage.de',
                        otherLegal: null,
                        privacyPolicy: null,
                        requestsPerHour: 15,
                        tags: null,
                        termsAndCondition:
                          'If the answer is 42 what was the question',
                        uptimeCheckCount: 10,
                        uptimeCount: 8,
                        lastUptimeCheck: new Date(0),
                        apiUrl: 'https://localhost:3000/api/',
                        authorOrganization: 'MASUMI',
                        agentIdentifier:
                          '222222222222222222222222222222222222222222222222222222222222222222',
                        id: cuid2.createId(),
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
                data: addRegistrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
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
                data: updateRegistrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
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
                data: deleteRegistrySourceSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    id: 'unique-cuid-v2-auto-generated',
                  },
                  status: 'success',
                },
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
              .object({ data: getAPIKeyStatusSchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
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
              .object({ data: addAPIKeySchemaOutput, status: z.string() })
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
                apiKey: 'id_or_apiKey_api-key-to-update',
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
              .object({ data: updateAPIKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
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
              .object({ data: deleteAPIKeySchemaOutput, status: z.string() })
              .openapi({
                example: {
                  data: {
                    token: 'deleted-masumi-registry-api-key-secret',
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
      version: '1.0.0',
      title: 'Template API',
      description: 'This is the default API from a template',
    },

    servers: [{ url: './../api/v1/' }],
  });
}
