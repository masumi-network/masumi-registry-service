import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  queryInboxAgentRegistrationSchemaInput,
  queryInboxAgentRegistrationSchemaOutput,
  inboxAgentRegistrationDiffSchemaInput,
  refreshInboxAgentRegistrationSchemaInput,
  refreshInboxAgentRegistrationSchemaOutput,
  searchInboxAgentRegistrationSchemaInput,
} from '@/routes/api/inbox-agent-registration';
import { InboxAgentRegistrationStatus } from '@prisma/client';

export function registerInboxAgentRegistrationPaths(
  registry: OpenAPIRegistry,
  apiKeyAuthName: string
) {
  const inboxAgentRegistrationsResponseExample = {
    data: {
      registrations: [
        {
          id: 'unique_cuid_v2',
          createdAt: new Date(0),
          updatedAt: new Date(120000),
          status: InboxAgentRegistrationStatus.Pending,
          statusUpdatedAt: new Date(120000),
          name: 'Inbox Agent',
          description: 'Masumi inbox identity registration',
          agentSlug: 'inbox-agent',
          agentIdentifier:
            '333333333333333333333333333333333333333333333333333333333333333333',
          providerUrl: 'https://agentmessenger.io',
          linkedEmail: 'agent@example.com',
          encryptionPublicKey: 'encryption_public_key',
          encryptionKeyVersion: 'enc-v1',
          signingPublicKey: 'signing_public_key',
          signingKeyVersion: 'sig-v1',
          metadataVersion: 1,
          RegistrySource: {
            id: 'unique_cuid_v2',
            policyId: 'policy_id',
            url: 'https://example.com/registry.json',
          },
        },
      ],
    },
    status: 'success',
  };

  registry.registerPath({
    method: 'post',
    path: '/inbox-agent-registration/',
    description:
      'Query blockchain-tracked Masumi inbox registrations. By default, only pending and verified registrations are returned. Supports pagination and filtering by slug, status, and policy id.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['inbox-agent-registration'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: queryInboxAgentRegistrationSchemaInput.openapi({
              example: {
                limit: 10,
                cursorId: 'last_paginated_item',
                network: 'Preprod',
                filter: {
                  policyId: 'policy_id',
                  agentSlug: 'inbox-agent',
                  status: ['Pending', 'Verified'],
                },
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Inbox agent registrations',
        content: {
          'application/json': {
            schema: z
              .object({
                data: queryInboxAgentRegistrationSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: inboxAgentRegistrationsResponseExample,
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
    path: '/inbox-agent-registration-search/',
    description:
      'Fuzzy-search blockchain-tracked Masumi inbox registrations by slug, name, or linked email. By default, only pending and verified registrations are returned. Supports pagination and optional filtering by status and policy id.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['inbox-agent-registration'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: searchInboxAgentRegistrationSchemaInput.openapi({
              example: {
                limit: 10,
                cursorId: 'last_paginated_item',
                network: 'Preprod',
                query: 'agent@example.com',
                filter: {
                  policyId: 'policy_id',
                  status: ['Pending', 'Verified'],
                },
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Inbox agent registrations matching the fuzzy search',
        content: {
          'application/json': {
            schema: z
              .object({
                data: queryInboxAgentRegistrationSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: inboxAgentRegistrationsResponseExample,
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
    path: '/inbox-agent-registration-refresh/',
    description:
      'Refresh one inbox agent registration by agent identifier. If the registration was invalid, the service clears verification-derived fields, moves it back to pending, and immediately re-runs inbox verification.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['inbox-agent-registration'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: refreshInboxAgentRegistrationSchemaInput.openapi({
              example: {
                network: 'Preprod',
                agentIdentifier:
                  '333333333333333333333333333333333333333333333333333333333333333333',
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Refreshed inbox agent registration',
        content: {
          'application/json': {
            schema: z
              .object({
                data: refreshInboxAgentRegistrationSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    registration:
                      inboxAgentRegistrationsResponseExample.data
                        .registrations[0],
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
        description: 'Inbox agent registration not found',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/inbox-agent-registration-diff/',
    description:
      'Query inbox registrations whose status was updated after the provided timestamp. Supports pagination and optional filtering by status, slug, and policy id.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['inbox-agent-registration'],
    request: {
      body: {
        description: '',
        content: {
          'application/json': {
            schema: inboxAgentRegistrationDiffSchemaInput.openapi({
              example: {
                limit: 10,
                cursorId: 'last_paginated_item',
                network: 'Preprod',
                statusUpdatedAfter: new Date(0).toISOString(),
                policyId: 'policy_id',
                agentSlug: 'inbox-agent',
                status: ['Pending', 'Verified', 'Invalid', 'Deregistered'],
              },
            }),
          },
        },
      },
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Inbox registrations with updated status',
        content: {
          'application/json': {
            schema: z
              .object({
                data: queryInboxAgentRegistrationSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: inboxAgentRegistrationsResponseExample,
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
