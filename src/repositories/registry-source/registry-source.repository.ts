import {
  addRegistrySourceSchemaInput,
  updateRegistrySourceSchemaInput,
} from '@/routes/api/registry-source';
import { prisma } from '@/utils/db';
import { RPCProvider } from '@prisma/client';
import { z } from '@/utils/zod-openapi';

async function getRegistrySource(
  cursorId: string | undefined,
  limit: number | undefined
) {
  return await prisma.registrySource.findMany({
    cursor: cursorId ? { id: cursorId } : undefined,
    take: limit,
    orderBy: [{ createdAt: 'desc' }],
    include: { RegistrySourceConfig: true },
  });
}

async function addRegistrySource(
  input: z.infer<typeof addRegistrySourceSchemaInput>
) {
  return await prisma.registrySource.create({
    data: {
      type: input.type,
      policyId: input.policyId,
      note: input.note,
      network: input.network,
      lastCheckedPage: 1,
      RegistrySourceConfig: {
        create: {
          rpcProviderApiKey: input.rpcProviderApiKey,
          rpcProvider: RPCProvider.Blockfrost,
        },
      },
    },
  });
}

async function updateRegistrySource(
  input: z.infer<typeof updateRegistrySourceSchemaInput>
) {
  return await prisma.registrySource.update({
    where: { id: input.id },
    data: {
      note: input.note,
      RegistrySourceConfig: {
        update: { rpcProviderApiKey: input.rpcProviderApiKey },
      },
    },
  });
}

async function deleteRegistrySource(id: string) {
  return await prisma.registrySource.delete({
    where: { id },
    include: { RegistrySourceConfig: true },
  });
}

export const registrySourceRepository = {
  getRegistrySource,
  addRegistrySource,
  updateRegistrySource,
  deleteRegistrySource,
};
