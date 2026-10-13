// The registry's list endpoints use Prisma's `cursor` without `skip`, so a page requested
// with `cursorId = X` starts with row X again. These helpers make that inclusive cursor
// behave like ordinary forward pagination. Ported in spirit from the payment service
// admin frontend (src/lib/pagination/cursor-pagination.ts).

type GetKey<T> = (item: T) => string;

/** Appends a page, skipping every row whose key is already present. */
function appendInclusiveCursorPage<T>(
  existingItems: readonly T[],
  nextPageItems: readonly T[],
  getKey: GetKey<T>,
): T[] {
  const seenKeys = new Set(existingItems.map(getKey));
  const added = nextPageItems.filter((item) => {
    const key = getKey(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  return [...existingItems, ...added];
}

export function flattenInclusiveCursorPages<T>(
  pages: readonly (readonly T[])[],
  getKey: GetKey<T>,
): T[] {
  return pages.reduce<T[]>((all, page) => appendInclusiveCursorPage(all, page, getKey), []);
}

export interface InclusiveCursorPage<T> {
  items: readonly T[];
  /** The `limit` the page was requested with. */
  limit: number;
  /** The `cursorId` the page was requested with, if any. */
  cursorId?: string;
}

/** The cursor for the page after this one, or undefined when the list is exhausted. */
export function nextInclusiveCursor<T>(
  page: InclusiveCursorPage<T>,
  getKey: GetKey<T>,
): string | undefined {
  // The API fills a page whenever more rows exist, so a short page is the last one.
  if (page.items.length < page.limit) return undefined;
  const lastKey = getKey(page.items[page.items.length - 1]);
  // A page that ends on its own cursor would request itself forever.
  return lastKey === page.cursorId ? undefined : lastKey;
}

/**
 * Reads a whole inclusive-cursor list. Stops when a page brings no new rows, which also
 * covers endpoints whose short pages do not reliably mean "done", or at `maxPages`.
 */
export async function collectInclusiveCursorPages<T>(
  fetchPage: (cursorId: string | undefined) => Promise<readonly T[]>,
  getKey: GetKey<T>,
  options: Readonly<{ maxPages: number }>,
): Promise<T[]> {
  let collected: T[] = [];
  let cursorId: string | undefined;
  for (let page = 0; page < options.maxPages; page += 1) {
    const pageItems = await fetchPage(cursorId);
    const merged = appendInclusiveCursorPage(collected, pageItems, getKey);
    if (merged.length === collected.length) return merged;
    collected = merged;
    cursorId = getKey(pageItems[pageItems.length - 1]);
  }
  return collected;
}
