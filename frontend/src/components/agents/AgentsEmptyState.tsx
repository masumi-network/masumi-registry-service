import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  isDefaultStatusSelection,
  resetFilters,
  type AgentFilters,
  type Network,
} from '@/lib/agent-filters';
import {
  describeFilter,
  withoutFilter,
  type EmptyResultExplanation,
} from '@/lib/agent-empty-result';
import type { AgentFiltersUpdate } from '@/lib/hooks/useAgentFilters';
import { useEmptyResultExplanation } from '@/lib/queries/useEmptyResultExplanation';

interface AgentsEmptyStateProps {
  filters: AgentFilters;
  network: Network;
  onChange: (update: AgentFiltersUpdate) => void;
}

function describe(
  explanation: EmptyResultExplanation,
  filters: AgentFilters,
  network: Network,
): string {
  switch (explanation.kind) {
    case 'checking':
      return 'Checking which filter excluded every agent…';
    case 'single': {
      const [only] = explanation.keys;
      const isDefaultStatusCulprit =
        explanation.keys.includes('status') && isDefaultStatusSelection(filters.statuses);
      if (explanation.keys.length > 1) {
        // Each one alone would let agents through; together they rule each other out.
        return `No agent matches these filters together. Removing any one of them brings agents back.${
          isDefaultStatusCulprit ? ' Only Online agents are shown by default.' : ''
        }`;
      }
      if (isDefaultStatusCulprit) {
        return 'Only Online agents are shown by default, and no Online agent matches. Agents with another status do.';
      }
      return `The filter “${describeFilter(filters, only)}” excluded every agent.`;
    }
    case 'combination':
      return 'No single filter is the cause: only removing several of these together brings agents back.';
    case 'network-empty':
      return `The registry has no agents on ${network}.`;
    case 'unknown':
      return 'Could not work out which filter excluded every agent. Try removing one.';
  }
}

/** The empty list, saying which filter excluded everything (see lib/agent-empty-result). */
export function AgentsEmptyState({ filters, network, onChange }: AgentsEmptyStateProps) {
  const explanation = useEmptyResultExplanation(filters, network);
  const removals = 'keys' in explanation ? explanation.keys : [];
  const canReset = explanation.kind === 'combination' || explanation.kind === 'unknown';

  return (
    <div role="status" aria-live="polite">
      <EmptyState
        icon="search"
        title="No agents match these filters"
        description={describe(explanation, filters, network)}
        className="[&_p]:max-w-md"
        action={
          removals.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {removals.map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="max-w-full"
                  onClick={() => onChange((current) => withoutFilter(current, key))}
                >
                  <X aria-hidden="true" />
                  <span className="truncate">
                    {/* Leaving status out means every status, not "no status". */}
                    {key === 'status'
                      ? 'Show all statuses'
                      : `Remove ${describeFilter(filters, key)}`}
                  </span>
                </Button>
              ))}
              {canReset && (
                <Button variant="ghost" size="sm" onClick={() => onChange(resetFilters)}>
                  Reset all filters
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
