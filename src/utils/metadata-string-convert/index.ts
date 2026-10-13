//internal helper to transform metadata strings as they can be either a string of length<63 or an array of strings <63
//e.g ["this is a very long ","string ","on the registry"] -> "this is a very long string on the registry"
//raw join that keeps empty strings, for fields where '' is meaningful (e.g. lovelace asset)
export const metadataStringJoin = (
  value: string | string[] | undefined | null
): string | null =>
  value == null ? null : typeof value === 'string' ? value : value.join('');

//blank values (empty or whitespace-only) map to null; non-blank values are returned untrimmed
export const metadataStringConvert = (
  value: string | string[] | undefined | null
): string | null => {
  const result = metadataStringJoin(value);
  return result == null || result.trim() === '' ? null : result;
};

//zod refine predicate for required metadata fields that must not be blank once joined
export const isNonBlankMetadataString = (value: string | string[]) =>
  metadataStringConvert(value) != null;
