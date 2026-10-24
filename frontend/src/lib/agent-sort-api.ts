import type { AgentSortKey } from '@/components/agents/AgentSort';

type QuerySortBy = 'uptime' | 'price' | 'recency' | 'score';
type SearchSortBy = 'relevance' | QuerySortBy;

/** Maps admin UI sort to MAS-607 `sortBy` (global pagination-safe ordering). */
export function apiSortByForAgentSort(
  sort: AgentSortKey,
  isSearch: boolean,
): SearchSortBy | undefined {
  switch (sort) {
    case 'createdAt-desc':
      return isSearch ? 'relevance' : 'recency';
    case 'uptime-score':
      return 'uptime';
    default:
      return undefined;
  }
}
