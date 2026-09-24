// Weight of the newest health check; older checks decay geometrically.
const UPTIME_EWMA_ALPHA = 0.1;

// Rolling uptime as an exponentially weighted moving average of health checks.
// The first check (no previous value) seeds it directly.
export function nextUptimeEwma(
  previous: number | null,
  isOnline: boolean
): number {
  const sample = isOnline ? 1 : 0;
  if (previous == null) return sample;
  return UPTIME_EWMA_ALPHA * sample + (1 - UPTIME_EWMA_ALPHA) * previous;
}
