import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  API_KEY_PAGE_SIZE,
  apiKeyPageLimit,
  flattenApiKeyPages,
  nextApiKeyCursor,
} from './api-key-pages';

type Row = { id: string };

const makeKeys = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: `key-${String(index).padStart(4, '0')}` }));

/** Mimics GET /api-key: ordered by id, and the cursor row itself is returned first. */
function fakeApiKeyEndpoint(all: readonly Row[]) {
  return (cursorId: string | undefined, limit: number): Row[] => {
    const start = cursorId ? all.findIndex((row) => row.id === cursorId) : 0;
    return all.slice(start, start + limit);
  };
}

/** Walks the list exactly as the page does: request, record the page, follow the cursor. */
function loadEveryPage(all: readonly Row[]) {
  const fetchPage = fakeApiKeyEndpoint(all);
  const pages: { items: Row[]; limit: number; cursorId?: string }[] = [];
  let cursorId: string | undefined;
  do {
    assert.ok(pages.length < 20, 'pagination did not stop');
    const limit = apiKeyPageLimit(cursorId);
    const page = { items: fetchPage(cursorId, limit), limit, cursorId };
    pages.push(page);
    cursorId = nextApiKeyCursor(page);
  } while (cursorId);
  return { pages, rows: flattenApiKeyPages(pages.map((page) => page.items)) };
}

describe('API key pagination over an inclusive cursor', () => {
  for (const count of [0, 1, 49, 50, 51, 63, 100, 101, 150]) {
    it(`lists each of ${count} keys exactly once`, () => {
      const all = makeKeys(count);
      const { rows } = loadEveryPage(all);
      assert.deepEqual(
        rows.map((row) => row.id),
        all.map((row) => row.id),
      );
    });
  }

  it('stops after the first page when the list is shorter than a page', () => {
    assert.equal(loadEveryPage(makeKeys(API_KEY_PAGE_SIZE - 1)).pages.length, 1);
  });

  it('spends one extra empty-handed page on a list of exactly one page, then stops', () => {
    const { pages, rows } = loadEveryPage(makeKeys(API_KEY_PAGE_SIZE));
    assert.equal(pages.length, 2);
    assert.equal(rows.length, API_KEY_PAGE_SIZE);
  });

  it('asks later pages for one more row to make up for the repeated cursor row', () => {
    assert.equal(apiKeyPageLimit(undefined), API_KEY_PAGE_SIZE);
    assert.equal(apiKeyPageLimit('key-0049'), API_KEY_PAGE_SIZE + 1);
  });
});
