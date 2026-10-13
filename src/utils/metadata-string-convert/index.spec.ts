import {
  isNonBlankMetadataString,
  metadataStringConvert,
  metadataStringJoin,
} from './index';

describe('metadataStringConvert', () => {
  it('should return null when input is undefined', () => {
    expect(metadataStringConvert(undefined)).toBeNull();
  });

  it('should return null when input is null', () => {
    expect(metadataStringConvert(null)).toBeNull();
  });

  it('should return the same string when input is a non-empty string', () => {
    const input = 'test string';
    expect(metadataStringConvert(input)).toBe(input);
  });

  it('should not trim non-blank values', () => {
    expect(metadataStringConvert('  test  ')).toBe('  test  ');
    expect(metadataStringConvert(['  hello ', ' world  '])).toBe(
      '  hello  world  '
    );
  });

  it('should join array of strings', () => {
    const input = ['this is ', 'a test ', 'string'];
    expect(metadataStringConvert(input)).toBe('this is a test string');
  });

  it('should return null for empty array', () => {
    expect(metadataStringConvert([])).toBeNull();
  });

  it('should return null for array with empty strings', () => {
    expect(metadataStringConvert(['', '', ''])).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(metadataStringConvert('')).toBeNull();
  });

  it('should return null for whitespace-only string', () => {
    expect(metadataStringConvert('   ')).toBeNull();
    expect(metadataStringConvert('\n\t\r')).toBeNull();
  });

  it('should return null for whitespace-only array', () => {
    expect(metadataStringConvert(['  ', '\t', '\n'])).toBeNull();
  });

  it('should handle array with single string', () => {
    expect(metadataStringConvert(['single'])).toBe('single');
  });

  it('should keep an array whose blank chunks join to a non-blank value', () => {
    expect(metadataStringConvert(['a', ' ', 'b'])).toBe('a b');
  });
});

describe('isNonBlankMetadataString', () => {
  it('should reject blank values', () => {
    expect(isNonBlankMetadataString('')).toBe(false);
    expect(isNonBlankMetadataString('  ')).toBe(false);
    expect(isNonBlankMetadataString([])).toBe(false);
    expect(isNonBlankMetadataString(['', ' '])).toBe(false);
  });

  it('should accept non-blank values', () => {
    expect(isNonBlankMetadataString('a')).toBe(true);
    expect(isNonBlankMetadataString(['', 'a'])).toBe(true);
  });
});

describe('metadataStringJoin', () => {
  it('should return null for missing values', () => {
    expect(metadataStringJoin(undefined)).toBeNull();
    expect(metadataStringJoin(null)).toBeNull();
  });

  it('should keep empty strings', () => {
    expect(metadataStringJoin('')).toBe('');
    expect(metadataStringJoin([])).toBe('');
    expect(metadataStringJoin(['', ''])).toBe('');
  });

  it('should join array of strings', () => {
    expect(metadataStringJoin(['ab', 'cd'])).toBe('abcd');
  });
});
