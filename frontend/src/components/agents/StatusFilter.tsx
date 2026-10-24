import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AGENT_STATUSES,
  setStatusMode,
  shownStatuses,
  toggleValue,
  type AgentFilters,
} from '@/lib/agent-filters';
import type { AgentFiltersUpdate } from '@/lib/hooks/useAgentFilters';
import { cn } from '@/lib/utils';

interface StatusFilterProps {
  filters: AgentFilters;
  onChange: (update: AgentFiltersUpdate) => void;
}

const MODES = [
  { mode: 'show', label: 'Show only' },
  { mode: 'hide', label: 'Hide' },
] as const;

/**
 * `status` and its inverse `excludeStatus` as one control: pick the statuses to show, or
 * switch to picking the ones to hide. Switching keeps the view (it takes the complement).
 */
export function StatusFilter({ filters, onChange }: StatusFilterProps) {
  const isHiding = filters.excludedStatuses.length > 0;
  const selected = isHiding ? filters.excludedStatuses : filters.statuses;
  const shown = shownStatuses(filters);
  const allShown = shown.length === AGENT_STATUSES.length;

  function toggle(status: (typeof AGENT_STATUSES)[number], isOn: boolean) {
    onChange((current) => {
      if (current.excludedStatuses.length > 0) {
        const excludedStatuses = toggleValue(
          AGENT_STATUSES,
          current.excludedStatuses,
          status,
          isOn,
        );
        // Keep 1-3 hidden: none hidden is "show", all hidden would show nothing.
        const isValid =
          excludedStatuses.length > 0 && excludedStatuses.length < AGENT_STATUSES.length;
        return isValid ? { ...current, excludedStatuses } : current;
      }
      const statuses = toggleValue(AGENT_STATUSES, current.statuses, status, isOn);
      return statuses.length > 0 ? { ...current, statuses } : current;
    });
  }

  return (
    <fieldset className="space-y-2" aria-describedby="filter-status-hint">
      <legend className="mb-2 text-sm font-medium">Status</legend>
      <div
        role="group"
        aria-label="Status filter mode"
        className="inline-flex rounded-md border p-0.5"
      >
        {MODES.map(({ mode, label }) => {
          const isActive = (mode === 'hide') === isHiding;
          return (
            <Button
              key={mode}
              type="button"
              variant="ghost"
              size="sm2"
              aria-pressed={isActive}
              // Showing every status leaves nothing to hide.
              disabled={mode === 'hide' && !isHiding && allShown}
              className={cn('h-6 px-2', isActive && 'bg-muted font-semibold')}
              onClick={() => onChange((current) => setStatusMode(current, mode))}
            >
              {label}
            </Button>
          );
        })}
      </div>
      {AGENT_STATUSES.map((status) => {
        const id = `filter-status-${status}`;
        const isChecked = selected.includes(status);
        const isLastChecked = isChecked && selected.length === 1;
        const wouldHideAll =
          isHiding && !isChecked && selected.length === AGENT_STATUSES.length - 1;
        return (
          <div key={status} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={isChecked}
              disabled={isLastChecked || wouldHideAll}
              onCheckedChange={(checked) => toggle(status, checked === true)}
            />
            <Label htmlFor={id} className="font-normal">
              {status}
            </Label>
          </div>
        );
      })}
      <p id="filter-status-hint" className="text-xs text-muted-foreground">
        {isHiding
          ? 'Checked statuses are hidden; every other status shows. At least one stays visible.'
          : 'Only Online agents are shown by default. At least one status stays selected.'}
      </p>
      {!allShown && (
        <Button
          variant="link"
          size="sm2"
          className="h-auto px-0"
          onClick={() =>
            onChange((current) => ({
              ...current,
              statuses: [...AGENT_STATUSES],
              excludedStatuses: [],
            }))
          }
        >
          Show all statuses
        </Button>
      )}
    </fieldset>
  );
}
