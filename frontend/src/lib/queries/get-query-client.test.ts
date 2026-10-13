import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { shouldRetry } from './get-query-client';

function httpError(status: number): AxiosError {
  return new AxiosError('failed', undefined, undefined, undefined, { status } as AxiosResponse);
}

describe('shouldRetry', () => {
  it('retries an unreachable API once', () => {
    assert.equal(shouldRetry(0, new AxiosError('Network Error')), true);
    assert.equal(shouldRetry(1, new AxiosError('Network Error')), false);
  });

  it('never retries a rejected or forbidden key', () => {
    assert.equal(shouldRetry(0, httpError(401)), false);
    assert.equal(shouldRetry(0, httpError(403)), false);
  });
});
