import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SORT_OPTIONS, effectiveSortBy, type AgentFilters, type SortBy } from '@/lib/agent-filters';
import { SORT_LABELS } from '@/lib/display-labels';
import type { AgentFiltersUpdate } from '@/lib/hooks/useAgentFilters';

interface AgentSortSelectProps {
  filters: AgentFilters;
  onChange: (update: AgentFiltersUpdate) => void;
}

// The plain list without sortBy: the registry's own order (newest id first).
const REGISTRY_ORDER = 'registry';

/**
 * `sortBy`. The API ranks; the list shows its order as returned. Relevance exists only for
 * a search (and is its default); price needs a price unit, set in the filter panel.
 */
export function AgentSortSelect({ filters, onChange }: AgentSortSelectProps) {
  const isSearching = filters.query !== '';
  const value = effectiveSortBy(filters) ?? REGISTRY_ORDER;
  const options = SORT_OPTIONS.filter((option) => option !== 'relevance' || isSearching);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="agents-sort" className="text-xs font-normal text-muted-foreground">
        Sort by
      </Label>
      <Select
        value={value}
        onValueChange={(next) => {
          const sortBy: SortBy | '' = SORT_OPTIONS.find((option) => option === next) ?? '';
          // Relevance is the search default, so choosing it means "no explicit sort".
          onChange((current) => ({ ...current, sortBy: sortBy === 'relevance' ? '' : sortBy }));
        }}
      >
        <SelectTrigger id="agents-sort" className="h-8 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!isSearching && <SelectItem value={REGISTRY_ORDER}>Registry order</SelectItem>}
          {options.map((option) => {
            const needsUnit = option === 'price' && !filters.priceUnit;
            return (
              <SelectItem key={option} value={option} disabled={needsUnit}>
                {needsUnit ? 'Price (set a price unit first)' : SORT_LABELS[option]}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
