import type { AgentFilters, Network, RegistryQueryBody } from '@/lib/agent-filters';
import type { InboxFilters } from '@/lib/inbox-filters';

// All TanStack Query keys live here, so invalidation can target a whole domain.
// Feature slices add their own entries next to the hooks that use them.
export const queryKeys = {
  health: ['health'] as const,
  apiKeyStatus: ['api-key-status'] as const,
  agentLists: ['agents', 'list'] as const,
  agentList: (network: Network, filters: AgentFilters) =>
    ['agents', 'list', network, filters] as const,
  agentProbe: (body: RegistryQueryBody) => ['agents', 'probe', body] as const,
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
  // Admin screens (MAS-615). Sources and keys are not network-scoped.
  registrySources: ['registry-sources'] as const,
  sourceDependents: (network: Network, policyId: string) =>
    ['registry-sources', 'dependents', network, policyId] as const,
  apiKeys: ['api-keys'] as const,
  registryOverview: (network: Network) => ['overview', 'registry', network] as const,
  inbox: ['inbox'] as const,
  inboxOverview: (network: Network) => ['inbox', 'overview', network] as const,
  inboxList: (network: Network, filters: InboxFilters) =>
    ['inbox', 'list', network, filters] as const,
};
