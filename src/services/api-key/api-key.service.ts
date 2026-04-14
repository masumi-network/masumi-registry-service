import { apiKeyRepository } from '@/repositories/api-key';
import { APIKeyStatus } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { Permission } from '@prisma/client';
async function getApiKey(
  cursorId: string | undefined,
  limit: number | undefined
) {
  return await apiKeyRepository.getApiKeyByCursorId(cursorId, limit);
}
async function addApiKey(
  permission: Permission,
  usageLimited: boolean,
  maxUsageCredits: number
) {
  const apiKeyToken =
    'masumi-registry-' +
    (permission == Permission.Admin ? 'admin-' : 'user-') +
    createId();
  const createdApiKey = await apiKeyRepository.addApiKey(
    apiKeyToken,
    permission,
    usageLimited,
    maxUsageCredits
  );

  return {
    ...createdApiKey,
    token: apiKeyToken,
  };
}
async function updateApiKey(
  apiKey: string,
  status: APIKeyStatus,
  usageLimited: boolean,
  maxUsageCredits: number
) {
  return await apiKeyRepository.updateApiKeyViaApiKey(
    apiKey,
    status,
    usageLimited,
    maxUsageCredits
  );
}
async function deleteApiKey(apiKey: string) {
  return await apiKeyRepository.deleteApiKeyViaApiKey(apiKey);
}

export const apiKeyService = {
  getApiKey,
  addApiKey,
  updateApiKey,
  deleteApiKey,
};
