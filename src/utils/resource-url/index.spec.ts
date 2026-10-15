import { canonicalUrl, isStorableUrl } from './index';

describe('isStorableUrl', () => {
  it('accepts an ordinary URL', () => {
    expect(isStorableUrl('https://a.example/v1/x?y=1')).toBe(true);
  });

  it.each([
    ['whitespace', 'https://a.example/a b'],
    ['a tab', 'https://a.example/a\tb'],
    ['a NUL', 'https://a.example/a\u0000b'],
    ['a bidi override', 'https://a.example/\u202ex'],
    [
      'more than the unique index can hold',
      `https://a.example/${'x'.repeat(2100)}`,
    ],
  ])('rejects a URL with %s', (_label, value) => {
    expect(isStorableUrl(value)).toBe(false);
  });
});

describe('canonicalUrl', () => {
  it('folds host case, the default port and the fragment', () => {
    expect(canonicalUrl('HTTPS://A.EXAMPLE:443/one#frag')).toBe(
      'https://a.example/one'
    );
  });

  it('keeps the path and query significant', () => {
    expect(canonicalUrl('https://a.example/one/?q=1')).toBe(
      'https://a.example/one/?q=1'
    );
  });

  it('returns null for something that is not a URL', () => {
    expect(canonicalUrl('not a url')).toBeNull();
  });
});
