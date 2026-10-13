import { $Enums } from '@prisma/client';
import {
  nextTimeWeightedUptime,
  uptimeCheckCreate,
  uptimeCheckUpdate,
  uptimeTracking,
} from './uptime-tracking';

const DAY_MS = 24 * 60 * 60 * 1000;
const start = new Date('2026-01-01T00:00:00Z');
const after = (ms: number) => new Date(start.getTime() + ms);

describe('nextTimeWeightedUptime', () => {
  it('seeds from the first check', () => {
    expect(nextTimeWeightedUptime(null, $Enums.Status.Online, start)).toBe(1);
    expect(nextTimeWeightedUptime(null, $Enums.Status.Offline, start)).toBe(0);
  });

  it('weighs the held status by elapsed time with a 7-day half-life', () => {
    const previous = {
      status: $Enums.Status.Offline,
      lastUptimeCheck: start,
      uptimeEwma: 1,
    };
    expect(
      nextTimeWeightedUptime(previous, $Enums.Status.Online, after(7 * DAY_MS))
    ).toBeCloseTo(0.5);
  });

  it('ignores how often checks run (spam has no effect)', () => {
    let state = {
      status: $Enums.Status.Online as $Enums.Status,
      lastUptimeCheck: start,
      uptimeEwma: 0.2 as number | null,
    };
    // 1000 checks in one minute while Online barely move the value.
    for (let i = 1; i <= 1000; i++) {
      const now = after(i * 60);
      state = {
        status: $Enums.Status.Online,
        lastUptimeCheck: now,
        uptimeEwma: nextTimeWeightedUptime(state, $Enums.Status.Online, now),
      };
    }
    expect(state.uptimeEwma).toBeLessThan(0.201);
  });

  it('gives the same value for one long interval or many short ones', () => {
    const previous = {
      status: $Enums.Status.Online,
      lastUptimeCheck: start,
      uptimeEwma: 0,
    };
    const once = nextTimeWeightedUptime(
      previous,
      $Enums.Status.Online,
      after(DAY_MS)
    );
    let state = previous;
    for (let hour = 1; hour <= 24; hour++) {
      const now = after(hour * 60 * 60 * 1000);
      state = {
        ...state,
        lastUptimeCheck: now,
        uptimeEwma: nextTimeWeightedUptime(state, $Enums.Status.Online, now),
      };
    }
    expect(state.uptimeEwma).toBeCloseTo(once, 10);
  });

  it('treats a clock going backwards as no elapsed time', () => {
    const previous = {
      status: $Enums.Status.Offline,
      lastUptimeCheck: start,
      uptimeEwma: 0.8,
    };
    expect(
      nextTimeWeightedUptime(previous, $Enums.Status.Online, after(-DAY_MS))
    ).toBe(0.8);
  });
});

describe('uptime check patches', () => {
  it('counts the check and advances the rolling uptime', () => {
    const previous = {
      status: $Enums.Status.Online,
      lastUptimeCheck: start,
      uptimeEwma: 0.5,
    };
    const patch = uptimeCheckUpdate(
      previous,
      $Enums.Status.Offline,
      after(7 * DAY_MS)
    );
    expect(patch).toEqual({
      lastUptimeCheck: after(7 * DAY_MS),
      uptimeCount: { increment: 0 },
      uptimeCheckCount: { increment: 1 },
      uptimeEwma: 0.75,
    });
  });

  it('creates a first-check patch', () => {
    expect(uptimeCheckCreate($Enums.Status.Online, start)).toEqual({
      lastUptimeCheck: start,
      uptimeCount: 1,
      uptimeCheckCount: 1,
      uptimeEwma: 1,
    });
  });
});

describe('applyUptimeCheck', () => {
  const fakeDb = (
    states: ({
      status: $Enums.Status;
      lastUptimeCheck: Date;
      uptimeEwma: number | null;
    } | null)[],
    counts: number[]
  ) => {
    const findFirst = jest.fn();
    for (const state of states) findFirst.mockResolvedValueOnce(state);
    const updateMany = jest.fn();
    for (const count of counts) updateMany.mockResolvedValueOnce({ count });
    return { registryEntry: { findFirst, updateMany } };
  };

  it('writes status and uptime guarded by the state it read', async () => {
    const db = fakeDb(
      [{ status: $Enums.Status.Online, lastUptimeCheck: start, uptimeEwma: 0 }],
      [1]
    );
    const applied = await uptimeTracking.applyUptimeCheck(
      db as never,
      { id: 'entry-1' },
      $Enums.Status.Offline,
      after(7 * DAY_MS)
    );
    expect(applied).toBe(true);
    expect(db.registryEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'entry-1', lastUptimeCheck: start },
      data: {
        status: $Enums.Status.Offline,
        ...uptimeCheckUpdate(
          {
            status: $Enums.Status.Online,
            lastUptimeCheck: start,
            uptimeEwma: 0,
          },
          $Enums.Status.Offline,
          after(7 * DAY_MS)
        ),
      },
    });
  });

  it('recomputes from the newer state when a concurrent check wrote first', async () => {
    const concurrent = {
      status: $Enums.Status.Online,
      lastUptimeCheck: after(DAY_MS),
      uptimeEwma: 0.4,
    };
    const db = fakeDb(
      [
        {
          status: $Enums.Status.Offline,
          lastUptimeCheck: start,
          uptimeEwma: 0.5,
        },
        concurrent,
      ],
      [0, 1]
    );
    await uptimeTracking.applyUptimeCheck(
      db as never,
      { assetIdentifier: 'asset-1' },
      $Enums.Status.Online,
      after(2 * DAY_MS)
    );
    expect(db.registryEntry.updateMany).toHaveBeenCalledTimes(2);
    expect(db.registryEntry.updateMany).toHaveBeenLastCalledWith({
      where: { assetIdentifier: 'asset-1', lastUptimeCheck: after(DAY_MS) },
      data: {
        status: $Enums.Status.Online,
        ...uptimeCheckUpdate(
          concurrent,
          $Enums.Status.Online,
          after(2 * DAY_MS)
        ),
      },
    });
  });

  it('reports a missing entry so the caller can create it', async () => {
    const db = fakeDb([null], []);
    expect(
      await uptimeTracking.applyUptimeCheck(
        db as never,
        { assetIdentifier: 'new-asset' },
        $Enums.Status.Online,
        start
      )
    ).toBe(false);
    expect(db.registryEntry.updateMany).not.toHaveBeenCalled();
  });
});
