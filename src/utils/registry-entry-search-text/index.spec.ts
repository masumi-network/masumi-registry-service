import {
  buildRegistryEntrySearchText,
  normalizeRegistryEntrySearchQuery,
  normalizeRegistryEntrySearchText,
} from './index';

describe('buildRegistryEntrySearchText', () => {
  it('omits null and empty fields', () => {
    expect(
      buildRegistryEntrySearchText({
        name: 'Example Agent',
        description: '   ',
        authorName: null,
        authorOrganization: undefined,
        apiBaseUrl: 'https://example.com/api',
        assetIdentifier: 'asset123',
        tags: ['', '  ', 'tag-one'],
      })
    ).toBe('example agent https://example.com/api asset123 tag-one');
  });

  it('includes capability values and tags', () => {
    expect(
      buildRegistryEntrySearchText({
        name: 'Example Agent',
        capabilityName: 'Text Generation',
        capabilityVersion: '1.0.0',
        tags: ['chat', 'summarization'],
      })
    ).toBe('example agent text generation 1.0.0 chat summarization');
  });
});

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
