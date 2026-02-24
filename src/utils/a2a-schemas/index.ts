import { z } from '@/utils/zod-openapi';

export const agentCardSchema = z.object({
  protocolVersions: z.array(z.string()),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  supportedInterfaces: z
    .array(
      z.object({
        url: z.string(),
        protocolBinding: z.string(),
        protocolVersion: z.string(),
      })
    )
    .min(1),
  provider: z
    .object({
      organization: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  documentationUrl: z.string().optional(),
  iconUrl: z.string().optional(),
  capabilities: z
    .object({
      streaming: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      extensions: z
        .array(
          z.object({
            uri: z.string(),
            description: z.string().optional(),
            required: z.boolean().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  defaultInputModes: z.array(z.string()),
  defaultOutputModes: z.array(z.string()),
  skills: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        examples: z.array(z.string()).optional(),
        inputModes: z.array(z.string()),
        outputModes: z.array(z.string()),
      })
    )
    .min(1),
});

export type AgentCard = z.infer<typeof agentCardSchema>;
