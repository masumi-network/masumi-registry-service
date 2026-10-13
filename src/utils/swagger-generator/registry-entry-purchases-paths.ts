import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/utils/zod-openapi';
import {
  registryEntryPurchasesSchemaInput,
  registryEntryPurchasesSchemaOutput,
} from '@/routes/api/registry-entry-purchases';

const EXAMPLE_AGENT_IDENTIFIER =
  '222222222222222222222222222222222222222222222222222222222222222222';
// Placeholder policy id plus a token name; not a real asset.
const EXAMPLE_TOKEN_UNIT = '3'.repeat(56) + '5553444d';

export function registerRegistryEntryPurchasesPaths(
  registry: OpenAPIRegistry,
  apiKeyAuthName: string
) {
  registry.registerPath({
    method: 'get',
    path: '/registry-entry-purchases/',
    description:
      "Returns an agent's all-time purchase totals (count, distinct funded " +
      'buyers, paid amount per asset unit) and a UTC time series of its ' +
      'purchases. Purchases are seller withdrawals indexed from the masumi ' +
      'payment contracts; amounts exclude the collateral returned to the buyer.',
    summary: 'REQUIRES API KEY Authentication (+user)',
    tags: ['registry-entry'],
    request: {
      query: registryEntryPurchasesSchemaInput.openapi({
        example: {
          network: 'Preprod',
          agentIdentifier: EXAMPLE_AGENT_IDENTIFIER,
          interval: 'Day',
        },
      }),
    },
    security: [{ [apiKeyAuthName]: [] }],
    responses: {
      200: {
        description: 'Purchase totals and time series of the agent',
        content: {
          'application/json': {
            schema: z
              .object({
                data: registryEntryPurchasesSchemaOutput,
                status: z.string(),
              })
              .openapi({
                example: {
                  data: {
                    network: 'Preprod',
                    agentIdentifier: EXAMPLE_AGENT_IDENTIFIER,
                    interval: 'Day',
                    from: new Date(0),
                    to: new Date(90 * 24 * 60 * 60 * 1000),
                    totals: {
                      purchases: 3,
                      distinctBuyers: 2,
                      amounts: [
                        { unit: 'lovelace', quantity: '15000000' },
                        { unit: EXAMPLE_TOKEN_UNIT, quantity: '25000000' },
                      ],
                    },
                    series: [
                      {
                        bucketStart: new Date(0),
                        purchases: 2,
                        amounts: [{ unit: 'lovelace', quantity: '10000000' }],
                      },
                    ],
                  },
                  status: 'success',
                },
              }),
          },
        },
      },
      400: { description: 'Invalid input or range' },
      401: { description: 'Unauthorized' },
    },
  });
}
