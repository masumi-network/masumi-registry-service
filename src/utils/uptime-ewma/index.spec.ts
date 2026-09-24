import { nextUptimeEwma } from './index';

describe('nextUptimeEwma', () => {
  it('seeds from the first check', () => {
    expect(nextUptimeEwma(null, true)).toBe(1);
    expect(nextUptimeEwma(null, false)).toBe(0);
  });

  it('weighs the newest check by 0.1', () => {
    expect(nextUptimeEwma(1, false)).toBeCloseTo(0.9);
    expect(nextUptimeEwma(0.5, true)).toBeCloseTo(0.55);
  });

  it('forgets old history, unlike a lifetime ratio', () => {
    // 100 good checks then 20 failures: lifetime ratio stays at 83%, the
    // rolling value reflects the recent outage.
    let ewma: number | null = null;
    for (let i = 0; i < 100; i++) ewma = nextUptimeEwma(ewma, true);
    for (let i = 0; i < 20; i++) ewma = nextUptimeEwma(ewma, false);
    expect(ewma).toBeLessThan(0.15);
  });
});
