/* eslint-disable @typescript-eslint/no-require-imports */
import { testMiddleware } from 'express-zod-api';
import { authMiddleware } from './index';
import { $Enums } from '@prisma/client';

jest.mock('@/utils/db', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
    },
  },
}));

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if no token provided', async () => {
    const { responseMock } = await testMiddleware({
      middleware: authMiddleware(false),
      requestProps: { method: 'POST', body: {}, headers: {} },
      ctx: {},
    });
    expect(responseMock.statusCode).toBe(401);
  });
  it('should return 401 if invalid token', async () => {
    const { prisma } = require('@/utils/db');
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);

    const { responseMock } = await testMiddleware({
      middleware: authMiddleware(false),
      requestProps: {
        method: 'POST',
        body: {},
        headers: { token: 'invalid' },
      },
      ctx: {},
    });
    expect(responseMock.statusCode).toBe(401);
  });

  it('should return 401 if admin required but user is not admin', async () => {
    const { prisma } = require('@/utils/db');
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      permission: $Enums.Permission.User,
      accumulatedUsageCredits: 0,
      maxUsageCredits: 100,
      status: $Enums.APIKeyStatus.Active,
      usageLimited: true,
    });

    const { responseMock } = await testMiddleware({
      middleware: authMiddleware(true),
      requestProps: { method: 'POST', body: {}, headers: { token: 'valid' } },
      ctx: {},
    });
    expect(responseMock.statusCode).toBe(401);
  });
  it('should return 401 if api key is revoked (user)', async () => {
    const { prisma } = require('@/utils/db');
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      permission: $Enums.Permission.User,
      accumulatedUsageCredits: 0,
      maxUsageCredits: 100,
      status: $Enums.APIKeyStatus.Revoked,
      usageLimited: true,
    });

    const { responseMock } = await testMiddleware({
      middleware: authMiddleware(false),
      requestProps: { method: 'POST', body: {}, headers: { token: 'valid' } },
      ctx: {},
    });
    expect(responseMock.statusCode).toBe(401);
  });
  it('should return 401 if api key is revoked (admin)', async () => {
    const { prisma } = require('@/utils/db');
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      permission: $Enums.Permission.Admin,
      accumulatedUsageCredits: 0,
      maxUsageCredits: 100,
      status: $Enums.APIKeyStatus.Revoked,
      usageLimited: true,
    });

    const { responseMock } = await testMiddleware({
      middleware: authMiddleware(true),
      requestProps: { method: 'POST', body: {}, headers: { token: 'valid' } },
      ctx: {},
    });
    expect(responseMock.statusCode).toBe(401);
  });

  it('should pass validation with valid user token', async () => {
    const mockApiKey = {
      id: 1,
      permission: $Enums.Permission.User,
      accumulatedUsageCredits: 0,
      status: $Enums.APIKeyStatus.Active,
      maxUsageCredits: 100,
      usageLimited: true,
    };
    const { prisma } = require('@/utils/db');
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);

    const { output } = await testMiddleware({
      middleware: authMiddleware(false),
      requestProps: { method: 'POST', body: {}, headers: { token: 'valid' } },
      ctx: {},
    });

    expect(output).toEqual({
      id: mockApiKey.id,
      permissions: [mockApiKey.permission],
      accumulatedUsageCredits: mockApiKey.accumulatedUsageCredits,
      maxUsageCredits: mockApiKey.maxUsageCredits,
      usageLimited: mockApiKey.usageLimited,
    });
  });

  it('should pass validation with valid admin token', async () => {
    const mockApiKey = {
      id: 1,
      permission: $Enums.Permission.Admin,
      accumulatedUsageCredits: 0,
      maxUsageCredits: 100,
      status: $Enums.APIKeyStatus.Active,
      usageLimited: true,
    };
    const { prisma } = require('@/utils/db');
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);

    const { output } = await testMiddleware({
      middleware: authMiddleware(true),
      requestProps: { method: 'POST', body: {}, headers: { token: 'valid' } },
      ctx: {},
    });

    expect(output).toEqual({
      id: mockApiKey.id,
      permissions: [mockApiKey.permission],
      accumulatedUsageCredits: mockApiKey.accumulatedUsageCredits,
      maxUsageCredits: mockApiKey.maxUsageCredits,
      usageLimited: mockApiKey.usageLimited,
    });
  });
});
