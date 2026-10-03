import { z } from '@/utils/zod-openapi';

// MIP-002-A2A Agent Card schema. Field names and the required/optional split are
// taken verbatim from the spec
// (https://github.com/masumi-network/masumi-improvement-proposals/blob/main/MIPs/MIP-002/MIP-002-A2A.md),
// and mirror the schema masumi-payment-service validates against at registration
// time (src/utils/validator/agent-card.ts there), so an agent card accepted at
// mint time also validates here at index time.
//
// Protocol versions use Major.Minor and fit within one metadata string.
// The fetch pipeline bounds the card body and the cached JSON snapshot.
// `.passthrough()` retains unknown card fields.

export const a2aProtocolVersionSchema = z
  .string()
  .max(64)
  .regex(/^[0-9]+\.[0-9]+$/, 'protocol version must use Major.Minor');

const agentCardInterfaceSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith('https://'),
      'supportedInterfaces[].url must be HTTPS'
    ),
  protocolBinding: z.enum(['HTTP+JSON', 'JSONRPC', 'GRPC']),
  protocolVersion: a2aProtocolVersionSchema,
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
    protocolVersions: z.array(a2aProtocolVersionSchema).min(1),
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
    card.protocolVersions.forEach((version, index) => {
      if (
        !card.supportedInterfaces.some(
          (agentInterface) => agentInterface.protocolVersion === version
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['protocolVersions', index],
          message: `protocolVersion "${version}" has no supported interface`,
        });
      }
    });
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
