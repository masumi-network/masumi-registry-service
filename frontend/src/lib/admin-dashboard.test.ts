import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectStatusDiff,
  summarizeInbox,
  summarizeRegistry,
  type DiffRow,
} from './admin-dashboard';

const at = (iso: string) => new Date(iso);

describe('collectStatusDiff', () => {
  it('pages with the last row as cursor and keeps each row once, in its newest state', async () => {
    const pages: DiffRow[][] = [
      [
        { id: 'a', statusUpdatedAt: at('2026-01-01T00:00:00Z') },
        { id: 'b', statusUpdatedAt: at('2026-01-02T00:00:00Z') },
      ],
      // The inclusive cursor repeats "b"; "a" changed meanwhile and comes back later.
      [
        { id: 'b', statusUpdatedAt: at('2026-01-02T00:00:00Z') },
        { id: 'a', statusUpdatedAt: at('2026-01-03T00:00:00Z') },
      ],
      [{ id: 'a', statusUpdatedAt: at('2026-01-03T00:00:00Z') }],
    ];
    const calls: { after: string; cursorId?: string }[] = [];
    const { rows, isComplete } = await collectStatusDiff(
      async (after, cursorId) => {
        calls.push({ after: after.toISOString(), cursorId });
        return pages[calls.length - 1] ?? [];
      },
      { pageSize: 2, maxPages: 10 },
    );
    assert.deepEqual(
      rows.map((row) => [row.id, row.statusUpdatedAt.toISOString()]),
      [
        ['a', '2026-01-03T00:00:00.000Z'],
        ['b', '2026-01-02T00:00:00.000Z'],
      ],
    );
    assert.deepEqual(calls[0], { after: '1970-01-01T00:00:00.000Z', cursorId: undefined });
    assert.deepEqual(calls[1], { after: '2026-01-02T00:00:00.000Z', cursorId: 'b' });
    assert.equal(calls.length, 3, 'stops on a short page');
    assert.equal(isComplete, true);
  });

  it('stops at maxPages and reports that the scan is incomplete', async () => {
    let n = 0;
    const result = await collectStatusDiff(
      async () => {
        n += 1;
        return [
          { id: `x${n}a`, statusUpdatedAt: at(`2026-01-0${n}T00:00:00Z`) },
          { id: `x${n}b`, statusUpdatedAt: at(`2026-01-0${n}T00:00:01Z`) },
        ];
      },
      { pageSize: 2, maxPages: 3 },
    );
    assert.equal(n, 3);
    assert.equal(result.rows.length, 6);
    assert.equal(result.isComplete, false);
  });
});

describe('summarizeRegistry', () => {
  const now = at('2026-03-10T12:00:00Z');
  const since = at('2026-03-03T12:00:00Z');
  const entry = (
    id: string,
    status: 'Online' | 'Offline' | 'Deregistered' | 'Invalid',
    createdAt: string,
    statusUpdatedAt: string,
    lastUptimeCheck: string,
  ) => ({
    id,
    status,
    createdAt: at(createdAt),
    statusUpdatedAt: at(statusUpdatedAt),
    lastUptimeCheck: at(lastUptimeCheck),
  });

  it('counts by status, and added and burned within the window', () => {
    const summary = summarizeRegistry(
      [
        entry(
          '1',
          'Online',
          '2026-03-05T00:00:00Z',
          '2026-03-05T00:00:00Z',
          '2026-03-10T11:00:00Z',
        ),
        entry(
          '2',
          'Offline',
          '2026-01-01T00:00:00Z',
          '2026-03-09T00:00:00Z',
          '2026-03-10T11:30:00Z',
        ),
        entry(
          '3',
          'Deregistered',
          '2026-01-01T00:00:00Z',
          '2026-03-08T00:00:00Z',
          '2026-02-01T00:00:00Z',
        ),
        entry(
          '4',
          'Deregistered',
          '2025-12-01T00:00:00Z',
          '2026-01-02T00:00:00Z',
          '2026-01-01T00:00:00Z',
        ),
        entry(
          '5',
          'Invalid',
          '2026-03-04T00:00:00Z',
          '2026-03-04T00:00:00Z',
          '2026-03-04T00:00:00Z',
        ),
      ],
      since,
      now,
    );
    assert.deepEqual(summary.counts, { Online: 1, Offline: 1, Deregistered: 2, Invalid: 1 });
    assert.equal(summary.total, 5);
    assert.equal(summary.added, 2, 'first seen in the window: 1 and 5');
    assert.equal(summary.burned, 1, 'deregistered in the window: 3 only');
    assert.equal(summary.latestChange?.toISOString(), '2026-03-09T00:00:00.000Z');
    assert.equal(summary.latestHealthCheck?.toISOString(), '2026-03-10T11:30:00.000Z');
  });

  it('ignores health-check times in the future and reports none for an empty registry', () => {
    const future = summarizeRegistry(
      [
        entry(
          '1',
          'Online',
          '2026-03-01T00:00:00Z',
          '2026-03-01T00:00:00Z',
          '2026-03-11T00:00:00Z',
        ),
      ],
      since,
      now,
    );
    assert.equal(future.latestHealthCheck, null);
    const empty = summarizeRegistry([], since, now);
    assert.equal(empty.total, 0);
    assert.equal(empty.latestChange, null);
  });
});

describe('summarizeInbox', () => {
  it('counts registrations by status', () => {
    assert.deepEqual(
      summarizeInbox([{ status: 'Pending' }, { status: 'Verified' }, { status: 'Verified' }]),
      { counts: { Pending: 1, Verified: 2, Invalid: 0, Deregistered: 0 }, total: 3 },
    );
  });
});
