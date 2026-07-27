import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/lib/contexts/AppContext';
import {
  getApiKey,
  getRegistrySource,
  postRegistryEntry,
  postRegistryEntrySearch,
} from '@/lib/api/generated';
import { shortenId } from '@/lib/utils';

export interface SearchableItem {
  id: string;
  title: string;
  description?: string;
  type: 'page' | 'action' | 'agent' | 'source' | 'api-key';
  href: string;
  keywords?: string[];
  elementId?: string;
}

const staticItems: SearchableItem[] = [
  { id: 'dashboard', title: 'Dashboard', type: 'page', href: '/' },
  { id: 'agents', title: 'Agents', type: 'page', href: '/agents', keywords: ['registry', 'entries'] },
  {
    id: 'sources',
    title: 'Sources',
    type: 'page',
    href: '/sources',
    keywords: ['registry source', 'policy'],
  },
  { id: 'api-keys', title: 'API Keys', type: 'page', href: '/api-keys' },
  { id: 'settings', title: 'Settings', type: 'page', href: '/settings' },
  {
    id: 'add-source',
    title: 'Add Source',
    type: 'action',
    href: '/sources',
    elementId: 'add-source-button',
    keywords: ['create source', 'new source', 'register source'],
  },
  {
    id: 'add-api-key',
    title: 'Add API Key',
    type: 'action',
    href: '/api-keys',
    elementId: 'add-api-key-button',
    keywords: ['create api key', 'new api key'],
  },
  {
    id: 'toggle-theme',
    title: 'Toggle Theme',
    description: 'Change between light and dark mode',
    type: 'action',
    href: '/settings',
    elementId: 'settings-theme-toggle',
    keywords: ['dark mode', 'light mode', 'theme', 'appearance'],
  },
];

export function useSearch(enabled = true) {
  const { apiClient, network } = useAppContext();

  const sourcesQuery = useQuery({
    queryKey: ['search-sources', network],
    enabled,
    queryFn: async () => {
      const response = await getRegistrySource({
        client: apiClient,
        query: { limit: 50 },
      });
      if (response.error) throw response.error;
      return response.data?.data?.sources ?? [];
    },
  });

  const keysQuery = useQuery({
    queryKey: ['search-api-keys'],
    enabled,
    queryFn: async () => {
      const response = await getApiKey({
        client: apiClient,
        query: { limit: 50 },
      });
      if (response.error) throw response.error;
      return response.data?.data?.apiKeys ?? [];
    },
  });

  const agentsQuery = useQuery({
    queryKey: ['search-agents', network],
    enabled,
    queryFn: async () => {
      const response = await postRegistryEntry({
        client: apiClient,
        body: { network, limit: 20 },
      });
      if (response.error) throw response.error;
      return response.data?.data?.entries ?? [];
    },
  });

  const indexedResults = useMemo(() => {
    const dynamic: SearchableItem[] = [];

    for (const source of sourcesQuery.data ?? []) {
      if (source.network && source.network !== network) continue;
      dynamic.push({
        id: `source-${source.id}`,
        title: source.note?.trim() || 'Registry Source',
        description: [
          source.network,
          source.policyId ? `Policy ${shortenId(source.policyId, 10)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        type: 'source',
        href: `/sources?searched=${source.id}`,
        elementId: `source-${source.id}`,
        keywords: [source.policyId ?? '', source.id, source.url ?? ''].filter(Boolean),
      });
    }

    for (const key of keysQuery.data ?? []) {
      dynamic.push({
        id: `api-key-${key.id}`,
        title: `API Key · ${key.permission}`,
        description: `${key.status} · ${shortenId(key.id, 10)}`,
        type: 'api-key',
        href: `/api-keys?searched=${key.id}`,
        elementId: `api-key-${key.id}`,
        keywords: [key.id, key.permission, key.status],
      });
    }

    for (const agent of agentsQuery.data ?? []) {
      dynamic.push({
        id: `agent-${agent.id}`,
        title: agent.name,
        description: `${agent.status} · ${shortenId(agent.agentIdentifier, 12)}`,
        type: 'agent',
        href: `/agents?q=${encodeURIComponent(agent.name)}`,
        elementId: `agent-${agent.id}`,
        keywords: [
          agent.agentIdentifier,
          agent.id,
          ...(agent.tags ?? []),
          agent.apiBaseUrl,
          agent.description ?? '',
        ],
      });
    }

    return [...staticItems, ...dynamic];
  }, [agentsQuery.data, keysQuery.data, network, sourcesQuery.data]);

  const isLoading = sourcesQuery.isLoading || keysQuery.isLoading || agentsQuery.isLoading;

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        return indexedResults;
      }

      const queryLower = trimmed.toLowerCase();
      const localMatches = indexedResults.filter(
        (item) =>
          item.title.toLowerCase().includes(queryLower) ||
          item.description?.toLowerCase().includes(queryLower) ||
          item.keywords?.some((keyword) => keyword.toLowerCase().includes(queryLower)),
      );

      // Also hit registry search so agents beyond the first page are findable.
      try {
        const response = await postRegistryEntrySearch({
          client: apiClient,
          body: { network, query: trimmed, limit: 10 },
        });
        const remoteAgents = response.data?.data?.entries ?? [];
        const existingIds = new Set(localMatches.map((item) => item.id));
        for (const agent of remoteAgents) {
          const id = `agent-${agent.id}`;
          if (existingIds.has(id)) continue;
          localMatches.push({
            id,
            title: agent.name,
            description: `${agent.status} · ${shortenId(agent.agentIdentifier, 12)}`,
            type: 'agent',
            href: `/agents?q=${encodeURIComponent(trimmed)}`,
            elementId: id,
            keywords: [agent.agentIdentifier, ...(agent.tags ?? [])],
          });
        }
      } catch {
        // Local matches are still useful if remote search fails.
      }

      return localMatches;
    },
    [apiClient, indexedResults, network],
  );

  return {
    handleSearch,
    isLoading,
  };
}
