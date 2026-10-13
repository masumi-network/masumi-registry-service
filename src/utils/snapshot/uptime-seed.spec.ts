import { seedUptimeEwma } from './uptime-seed';

describe('seedUptimeEwma', () => {
  it('seeds the rolling uptime from the lifetime ratio', () => {
    expect(seedUptimeEwma(3, 4)).toBe(0.75);
  });

  it('leaves never-checked entries null', () => {
    expect(seedUptimeEwma(0, 0)).toBeNull();
  });
});
