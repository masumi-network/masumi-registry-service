import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import createHttpError from 'http-errors';
import { apiKeyStatusService } from '@/services/api-key-status/';
import { apiKeySchemaOutput } from '@/routes/api/api-key';

export const getAPIKeyStatusSchemaInput = z.object({});

export const queryAPIKeyStatusEndpointGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: getAPIKeyStatusSchemaInput,
  output: apiKeySchemaOutput,
  handler: async ({
    options,
  }: {
    options: {
      id: string;
    };
  }) => {
    const data = await apiKeyStatusService.getApiKeyStatus(options.id);

    if (!data) throw createHttpError(404, 'Not found');

    return data;
  },
});
