import type { AgentFilters, Network, RegistryListRequest } from '@/lib/agent-filters';

// All TanStack Query keys live here, so invalidation can target a whole domain.
// Feature slices add their own entries next to the hooks that use them.
export const queryKeys = {
  health: ['health'] as const,
  apiKeyStatus: ['api-key-status'] as const,
  agentLists: ['agents', 'list'] as const,
  agentList: (network: Network, filters: AgentFilters) =>
    ['agents', 'list', network, filters] as const,
  agentProbe: (request: RegistryListRequest) => ['agents', 'probe', request] as const,
  agent: (network: Network, agentIdentifier: string) =>
    ['agents', 'detail', network, agentIdentifier] as const,
  latestAgentVersion: (network: Network, agentIdentifier: string) =>
    ['agents', 'latest', network, agentIdentifier] as const,
  agentSpec: (network: Network, agentIdentifier: string) =>
    ['agents', 'spec', network, agentIdentifier] as const,
  // The payment-information endpoint finds the asset by identifier alone, on any network.
  paymentInformation: (agentIdentifier: string) =>
    ['payment-information', agentIdentifier] as const,
  // The capability endpoint is not network-scoped, so neither is its key.
  capabilities: ['capabilities'] as const,
};
