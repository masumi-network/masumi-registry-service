import { z } from '@/utils/zod-openapi';

export const agentCardSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  supportedInterfaces: z
    .array(
      z.object({
        url: z.string().url(),
        protocolBinding: z.string(),
        protocolVersion: z.string(),
        tenant: z.string().optional(),
      })
    )
    .min(1),
  provider: z
    .object({
      organization: z.string(),
      url: z.string().url(),
    })
    .optional(),
  documentationUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  capabilities: z.object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    extendedAgentCard: z.boolean().optional(),
    extensions: z
      .array(
        z.object({
          uri: z.string(),
          description: z.string().optional(),
          required: z.boolean().optional(),
          params: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
  }),
  defaultInputModes: z.array(z.string()),
  defaultOutputModes: z.array(z.string()),
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      examples: z.array(z.string()).optional(),
      inputModes: z.array(z.string()).optional(),
      outputModes: z.array(z.string()).optional(),
      securityRequirements: z.array(z.record(z.unknown())).optional(),
    })
  ),
  securitySchemes: z.record(z.unknown()).optional(),
  securityRequirements: z.array(z.record(z.unknown())).optional(),
  signatures: z.array(z.unknown()).optional(),
});

export type AgentCard = z.infer<typeof agentCardSchema>;
