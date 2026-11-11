import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { outcomeForStatus, outcomeForStatusError } from './restore-outcome';

function httpError(status: number): AxiosError {
  return new AxiosError('failed', undefined, undefined, undefined, { status } as AxiosResponse);
}

describe('outcomeForStatusError (the saved key could not be checked)', () => {
  it('sends the user to sign-in and drops the key when the registry rejects it with 401', () => {
    assert.deepEqual(outcomeForStatusError(httpError(401)), {
      kind: 'sign-in',
      clearStoredKey: true,
    });
  });

  it('does the same for 403', () => {
    assert.deepEqual(outcomeForStatusError(httpError(403)), {
      kind: 'sign-in',
      clearStoredKey: true,
    });
  });

  it('keeps the key and reports the registry as unavailable on a 503', () => {
    assert.deepEqual(outcomeForStatusError(httpError(503)), { kind: 'unavailable' });
  });

  it('treats any other server error as unavailable, not as a bad key', () => {
    for (const status of [500, 502, 504, 429]) {
      assert.equal(outcomeForStatusError(httpError(status)).kind, 'unavailable');
    }
  });

  it('treats a network failure with no response as unavailable', () => {
    assert.equal(outcomeForStatusError(new AxiosError('Network Error')).kind, 'unavailable');
    assert.equal(outcomeForStatusError(new Error('boom')).kind, 'unavailable');
    assert.equal(outcomeForStatusError(undefined).kind, 'unavailable');
  });
});

describe('outcomeForStatus (the registry answered)', () => {
  it('accepts an active admin key', () => {
    assert.deepEqual(outcomeForStatus({ status: 'Active', permission: 'Admin' }), {
      kind: 'ready',
    });
  });

  it('drops a revoked admin key without a notice', () => {
    assert.deepEqual(outcomeForStatus({ status: 'Revoked', permission: 'Admin' }), {
      kind: 'sign-in',
      clearStoredKey: true,
    });
  });

  it('drops a non-admin key and says why', () => {
    for (const status of ['Active', 'Revoked']) {
      assert.deepEqual(outcomeForStatus({ status, permission: 'User' }), {
        kind: 'sign-in',
        clearStoredKey: true,
        notice: 'Unauthorized access',
      });
    }
  });

  it('keeps the key when a 200 carries no status, as a proxy error page can', () => {
    assert.deepEqual(outcomeForStatus(undefined), { kind: 'unavailable' });
    assert.deepEqual(outcomeForStatus(null), { kind: 'unavailable' });
  });
});
