import { metadataStringConvert } from './index';

describe('metadataStringConvert', () => {
  it('should return null when input is undefined', () => {
    expect(metadataStringConvert(undefined)).toBeNull();
  });

  it('should return the same string when input is a non-empty string', () => {
    const input = 'test string';
    expect(metadataStringConvert(input)).toBe(input);
  });

  it('should trim leading and trailing whitespace', () => {
    expect(metadataStringConvert('  test  ')).toBe('test');
    expect(metadataStringConvert('\n\ttest\n\t')).toBe('test');
  });

  it('should join array of strings', () => {
    const input = ['this is ', 'a test ', 'string'];
    expect(metadataStringConvert(input)).toBe('this is a test string');
  });

  it('should join and trim array of strings', () => {
    const input = ['  hello ', ' world  '];
    expect(metadataStringConvert(input)).toBe('hello  world');
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

  it('should preserve internal whitespace', () => {
    expect(metadataStringConvert('hello  world')).toBe('hello  world');
  });
});
