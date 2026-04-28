import { z } from '@/utils/zod-openapi';
import { InboxAgentRegistrationStatus, Network } from '@prisma/client';

export const searchInboxAgentRegistrationSchemaInput = z.object({
  network: z.nativeEnum(Network),
  query: z.string().min(1).max(80),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  status: z.array(z.nativeEnum(InboxAgentRegistrationStatus)).max(4).optional(),
  policyId: z.string().min(1).max(250).optional(),
});
