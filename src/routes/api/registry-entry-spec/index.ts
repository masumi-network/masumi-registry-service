import { $Enums, Network } from '@prisma/client';
import createHttpError from 'http-errors';
import { registryEntryService } from '@/services/registry-entry';
import { tokenCreditService } from '@/services/token-credit';
import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';

export const registryEntrySpecSchemaInput = z.object({
  network: z.nativeEnum(Network),
  agentIdentifier: z.string().min(1).max(250),
});

export const registryEntrySpecSchemaOutput = z
  .object({
    agentIdentifier: z.string(),
    type: z.nativeEnum($Enums.RegistryEntryType),
    status: z.nativeEnum($Enums.Status),
    // When the cached spec was last proven valid; null before any successful
    // validation (the periodic health loop populates it).
    specValidatedAt: z.date().nullable(),
    // The last fetched + validated spec snapshot: an OpenAPI document (OpenApi
    // entries) or an x402 resource manifest (X402 entries). Null until the first
    // successful validation.
    spec: z.unknown().nullable(),
  })
  .openapi('RegistryEntrySpec');

// Serves the registry's cached, validated copy of an OpenApi/X402 agent's spec,
// so callers get a known-good snapshot without fetching the agent's URL
// themselves. Standard entries have no spec (404). The `status` reflects the
// periodic health check, which re-validates and reconciles over time.
export const registryEntrySpecGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: registryEntrySpecSchemaInput,
  output: registryEntrySpecSchemaOutput,
  handler: async ({
    input,
    ctx,
  }: {
    input: z.infer<typeof registryEntrySpecSchemaInput>;
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
      'spec for: ' + input.agentIdentifier
    );
    const entry = await registryEntryService.getRegistryEntrySpec(input);
    if (entry == null) {
      throw createHttpError(404, 'Registry entry not found');
    }
    if (entry.type === $Enums.RegistryEntryType.Standard) {
      throw createHttpError(
        404,
        'Standard registry entries do not expose a spec'
      );
    }
    return registryEntrySpecSchemaOutput.parse({
      agentIdentifier: input.agentIdentifier,
      type: entry.type,
      status: entry.status,
      specValidatedAt: entry.specValidatedAt,
      spec: entry.spec ?? null,
    });
  },
});
