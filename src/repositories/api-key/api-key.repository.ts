import { hashToken } from '@/utils/crypto';
import { prisma } from '@/utils/db';
import { APIKeyStatus } from '@prisma/client';
import { Permission } from '@prisma/client';

async function getApiKeyByCursorId(
  cursorId: string | undefined,
  limit: number | undefined
) {
  return await prisma.apiKey.findMany({
    cursor: cursorId ? { id: cursorId } : undefined,
    take: limit ?? 10,
  });
}
async function getApiKeyById(id: string) {
  return await prisma.apiKey.findUnique({ where: { id } });
}
async function getApiKeyByApiKey(token: string) {
  return await prisma.apiKey.findUnique({
    where: { tokenHash: hashToken(token) },
  });
}

async function addApiKey(
  token: string,
  permission: Permission,
  usageLimited: boolean,
  maxUsageCredits: number
) {
  return await prisma.apiKey.create({
    data: {
      token,
      status: APIKeyStatus.Active,
      permission,
      usageLimited,
      maxUsageCredits,
      accumulatedUsageCredits: 0,
      tokenHash: hashToken(token),
    },
  });
}

async function updateApiKeyViaId(
  id: string,
  status: APIKeyStatus,
  usageLimited: boolean,
  maxUsageCredits: number
) {
  return await prisma.apiKey.update({
    where: { id },
    data: { status, usageLimited, maxUsageCredits },
  });
}

async function updateApiKeyViaApiKey(
  token: string,
  status: APIKeyStatus,
  usageLimited: boolean,
  maxUsageCredits: number
) {
  return await prisma.apiKey.update({
    where: { tokenHash: hashToken(token) },
    data: { status, usageLimited, maxUsageCredits },
  });
}
async function deleteApiKeyViaId(id: string) {
  return await prisma.apiKey.delete({ where: { id } });
}
async function deleteApiKeyViaApiKey(token: string) {
  return await prisma.apiKey.delete({ where: { tokenHash: hashToken(token) } });
}
export const apiKeyRepository = {
  getApiKeyById,
  getApiKeyByCursorId,
  getApiKeyByApiKey,
  addApiKey,
  updateApiKeyViaId,
  updateApiKeyViaApiKey,
  deleteApiKeyViaId,
  deleteApiKeyViaApiKey,
};
