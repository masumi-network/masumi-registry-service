import { $Enums } from '@prisma/client';
import {
  nextTimeWeightedUptime,
  uptimeCheckCreate,
  uptimeCheckUpdate,
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
