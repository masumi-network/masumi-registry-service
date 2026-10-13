import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { httpUrl } from './utils';

describe('httpUrl', () => {
  it('accepts http and https URLs', () => {
    assert.equal(httpUrl('https://agent.example/docs'), 'https://agent.example/docs');
    assert.equal(httpUrl('http://agent.example'), 'http://agent.example/');
  });

  it('never turns a script or data URL into a link', () => {
    assert.equal(httpUrl('javascript:alert(1)'), null);
    assert.equal(httpUrl(' JavaScript:alert(1)'), null);
    assert.equal(httpUrl('data:text/html,<script>alert(1)</script>'), null);
  });

  it('rejects missing and malformed values', () => {
    assert.equal(httpUrl(null), null);
    assert.equal(httpUrl(''), null);
    assert.equal(httpUrl('not a url'), null);
  });
});
