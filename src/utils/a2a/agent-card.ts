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

// Stop on the first invalid item. Untrusted arrays must not multiply validation errors.
function agentCardArray<T>(schema: z.ZodType<T>, minLength = 0) {
  return z
    .array(z.unknown())
    .min(minLength)
    .transform((items, ctx) => {
      const values: T[] = [];
      for (const [index, item] of items.entries()) {
        const parsed = schema.safeParse(item);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            ctx.addIssue({
              ...issue,
              path: [index, ...issue.path],
              fatal: true,
            });
          }
          return z.NEVER;
        }
        values.push(parsed.data);
      }
      return values;
    });
}

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
  tags: agentCardArray(z.string()),
  inputModes: agentCardArray(z.string()),
  outputModes: agentCardArray(z.string()),
  examples: agentCardArray(z.string()).optional(),
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
    extensions: agentCardArray(agentCardExtensionSchema).optional(),
  })
  .passthrough();

export const agentCardSchema = z
  .object({
    protocolVersions: agentCardArray(a2aProtocolVersionSchema, 1),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    supportedInterfaces: agentCardArray(agentCardInterfaceSchema, 1),
    capabilities: agentCardCapabilitiesSchema,
    defaultInputModes: agentCardArray(z.string()),
    defaultOutputModes: agentCardArray(z.string()),
    skills: agentCardArray(agentCardSkillSchema, 1),
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
    const protocolVersions = new Set(card.protocolVersions);
    const interfaceVersions = new Set(
      card.supportedInterfaces.map(
        (agentInterface) => agentInterface.protocolVersion
      )
    );
    for (const [index, version] of card.protocolVersions.entries()) {
      if (!interfaceVersions.has(version)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['protocolVersions', index],
          message: `protocolVersion "${version}" has no supported interface`,
        });
        break;
      }
    }
    for (const [index, agentInterface] of card.supportedInterfaces.entries()) {
      if (!protocolVersions.has(agentInterface.protocolVersion)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['supportedInterfaces', index, 'protocolVersion'],
          message: `protocolVersion "${agentInterface.protocolVersion}" is not listed in protocolVersions`,
        });
        break;
      }
    }
  });
