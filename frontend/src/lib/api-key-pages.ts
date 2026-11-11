import {
  flattenInclusiveCursorPages,
  nextInclusiveCursor,
  type InclusiveCursorPage,
} from '@/lib/pagination/cursor-pagination';

export const API_KEY_PAGE_SIZE = 50;

interface KeyRow {
  id: string;
}

const rowId = (row: KeyRow): string => row.id;

/**
 * The key list's cursor is inclusive, so a later page spends its first row on the repeated
 * cursor row. It asks for one more to still add a full page (the API allows up to 100).
 */
export function apiKeyPageLimit(cursorId: string | undefined): number {
  return cursorId ? API_KEY_PAGE_SIZE + 1 : API_KEY_PAGE_SIZE;
}

export function nextApiKeyCursor<T extends KeyRow>(
  page: InclusiveCursorPage<T>,
): string | undefined {
  return nextInclusiveCursor(page, rowId);
}

export function flattenApiKeyPages<T extends KeyRow>(pages: readonly (readonly T[])[]): T[] {
  return flattenInclusiveCursorPages(pages, rowId);
}
