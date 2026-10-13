import type { AgentFilters, Network, RegistryQueryBody } from '@/lib/agent-filters';

// All TanStack Query keys live here, so invalidation can target a whole domain.
// Feature slices add their own entries next to the hooks that use them.
export const queryKeys = {
  health: ['health'] as const,
  apiKeyStatus: ['api-key-status'] as const,
  agentList: (network: Network, filters: AgentFilters) =>
    ['agents', 'list', network, filters] as const,
  agentProbe: (body: RegistryQueryBody) => ['agents', 'probe', body] as const,
  // The capability endpoint is not network-scoped, so neither is its key.
  capabilities: ['capabilities'] as const,
};
