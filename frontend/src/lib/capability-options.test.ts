import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCapabilityOptions } from './capability-options';

describe('buildCapabilityOptions', () => {
  it('groups versions by name, newest first, names sorted', () => {
    const options = buildCapabilityOptions([
      { name: 'beta', version: '1.2' },
      { name: 'alpha', version: '1.10' },
      { name: 'alpha', version: '1.9' },
      { name: 'alpha', version: '1.10' },
    ]);
    assert.deepEqual(options, [
      { name: 'alpha', versions: ['1.10', '1.9'] },
      { name: 'beta', versions: ['1.2'] },
    ]);
  });

  it('keeps names verbatim and skips blank names and versions', () => {
    const options = buildCapabilityOptions([
      { name: 'foo ', version: ' ' },
      { name: '  ', version: '1.0' },
    ]);
    assert.deepEqual(options, [{ name: 'foo ', versions: [] }]);
  });
});
