type CursorKey = string | number;

const toCursorKey = (value: CursorKey | null | undefined): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return null;
};

/** Merge pages from an inclusive cursor API (cursor row is repeated on the next page). */
export function flattenInclusiveCursorPages<T>(
  pages: readonly (readonly T[])[],
  getKey: (item: T) => CursorKey | null | undefined,
): T[] {
  const seenKeys = new Set<string>();
  const merged: T[] = [];

  for (const pageItems of pages) {
    for (const item of pageItems) {
      const key = toCursorKey(getKey(item));
      if (key === null) {
        merged.push(item);
        continue;
      }
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      merged.push(item);
    }
  }

  return merged;
}
