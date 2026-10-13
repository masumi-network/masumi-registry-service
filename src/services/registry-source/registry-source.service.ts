import { registrySourceRepository } from '@/repositories/registry-source';
import {
  addRegistrySourceSchemaInput,
  updateRegistrySourceSchemaInput,
} from '@/routes/api/registry-source';
import { z } from 'zod';
async function getRegistrySources(cursorId: string | undefined, limit: number) {
  return await registrySourceRepository.getRegistrySource(cursorId, limit);
}

async function addRegistrySource(
  input: z.infer<typeof addRegistrySourceSchemaInput>
) {
  return await registrySourceRepository.addRegistrySource(input);
}

async function updateRegistrySource(
  input: z.infer<typeof updateRegistrySourceSchemaInput>
) {
  return await registrySourceRepository.updateRegistrySource(input);
}

async function deleteRegistrySource(id: string) {
  return await registrySourceRepository.deleteRegistrySource(id);
}

export const registrySourceService = {
  getRegistrySources,
  addRegistrySource,
  updateRegistrySource,
  deleteRegistrySource,
};
