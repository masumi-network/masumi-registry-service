import { parseAgentFilters, serializeAgentFilters, type AgentFilters } from '@/lib/agent-filters';
import { useUrlView, type ViewUpdate } from './useUrlView';

/** Builds the next view from the newest one, which may not have reached the URL yet. */
export type AgentFiltersUpdate = ViewUpdate<AgentFilters>;

const codec = { parse: parseAgentFilters, serialize: serializeAgentFilters };

/**
 * The agent-browser filters, read from and written to the URL so a filtered view is a
 * shareable link. The network is not part of it: it is app-level (NetworkContext).
 */
export function useAgentFilters() {
  const { isReady, view, updateView } = useUrlView(codec);
  return { isReady, filters: view, updateFilters: updateView };
}
