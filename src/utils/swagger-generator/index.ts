import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { CONFIG } from '@/utils/config';
import { healthResponseSchema } from '@/routes/api/health';
import { registerRegistryEntryPaths } from './registry-entry-paths';
import { registerInboxAgentRegistrationPaths } from './inbox-agent-registration-paths';
import { registerRegistrySourcePaths } from './registry-source-paths';
import { registerApiKeyPaths } from './api-key-paths';

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

  registerRegistryEntryPaths(registry, apiKeyAuth.name);
  registerInboxAgentRegistrationPaths(registry, apiKeyAuth.name);
  registerRegistrySourcePaths(registry, apiKeyAuth.name);
  registerApiKeyPaths(registry, apiKeyAuth.name);

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
