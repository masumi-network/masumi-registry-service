import { z } from '@/utils/zod-openapi';

// MIP-002-A2A Agent Card schema. Field names and the required/optional split are
// taken verbatim from the spec
// (https://github.com/masumi-network/masumi-improvement-proposals/blob/main/MIPs/MIP-002/MIP-002-A2A.md),
// and mirror the schema masumi-payment-service validates against at registration
// time (src/utils/validator/agent-card.ts there), so an agent card accepted at
// mint time also validates here at index time.
//
// No per-field length caps: the card is stored as a single Json blob already
// bounded by the shared spec pipeline (MAX_SPEC_BYTES streaming cap on fetch,
// MAX_CACHED_SPEC_BYTES cap before it is cached), so per-field bounds would be
// redundant. `.passthrough()` keeps unknown/newer card fields from failing a
// card that is otherwise valid.

const agentCardInterfaceSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith('https://'),
      'supportedInterfaces[].url must be HTTPS'
    ),
  protocolBinding: z.enum(['HTTP+JSON', 'JSONRPC', 'GRPC']),
  protocolVersion: z.string(),
});

const agentCardSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  inputModes: z.array(z.string()),
  outputModes: z.array(z.string()),
  examples: z.array(z.string()).optional(),
});

const agentCardExtensionSchema = z.object({
  uri: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

const agentCardCapabilitiesSchema = z
  .object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    extensions: z.array(agentCardExtensionSchema).optional(),
  })
  .passthrough();

export const agentCardSchema = z
  .object({
    protocolVersions: z.array(z.string()).min(1),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    supportedInterfaces: z.array(agentCardInterfaceSchema).min(1),
    capabilities: agentCardCapabilitiesSchema,
    defaultInputModes: z.array(z.string()),
    defaultOutputModes: z.array(z.string()),
    skills: z.array(agentCardSkillSchema).min(1),
    provider: z
      .object({
        organization: z.string().optional(),
        url: z.string().optional(),
      })
      .optional(),
    documentationUrl: z.string().optional(),
    iconUrl: z.string().optional(),
  })
  .passthrough()
  // Spec cross-field rule: an interface may only advertise a protocol version
  // the card itself claims to support.
  .superRefine((card, ctx) => {
    card.supportedInterfaces.forEach((agentInterface, index) => {
      if (!card.protocolVersions.includes(agentInterface.protocolVersion)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['supportedInterfaces', index, 'protocolVersion'],
          message: `protocolVersion "${agentInterface.protocolVersion}" is not listed in protocolVersions`,
        });
      }
    });
  });
