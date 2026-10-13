import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectInclusiveCursorPages,
  flattenInclusiveCursorPages,
  nextInclusiveCursor,
} from './cursor-pagination';

const id = (item: { id: string }) => item.id;
const rows = (...ids: string[]) => ids.map((value) => ({ id: value }));

describe('flattenInclusiveCursorPages', () => {
  it('drops the repeated cursor row and any other duplicate', () => {
    const flat = flattenInclusiveCursorPages([rows('a', 'b'), rows('b', 'c', 'c')], id);
    assert.deepEqual(flat.map(id), ['a', 'b', 'c']);
  });
});

describe('nextInclusiveCursor', () => {
  it('continues from the last row of a full page', () => {
    assert.equal(nextInclusiveCursor({ items: rows('a', 'b'), limit: 2 }, id), 'b');
  });

  it('stops on a short page', () => {
    assert.equal(nextInclusiveCursor({ items: rows('a'), limit: 2 }, id), undefined);
  });

  it('stops when a page ends on its own cursor', () => {
    assert.equal(nextInclusiveCursor({ items: rows('b'), limit: 1, cursorId: 'b' }, id), undefined);
  });
});

describe('collectInclusiveCursorPages', () => {
  it('reads until a page adds nothing new', async () => {
    const pages: Record<string, string[]> = { start: ['a', 'b'], b: ['b', 'c'], c: ['c'] };
    const all = await collectInclusiveCursorPages(
      async (cursor) => rows(...pages[cursor ?? 'start']),
      id,
      { maxPages: 10 },
    );
    assert.deepEqual(all.map(id), ['a', 'b', 'c']);
  });

  it('stops at maxPages', async () => {
    let calls = 0;
    await collectInclusiveCursorPages(
      async () => {
        calls += 1;
        return rows(`row-${calls}`);
      },
      id,
      { maxPages: 3 },
    );
    assert.equal(calls, 3);
  });
});
