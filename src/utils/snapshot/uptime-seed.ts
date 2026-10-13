// Snapshots carry no rolling uptime: seed it from the lifetime ratio, like
// the uptimeEwma migration. Never-checked entries stay null.
export function seedUptimeEwma(
  uptimeCount: number,
  uptimeCheckCount: number
): number | null {
  return uptimeCheckCount > 0 ? uptimeCount / uptimeCheckCount : null;
}
