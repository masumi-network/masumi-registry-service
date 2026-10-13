import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiKey } from './api/generated';
import { canAccessPath, describeUsage, isAdminKey } from './permissions';

function key(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-1',
    permission: 'User',
    usageLimited: false,
    maxUsageCredits: null,
    accumulatedUsageCredits: null,
    status: 'Active',
    ...overrides,
  };
}

describe('isAdminKey', () => {
  it('accepts only an active admin key', () => {
    assert.equal(isAdminKey(key({ permission: 'Admin' })), true);
    assert.equal(isAdminKey(key({ permission: 'Admin', status: 'Revoked' })), false);
    assert.equal(isAdminKey(key()), false);
    assert.equal(isAdminKey(undefined), false);
  });
});

describe('canAccessPath', () => {
  it('lets an admin open any page', () => {
    assert.equal(canAccessPath('/api-keys', true), true);
  });

  it('lets a user open only the listed pages', () => {
    assert.equal(canAccessPath('/', false), true);
    assert.equal(canAccessPath('/404', false), true);
    assert.equal(canAccessPath('/api-keys', false), false);
  });

  it('never treats the root entry as a prefix for every page', () => {
    assert.equal(canAccessPath('/registry-sources', false), false);
    assert.equal(canAccessPath('//', false), false);
  });

  it('does not match a page that only shares a name prefix', () => {
    assert.equal(canAccessPath('/4040', false), false);
  });
});

describe('describeUsage', () => {
  it('reports an unlimited key with no limit', () => {
    assert.deepEqual(describeUsage(key({ accumulatedUsageCredits: 5 })), {
      used: 5,
      limit: null,
    });
  });

  it('never presents a limited key without a maximum as unlimited', () => {
    assert.deepEqual(describeUsage(key({ usageLimited: true })), { used: 0, limit: 0 });
  });

  it('reports the maximum of a limited key', () => {
    assert.deepEqual(
      describeUsage(key({ usageLimited: true, maxUsageCredits: 100, accumulatedUsageCredits: 7 })),
      { used: 7, limit: 100 },
    );
  });
});
