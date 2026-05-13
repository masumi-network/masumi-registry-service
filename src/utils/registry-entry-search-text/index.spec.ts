import {
  normalizeRegistryEntrySearchQuery,
  normalizeRegistryEntrySearchText,
} from './index';

describe('normalizeRegistryEntrySearchText', () => {
  it('normalizes casing and collapses whitespace', () => {
    expect(
      normalizeRegistryEntrySearchText('  ExAmple   Agent \n Search  ')
    ).toBe('example agent search');
  });
});

describe('normalizeRegistryEntrySearchQuery', () => {
  it('escapes postgres like wildcard characters after normalization', () => {
    expect(normalizeRegistryEntrySearchQuery('  100% _match\\test  ')).toBe(
      '100\\% \\_match\\\\test'
    );
  });
});
