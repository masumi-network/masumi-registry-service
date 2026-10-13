import type { RegistryEntry } from '@/lib/api/generated';
import type { PaymentType } from './agent-filters';

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  Web3CardanoV1: 'Cardano V1',
  Web3CardanoV2: 'Cardano V2',
  None: 'None',
};

export const ENTRY_TYPE_LABELS: Record<RegistryEntry['type'], string> = {
  Standard: 'Standard',
  OpenApi: 'OpenAPI',
  X402: 'x402',
  A2A: 'A2A',
};

/** Share of health checks the agent passed. */
export function formatUptime(uptimeCount: number, uptimeCheckCount: number): string {
  if (uptimeCheckCount <= 0) return '—';
  // Floor, so an imperfect record never reads as 100%.
  return `${Math.floor((uptimeCount / uptimeCheckCount) * 100)}%`;
}
