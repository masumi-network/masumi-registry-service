import { $Enums } from '@prisma/client';
import createHttpError from 'http-errors';
import {
  X402DiscoveryBusyError,
  X402DiscoveryError,
  discoverX402ByPayTo,
} from '@/services/x402-discovery';
import { tokenCreditService } from '@/services/token-credit';
import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { logger } from '@/utils/logger';
import { z } from '@/utils/zod-openapi';

export const x402DiscoverySchemaInput = z.object({
  payTo: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'payTo must be an EVM address')
    .describe(
      'The seller address (payTo) to look up in the facilitator catalog'
    ),
  caip2Network: z
    .string()
    .regex(/^eip155:\d{1,20}$/, 'caip2Network must look like eip155:8453')
    .optional()
    .describe(
      'Only return resources payable on this network, e.g. eip155:8453 (Base)'
    ),
});

const jsonObject = z.record(z.string(), z.unknown());

const discoveredAcceptSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  amount: z.string().describe('Atomic units'),
  asset: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().nullable(),
  extra: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .nullable(),
});

const discoveredResourceSchema = z.object({
  resource: z.string(),
  method: z.string().nullable(),
  description: z.string().nullable(),
  serviceName: z.string().nullable(),
  tags: z.array(z.string()),
  x402Version: z.number().nullable(),
  accepts: z.array(discoveredAcceptSchema),
  inputSchema: jsonObject.nullable(),
  outputSchema: jsonObject.nullable(),
  lastUpdated: z.string().nullable(),
  quality: z
    .object({
      l30DaysTotalCalls: z.number(),
      l30DaysUniquePayers: z.number(),
      lastCalledAt: z.string().nullable(),
    })
    .nullable()
    .describe('Usage reported by the facilitator over the last 30 days'),
});

const suggestedManifestSchema = z.object({
  x402Version: z.number(),
  resources: z.array(
    z.object({
      resource: z.string(),
      type: z.literal('http'),
      description: z.string().optional(),
      inputSchema: jsonObject.optional(),
      outputSchema: jsonObject.optional(),
    })
  ),
});

export const x402DiscoverySchemaOutput = z
  .object({
    payTo: z.string(),
    truncated: z
      .boolean()
      .describe('The facilitator holds more resources than were read'),
    registeredEntries: z
      .array(
        z.object({
          assetIdentifier: z.string(),
          network: z.nativeEnum($Enums.Network),
          status: z.nativeEnum($Enums.Status),
        })
      )
      .describe('X402 registry entries that already sell to this address'),
    candidates: z.array(
      z.object({
        host: z.string(),
        serviceName: z.string().nullable(),
        networks: z.array(z.string()),
        registered: z
          .boolean()
          .describe('A registry entry already lists one of these resources'),
        manifestValid: z.boolean(),
        suggestedManifest: suggestedManifestSchema
          .nullable()
          .describe(
            'A manifest the registry would accept; host it and register its URL as x402ResourcesUrl'
          ),
        resources: z.array(discoveredResourceSchema),
      })
    ),
  })
  .openapi('X402Discovery');

// Finds the x402 APIs a facilitator's Bazaar catalog holds for one seller
// address and groups them into candidate agents. Read-only: it registers
// nothing. The facilitator is operator-configured, never taken from the caller.
export const x402DiscoveryGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: x402DiscoverySchemaInput,
  output: x402DiscoverySchemaOutput,
  handler: async ({
    input,
    ctx,
  }: {
    input: z.infer<typeof x402DiscoverySchemaInput>;
    ctx: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    await tokenCreditService.handleTokenCredits(
      ctx,
      0,
      'x402 discovery for: ' + input.payTo
    );
    try {
      return x402DiscoverySchemaOutput.parse(await discoverX402ByPayTo(input));
    } catch (error) {
      if (error instanceof X402DiscoveryBusyError) {
        throw createHttpError(429, 'Too many discovery lookups, retry shortly');
      }
      if (!(error instanceof X402DiscoveryError)) throw error;
      logger.warn('x402 facilitator discovery failed', {
        payTo: input.payTo,
        error: error.message,
      });
      throw createHttpError(502, 'The x402 facilitator could not be queried');
    }
  },
});
