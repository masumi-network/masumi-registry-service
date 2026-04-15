import { APIKeyStatus, Permission } from '@prisma/client';
import { testEndpoint } from 'express-zod-api';
import {
  addAPIKeyEndpointPost,
  deleteAPIKeyEndpointDelete,
  queryAPIKeyEndpointGet,
  updateAPIKeyEndpointPatch,
} from './index';
import { queryAPIKeyStatusEndpointGet } from '@/routes/api/api-key-status';
import { prisma } from '@/utils/db';
import { apiKeyService } from '@/services/api-key/';
import { apiKeyStatusService } from '@/services/api-key-status/';

jest.mock('@/utils/db', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/services/api-key/', () => ({
  apiKeyService: {
    getApiKey: jest.fn(),
    addApiKey: jest.fn(),
    updateApiKey: jest.fn(),
    deleteApiKey: jest.fn(),
  },
}));

jest.mock('@/services/api-key-status/', () => ({
  apiKeyStatusService: {
    getApiKeyStatus: jest.fn(),
  },
}));

const mockApiKeyMetadata = {
  id: 'api-key-id',
  permission: Permission.User,
  usageLimited: true,
  maxUsageCredits: 500,
  accumulatedUsageCredits: 15,
  status: APIKeyStatus.Active,
};

describe('api key endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 'admin-id',
      permission: Permission.Admin,
      usageLimited: false,
      maxUsageCredits: null,
      accumulatedUsageCredits: 0,
      status: APIKeyStatus.Active,
    });
  });

  it('returns the plaintext token only when creating an api key', async () => {
    (apiKeyService.addApiKey as jest.Mock).mockResolvedValue({
      ...mockApiKeyMetadata,
      token: 'fresh-api-key',
    });

    const { responseMock } = await testEndpoint({
      endpoint: addAPIKeyEndpointPost,
      requestProps: {
        method: 'POST',
        headers: { token: 'admin-token' },
        body: {
          permission: Permission.User,
          usageLimited: true,
          maxUsageCredits: 500,
        },
      },
    });

    expect(responseMock._getJSONData().data).toEqual({
      ...mockApiKeyMetadata,
      token: 'fresh-api-key',
    });
  });

  it('omits plaintext tokens from list responses', async () => {
    (apiKeyService.getApiKey as jest.Mock).mockResolvedValue([
      {
        ...mockApiKeyMetadata,
        token: 'should-not-leak',
      },
    ]);

    const { responseMock } = await testEndpoint({
      endpoint: queryAPIKeyEndpointGet,
      requestProps: {
        method: 'GET',
        headers: { token: 'admin-token' },
        query: {
          limit: '10',
        },
      },
    });

    expect(responseMock._getJSONData().data.apiKeys).toEqual([
      mockApiKeyMetadata,
    ]);
  });

  it('omits plaintext tokens from update responses', async () => {
    (apiKeyService.updateApiKey as jest.Mock).mockResolvedValue({
      ...mockApiKeyMetadata,
      token: 'should-not-leak',
    });

    const { responseMock } = await testEndpoint({
      endpoint: updateAPIKeyEndpointPatch,
      requestProps: {
        method: 'PATCH',
        headers: { token: 'admin-token' },
        body: {
          token: 'existing-token',
          usageLimited: true,
          maxUsageCredits: 500,
          status: APIKeyStatus.Active,
        },
      },
    });

    expect(responseMock._getJSONData().data).toEqual(mockApiKeyMetadata);
  });

  it('omits plaintext tokens from delete responses', async () => {
    (apiKeyService.deleteApiKey as jest.Mock).mockResolvedValue({
      ...mockApiKeyMetadata,
      token: 'should-not-leak',
    });

    const { responseMock } = await testEndpoint({
      endpoint: deleteAPIKeyEndpointDelete,
      requestProps: {
        method: 'DELETE',
        headers: { token: 'admin-token' },
        query: {
          token: 'existing-token',
        },
      },
    });

    expect(apiKeyService.deleteApiKey).toHaveBeenCalledWith('existing-token');
    expect(JSON.stringify(responseMock._getJSONData())).not.toContain(
      'should-not-leak'
    );
  });

  it('omits plaintext tokens from authenticated status responses', async () => {
    (apiKeyStatusService.getApiKeyStatus as jest.Mock).mockResolvedValue({
      ...mockApiKeyMetadata,
      token: 'should-not-leak',
    });

    const { responseMock } = await testEndpoint({
      endpoint: queryAPIKeyStatusEndpointGet,
      requestProps: {
        method: 'GET',
        headers: { token: 'user-token' },
      },
    });

    expect(responseMock._getJSONData().data).toEqual(mockApiKeyMetadata);
  });
});
