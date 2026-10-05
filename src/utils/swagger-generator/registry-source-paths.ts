import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  getRegistrySourceSchemaInput,
  getRegistrySourceSchemaOutput,
  addRegistrySourceSchemaInput,
  registrySourceSchemaOutput,
  updateRegistrySourceSchemaInput,
  deleteRegistrySourceSchemaInput,
} from '@/routes/api/registry-source';
import { Network } from '@prisma/client';

export function registerRegistrySourcePaths(
  registry: OpenAPIRegistry,
  apiKeyAuthName: string
) {
  const registrySourceResponseExample = {
    data: {
      id: 'unique-cuid-v2-auto-generated',
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
    security: [{ [apiKeyAuthName]: [] }],
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
    security: [{ [apiKeyAuthName]: [] }],
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
    security: [{ [apiKeyAuthName]: [] }],
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
    security: [{ [apiKeyAuthName]: [] }],
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
}
