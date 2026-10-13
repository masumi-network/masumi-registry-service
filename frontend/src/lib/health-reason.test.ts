import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explainStatus, specUrl } from './health-reason';

type Entry = Parameters<typeof explainStatus>[0];

function entry(overrides: Partial<Entry>): Entry {
  return {
    status: 'Offline',
    type: 'Standard',
    apiBaseUrl: 'https://agent.example',
    openApiSpecUrl: null,
    x402ResourcesUrl: null,
    A2A: null,
    ...overrides,
  } as Entry;
}

describe('explainStatus', () => {
  it('gives no reason for an Online entry', () => {
    assert.equal(explainStatus(entry({ status: 'Online' })), null);
  });

  it('names the availability endpoint of a Standard entry', () => {
    assert.match(explainStatus(entry({}))!, /https:\/\/agent\.example\/availability/);
  });

  it('says when a spec entry has no spec URL', () => {
    assert.match(
      explainStatus(entry({ status: 'Invalid', type: 'OpenApi' }))!,
      /no OpenAPI document URL/,
    );
  });

  it('explains a burned NFT for Deregistered', () => {
    assert.match(explainStatus(entry({ status: 'Deregistered' }))!, /burned/);
  });
});

describe('specUrl', () => {
  it('reads the URL field that matches the entry type', () => {
    assert.equal(specUrl(entry({ type: 'Standard' })), null);
    assert.equal(
      specUrl(entry({ type: 'OpenApi', openApiSpecUrl: 'https://a/openapi.json' })),
      'https://a/openapi.json',
    );
    assert.equal(
      specUrl(entry({ type: 'X402', x402ResourcesUrl: 'https://a/x402' })),
      'https://a/x402',
    );
  });
});
