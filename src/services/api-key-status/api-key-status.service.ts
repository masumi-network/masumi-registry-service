import { apiKeyRepository } from '@/repositories/api-key';
async function getApiKeyStatus(id: string) {
  return await apiKeyRepository.getApiKeyById(id);
}

export const apiKeyStatusService = { getApiKeyStatus };
