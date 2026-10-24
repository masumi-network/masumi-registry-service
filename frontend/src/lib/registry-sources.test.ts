import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maskSecret, validateNewSource, type SourceDraft } from './registry-sources';

const POLICY = 'a'.repeat(56);
const draft = (patch: Partial<SourceDraft> = {}): SourceDraft => ({
  policyId: POLICY,
  network: 'Preprod',
  rpcProviderApiKey: 'preprodKEY',
  note: '',
  ...patch,
});

describe('validateNewSource', () => {
  it('accepts a 56-hex policy id with a key', () => {
    assert.deepEqual(validateNewSource(draft(), []), {});
  });

  it('rejects a policy id that is not 56 hex characters', () => {
    assert.ok(validateNewSource(draft({ policyId: 'abc' }), []).policyId);
    assert.ok(validateNewSource(draft({ policyId: 'z'.repeat(56) }), []).policyId);
  });

  it('accepts upper-case hex, which the form lower-cases before sending', () => {
    assert.deepEqual(validateNewSource(draft({ policyId: 'A'.repeat(56) }), []), {});
  });

  it('requires the Blockfrost key', () => {
    assert.ok(validateNewSource(draft({ rpcProviderApiKey: '  ' }), []).rpcProviderApiKey);
  });

  it('rejects a policy already registered on the same network, but not on the other one', () => {
    const existing = [{ policyId: POLICY, network: 'Preprod' as const }];
    assert.ok(validateNewSource(draft(), existing).policyId);
    assert.deepEqual(validateNewSource(draft({ network: 'Mainnet' }), existing), {});
  });
});

describe('maskSecret', () => {
  it('shows only the last four characters', () => {
    assert.equal(maskSecret('preprodABCDEFGH1234'), '••••1234');
    assert.equal(maskSecret('abc'), '••••');
    assert.equal(maskSecret(null), '—');
  });
});
