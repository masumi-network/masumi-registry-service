import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { classifyAuthError } from './errors';

function httpError(status: number): AxiosError {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data: { error: 'server text that must not reach the UI' },
  } as AxiosResponse);
}

describe('classifyAuthError', () => {
  it('rejects the key on 401', () => {
    assert.equal(classifyAuthError(httpError(401)).kind, 'rejected');
  });

  it('marks a valid key without permission as forbidden on 403', () => {
    assert.equal(classifyAuthError(httpError(403)).kind, 'forbidden');
  });

  it('treats a network failure as unavailable', () => {
    assert.equal(classifyAuthError(new AxiosError('Network Error')).kind, 'unavailable');
    assert.equal(classifyAuthError(new Error('boom')).kind, 'unavailable');
  });

  it('treats a server error as unavailable and names only the status', () => {
    const failure = classifyAuthError(httpError(503));
    assert.equal(failure.kind, 'unavailable');
    assert.match(failure.message, /503/);
    assert.doesNotMatch(failure.message, /server text/);
  });
});
