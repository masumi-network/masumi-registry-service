import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { InternalAxiosRequestConfig } from 'axios';
import { getApiKeyStatus, getHealth } from './generated';
import { client } from './generated/client.gen';
import { createClientConfig, setApiKey } from './config';

let sent: InternalAxiosRequestConfig[] = [];

beforeEach(() => {
  sent = [];
  setApiKey(null);
  // Capture the outgoing request instead of hitting the network.
  client.setConfig({
    adapter: async (config) => {
      sent.push(config);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    },
  });
});

test('base URL defaults to the same-origin API and drops trailing slashes', () => {
  const original = process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL;
  try {
    delete process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL;
    assert.equal(createClientConfig().baseURL, '/api/v1');
    process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL = 'http://localhost:3000/api/v1/';
    assert.equal(createClientConfig().baseURL, 'http://localhost:3000/api/v1');
  } finally {
    process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL = original;
    if (original === undefined) delete process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL;
  }
});

test('requests go to the configured base URL', async () => {
  await getHealth();
  // hey-api folds the base URL into `url` before handing off to axios.
  assert.equal(sent[0].url, `${client.getConfig().baseURL}/health/`);
});

test('secured operations send the API key in the token header', async () => {
  setApiKey('test-key');
  await getApiKeyStatus();
  assert.equal(sent[0].headers.get('token'), 'test-key');
});

test('public operations never send the API key', async () => {
  setApiKey('test-key');
  await getHealth();
  assert.equal(sent[0].headers.has('token'), false);
});

test('clearing the key stops sending it', async () => {
  setApiKey('test-key');
  setApiKey(null);
  await getApiKeyStatus();
  assert.equal(sent[0].headers.has('token'), false);
});
