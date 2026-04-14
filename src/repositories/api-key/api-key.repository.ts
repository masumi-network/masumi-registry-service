import { hashToken } from '@/utils/crypto';
import { prisma } from '@/utils/db';
import { APIKeyStatus, Permission, Prisma } from '@prisma/client';

const apiKeyMetadataSelect = {
  id: true,
  permission: true,
  usageLimited: true,
  maxUsageCredits: true,
  accumulatedUsageCredits: true,
  status: true,
} satisfies Prisma.ApiKeySelect;

async function getApiKeyByCursorId(
  cursorId: string | undefined,
  limit: number | undefined
) {
  return await prisma.apiKey.findMany({
    cursor: cursorId ? { id: cursorId } : undefined,
    take: limit ?? 10,
    select: apiKeyMetadataSelect,
  });
}
async function getApiKeyById(id: string) {
  return await prisma.apiKey.findUnique({
    where: { id },
    select: apiKeyMetadataSelect,
  });
}
async function getApiKeyByApiKey(token: string) {
  return await prisma.apiKey.findUnique({
    where: { tokenHash: hashToken(token) },
    select: apiKeyMetadataSelect,
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
      status: APIKeyStatus.Active,
      permission,
      usageLimited,
      maxUsageCredits,
      accumulatedUsageCredits: 0,
      tokenHash: hashToken(token),
    },
    select: apiKeyMetadataSelect,
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
    select: apiKeyMetadataSelect,
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
    select: apiKeyMetadataSelect,
  });
}
async function deleteApiKeyViaId(id: string) {
  return await prisma.apiKey.delete({
    where: { id },
    select: apiKeyMetadataSelect,
  });
}
async function deleteApiKeyViaApiKey(token: string) {
  return await prisma.apiKey.delete({
    where: { tokenHash: hashToken(token) },
    select: apiKeyMetadataSelect,
  });
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
