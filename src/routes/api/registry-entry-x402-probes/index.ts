import { $Enums, Network } from '@prisma/client';
import createHttpError from 'http-errors';
import { getAgentX402Probes } from '@/services/x402-probe';
import { tokenCreditService } from '@/services/token-credit';
import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';

export const registryEntryX402ProbesSchemaInput = z.object({
  network: z.nativeEnum(Network),
  agentIdentifier: z.string().min(1).max(250),
});

const probeAcceptSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  amount: z.string().describe('Atomic units'),
  asset: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().nullable(),
});

const probedResourceSchema = z.object({
  resource: z.string(),
  outcome: z
    .nativeEnum($Enums.X402ProbeOutcome)
    .describe(
      'Payable: 402 with a usable challenge. Free: answered without payment. Invalid: 402 without a usable challenge, or a URL the probe refuses. Unsupported: the resource does not serve GET (405, or 404 on a POST-only route; the probe never sends a body). Unreachable: no answer, or another status such as 5xx.'
    ),
  httpStatus: z.number().nullable(),
  x402Version: z.number().nullable(),
  accepts: z
    .array(probeAcceptSchema)
    .nullable()
    .describe('Payment requirements the resource asked for'),
  matchesRegisteredSources: z
    .boolean()
    .nullable()
    .describe(
      'Whether the challenge agrees with the entry’s registered EVM payment sources on scheme, network, asset, amount and payTo. It does not promise the Masumi payment service accepts the challenge: that service also pins maxTimeoutSeconds and extra.assetTransferMethod/decimals when it verifies a payment for a seller. Null when there is nothing to compare.'
    ),
  mismatches: z.array(z.string()),
  reason: z.string().nullable(),
  checkedAt: z.date(),
});

export const registryEntryX402ProbesSchemaOutput = z
  .object({
    agentIdentifier: z.string(),
    status: z.nativeEnum($Enums.Status),
    resources: z.array(probedResourceSchema),
  })
  .openapi('RegistryEntryX402Probes');

// What the registry's unpaid probes of an X402 agent's resources last answered.
// Informational: it never affects the entry's status. Resources not probed yet
// (or beyond the tracked limit) are simply absent. An agent can answer the
// probe differently from a real buyer, so this is not a trust signal.
export const registryEntryX402ProbesGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: registryEntryX402ProbesSchemaInput,
  output: registryEntryX402ProbesSchemaOutput,
  handler: async ({
    input,
    ctx,
  }: {
    input: z.infer<typeof registryEntryX402ProbesSchemaInput>;
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
      'x402 probes for: ' + input.agentIdentifier
    );
    const probes = await getAgentX402Probes(input);
    if (probes == null) {
      throw createHttpError(404, 'x402 registry entry not found');
    }
    return registryEntryX402ProbesSchemaOutput.parse(probes);
  },
});
