import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  apiKeySchemaOutput,
  apiKeyCreateSchemaOutput,
  addAPIKeySchemaInput,
  getAPIKeySchemaInput,
  getAPIKeySchemaOutput,
  updateAPIKeySchemaInput,
  deleteAPIKeySchemaInput,
} from '@/routes/api/api-key';
import { getAPIKeyStatusSchemaInput } from '@/routes/api/api-key-status';

export function registerApiKeyPaths(
  registry: OpenAPIRegistry,
  apiKeyAuthName: string
) {
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
    security: [{ [apiKeyAuthName]: [] }],
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
    security: [{ [apiKeyAuthName]: [] }],
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
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'API Key',
        content: {
          'application/json': {
            schema: z
              .object({
                data: apiKeyCreateSchemaOutput,
                status: z.string(),
              })
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
    security: [{ [apiKeyAuthName]: [] }],
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
    security: [{ [apiKeyAuthName]: [] }],
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
}
