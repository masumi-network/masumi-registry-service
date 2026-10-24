import { $Enums, Network } from '@prisma/client';
import createHttpError from 'http-errors';
import { getAgentX402OpenApi } from '@/services/x402-openapi-discovery';
import { tokenCreditService } from '@/services/token-credit';
import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';

export const registryEntryX402OpenApiSchemaInput = z.object({
  network: z.nativeEnum(Network),
  agentIdentifier: z.string().min(1).max(250),
});

const discoveredOriginSchema = z.object({
  origin: z.string().describe('https origin of the resources it covers'),
  outcome: z
    .nativeEnum($Enums.X402OpenApiDiscoveryOutcome)
    .describe(
      'Found: a valid OpenAPI document was served. NotFound: the origin answered but no candidate location served a document. Invalid: a candidate served something that is not a valid OpenAPI document, a JSON document over 2 MiB, a YAML document over 64 KiB (YAML is not parsed beyond that), or the origin is a URL the registry refuses to contact. Unreachable: the origin did not answer.'
    ),
  specUrl: z
    .string()
    .nullable()
    .describe('Where the document was found (Found only)'),
  openApiVersion: z
    .string()
    .nullable()
    .describe('OpenAPI version the document declares'),
  title: z.string().nullable().describe('info.title of the document'),
  spec: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe(
      'The document itself, when small enough to be cached (256 KiB). Null for a larger one: fetch it from specUrl.'
    ),
  reason: z.string().nullable(),
  checkedAt: z.date(),
});

export const registryEntryX402OpenApiSchemaOutput = z
  .object({
    agentIdentifier: z.string(),
    status: z.nativeEnum($Enums.Status),
    origins: z.array(discoveredOriginSchema),
  })
  .openapi('RegistryEntryX402OpenApi');

// Where the registry last found an OpenAPI document for the origins an X402
// agent's resources live on. Informational: it never affects the entry's
// status. Origins not checked yet (or beyond the tracked limit) are absent. The
// document is the origin's own claim about its API, not a trust signal.
export const registryEntryX402OpenApiGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: registryEntryX402OpenApiSchemaInput,
  output: registryEntryX402OpenApiSchemaOutput,
  handler: async ({ input, ctx }) => {
    await tokenCreditService.handleTokenCredits(
      ctx,
      0,
      'x402 openapi for: ' + input.agentIdentifier
    );
    const discovered = await getAgentX402OpenApi(input);
    if (discovered == null) {
      throw createHttpError(404, 'x402 registry entry not found');
    }
    return registryEntryX402OpenApiSchemaOutput.parse(discovered);
  },
});
