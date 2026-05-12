import { z } from '@/utils/zod-openapi';

export const agentCardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000),
  version: z.string().max(50),
  supportedInterfaces: z
    .array(
      z.object({
        url: z.string().url().max(2048),
        protocolBinding: z.string().max(100),
        protocolVersion: z.string().max(50),
        tenant: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(20),
  provider: z
    .object({
      organization: z.string().max(200),
      url: z.string().url().max(2048),
    })
    .optional(),
  documentationUrl: z.string().url().max(2048).optional(),
  iconUrl: z.string().url().max(2048).optional(),
  capabilities: z.object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    extendedAgentCard: z.boolean().optional(),
    extensions: z
      .array(
        z.object({
          uri: z.string().max(2048),
          description: z.string().max(1000).optional(),
          required: z.boolean().optional(),
          params: z.record(z.unknown()).optional(),
        })
      )
      .max(20)
      .optional(),
  }),
  defaultInputModes: z.array(z.string().max(100)).max(20),
  defaultOutputModes: z.array(z.string().max(100)).max(20),
  skills: z
    .array(
      z.object({
        id: z.string().max(200),
        name: z.string().max(200),
        description: z.string().max(5000),
        tags: z.array(z.string().max(100)).max(50),
        examples: z.array(z.string().max(2000)).max(100).optional(),
        inputModes: z.array(z.string().max(100)).max(20).optional(),
        outputModes: z.array(z.string().max(100)).max(20).optional(),
        securityRequirements: z.array(z.record(z.unknown())).max(20).optional(),
      })
    )
    .max(100),
  securitySchemes: z.record(z.unknown()).optional(),
  securityRequirements: z.array(z.record(z.unknown())).max(20).optional(),
  signatures: z.array(z.unknown()).max(20).optional(),
});

export type AgentCard = z.infer<typeof agentCardSchema>;
