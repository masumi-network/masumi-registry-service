import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseThemePreference, resolveTheme } from './theme';

describe('parseThemePreference', () => {
  it('keeps a known preference', () => {
    assert.equal(parseThemePreference('light'), 'light');
    assert.equal(parseThemePreference('dark'), 'dark');
    assert.equal(parseThemePreference('auto'), 'auto');
  });

  it('falls back to auto for a missing or unknown value', () => {
    assert.equal(parseThemePreference(null), 'auto');
    assert.equal(parseThemePreference(''), 'auto');
    assert.equal(parseThemePreference('DARK'), 'auto');
    assert.equal(parseThemePreference('purple'), 'auto');
  });
});

describe('resolveTheme', () => {
  it('uses an explicit preference whatever the system says', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });

  it('follows the system on auto', () => {
    assert.equal(resolveTheme('auto', true), 'dark');
    assert.equal(resolveTheme('auto', false), 'light');
  });
});
