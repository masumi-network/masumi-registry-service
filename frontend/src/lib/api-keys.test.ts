import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiKey } from '@/lib/api/generated';
import { buildApiKeyUpdate, describeApiKey, isValidUsageCredits } from './api-keys';

const limited: ApiKey = {
  id: 'key_1',
  permission: 'User',
  usageLimited: true,
  maxUsageCredits: 500,
  accumulatedUsageCredits: 120,
  status: 'Active',
};

describe('buildApiKeyUpdate', () => {
  it('revokes while keeping the limit: the API resets every field left out', () => {
    assert.deepEqual(buildApiKeyUpdate(limited, ' tok ', { status: 'Revoked' }), {
      token: 'tok',
      status: 'Revoked',
      usageLimited: true,
      maxUsageCredits: 500,
    });
  });

  it('changes the limit while keeping the status', () => {
    const revoked: ApiKey = { ...limited, status: 'Revoked' };
    assert.deepEqual(
      buildApiKeyUpdate(revoked, 'tok', { usageLimited: true, maxUsageCredits: 900 }),
      {
        token: 'tok',
        status: 'Revoked',
        usageLimited: true,
        maxUsageCredits: 900,
      },
    );
  });

  it('keeps a stored allowance when revoking an unlimited key', () => {
    const unlimited: ApiKey = { ...limited, usageLimited: false, maxUsageCredits: 250 };
    const body = buildApiKeyUpdate(unlimited, 'tok', { status: 'Revoked' });
    assert.equal(body.usageLimited, false);
    assert.equal(body.maxUsageCredits, 250);
  });
});

describe('isValidUsageCredits', () => {
  it('takes whole numbers from 0 to 1,000,000', () => {
    assert.equal(isValidUsageCredits('0'), true);
    assert.equal(isValidUsageCredits('1000000'), true);
    assert.equal(isValidUsageCredits('1000001'), false);
    assert.equal(isValidUsageCredits('1.5'), false);
    assert.equal(isValidUsageCredits(''), false);
  });
});

describe('describeApiKey', () => {
  it('names the key by permission, short id, status and usage', () => {
    assert.equal(
      describeApiKey({ ...limited, id: 'cm1234567890abcdef' }),
      'User key cm1234…cdef (Active, 120 of 500 credits used)',
    );
    assert.equal(
      describeApiKey({
        ...limited,
        id: 'short',
        usageLimited: false,
        accumulatedUsageCredits: null,
      }),
      'User key short (Active, 0 credits used, no limit)',
    );
  });
});
