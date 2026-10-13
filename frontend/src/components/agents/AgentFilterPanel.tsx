import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CapabilityFilter } from '@/components/agents/CapabilityFilter';
import { TagFilterInput } from '@/components/agents/TagFilterInput';
import { TextFilterInput } from '@/components/agents/TextFilterInput';
import {
  AGENT_STATUSES,
  MAX_IDENTIFIER_LENGTH,
  MAX_TAGS,
  PAYMENT_TYPES,
  resetFilters,
  sameView,
  today,
  toggleValue,
  type AgentFilters,
} from '@/lib/agent-filters';
import { PAYMENT_TYPE_LABELS } from '@/lib/display-labels';
import type { AgentFiltersUpdate } from '@/lib/hooks/useAgentFilters';
import { cn } from '@/lib/utils';

interface CheckboxGroupProps<T extends string> {
  legend: string;
  idPrefix: string;
  options: readonly T[];
  selected: readonly T[];
  labels?: Readonly<Record<T, string>>;
  /** Keeps the last checked box from being unchecked. */
  requireOne?: boolean;
  hint: string;
  /** One box changed; the caller applies it to the newest selection. */
  onToggle: (value: T, isOn: boolean) => void;
}

function CheckboxGroup<T extends string>({
  legend,
  idPrefix,
  options,
  selected,
  labels,
  requireOne = false,
  hint,
  onToggle,
}: CheckboxGroupProps<T>) {
  const hintId = `${idPrefix}-hint`;
  return (
    <fieldset className="space-y-2" aria-describedby={hintId}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {options.map((option) => {
        const id = `${idPrefix}-${option}`;
        const isChecked = selected.includes(option);
        return (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={isChecked}
              disabled={requireOne && isChecked && selected.length === 1}
              onCheckedChange={(checked) => onToggle(option, checked === true)}
            />
            <Label htmlFor={id} className="font-normal">
              {labels?.[option] ?? option}
            </Label>
          </div>
        );
      })}
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </fieldset>
  );
}

interface AgentFilterPanelProps {
  id: string;
  filters: AgentFilters;
  onChange: (update: AgentFiltersUpdate) => void;
  className?: string;
}

/**
 * One control per filter `POST /registry-entry` accepts. Every change applies at once, to
 * the newest view (`onChange` takes an update, not a value), so quick changes never undo
 * each other.
 */
export function AgentFilterPanel({ id, filters, onChange, className }: AgentFilterPanelProps) {
  const update = (patch: Partial<AgentFilters>) =>
    onChange((current) => ({ ...current, ...patch }));
  const isDefault = sameView(resetFilters(filters), filters);
  const allStatusesShown = filters.statuses.length === AGENT_STATUSES.length;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn('space-y-6 rounded-lg border p-4', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold tracking-tight">
          Filters
        </h2>
        <Button
          variant="ghost"
          size="sm2"
          disabled={isDefault}
          onClick={() => onChange(resetFilters)}
        >
          Reset
        </Button>
      </div>

      <div className="space-y-2">
        <CheckboxGroup
          legend="Status"
          idPrefix="filter-status"
          options={AGENT_STATUSES}
          selected={filters.statuses}
          requireOne
          hint="Only Online agents are shown by default. At least one status stays selected."
          onToggle={(status, isOn) =>
            onChange((current) => {
              const statuses = toggleValue(AGENT_STATUSES, current.statuses, status, isOn);
              return statuses.length > 0 ? { ...current, statuses } : current;
            })
          }
        />
        {!allStatusesShown && (
          <Button
            variant="link"
            size="sm2"
            className="h-auto px-0"
            onClick={() => update({ statuses: [...AGENT_STATUSES] })}
          >
            Show all statuses
          </Button>
        )}
      </div>

      <CheckboxGroup
        legend="Payment type"
        idPrefix="filter-payment"
        options={PAYMENT_TYPES}
        labels={PAYMENT_TYPE_LABELS}
        selected={filters.paymentTypes}
        hint="None selected means any payment type."
        onToggle={(paymentType, isOn) =>
          onChange((current) => ({
            ...current,
            paymentTypes: toggleValue(PAYMENT_TYPES, current.paymentTypes, paymentType, isOn),
          }))
        }
      />

      <CapabilityFilter
        name={filters.capabilityName}
        version={filters.capabilityVersion}
        onChange={(capabilityName, capabilityVersion) =>
          update({ capabilityName, capabilityVersion })
        }
      />

      <TagFilterInput
        tags={filters.tags}
        onAdd={(tag) =>
          onChange((current) =>
            current.tags.includes(tag) || current.tags.length >= MAX_TAGS
              ? current
              : { ...current, tags: [...current.tags, tag] },
          )
        }
        onRemove={(tag) =>
          onChange((current) => ({ ...current, tags: current.tags.filter((t) => t !== tag) }))
        }
      />

      <TextFilterInput
        revision={filters}
        id="filter-policy-id"
        label="Policy ID"
        value={filters.policyId}
        maxLength={MAX_IDENTIFIER_LENGTH}
        placeholder="Exact policy ID"
        onCommit={(policyId) => update({ policyId })}
      />

      <div className="space-y-2">
        <TextFilterInput
          revision={filters}
          id="filter-asset-identifier"
          label="Asset identifier"
          value={filters.assetIdentifier}
          maxLength={MAX_IDENTIFIER_LENGTH}
          placeholder="Exact asset identifier"
          onCommit={(assetIdentifier) =>
            onChange((current) => ({
              ...current,
              assetIdentifier,
              // Meaningless without an identifier; the URL parser drops it too.
              resolveToLatestVersion: assetIdentifier ? current.resolveToLatestVersion : false,
            }))
          }
        />
        <div className="flex items-start gap-2">
          <Checkbox
            id="filter-resolve-latest"
            className="mt-0.5"
            checked={filters.resolveToLatestVersion}
            disabled={!filters.assetIdentifier}
            aria-describedby="filter-resolve-latest-hint"
            onCheckedChange={(checked) => update({ resolveToLatestVersion: checked === true })}
          />
          <div className="space-y-1">
            <Label htmlFor="filter-resolve-latest" className="font-normal">
              Resolve to the latest version
            </Label>
            <p id="filter-resolve-latest-hint" className="text-xs text-muted-foreground">
              For a V2 agent, an older identifier finds its current version. Needs an asset
              identifier.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-min-health-check">Re-check agents not verified since</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="filter-min-health-check"
            type="date"
            value={filters.minHealthCheckDate}
            max={today()}
            onChange={(event) => update({ minHealthCheckDate: event.target.value })}
            // The browser draws the picker icon; dark mode needs it told the colour scheme.
            className="min-w-36 flex-1 dark:scheme-dark"
          />
          {filters.minHealthCheckDate && (
            <Button variant="outline" onClick={() => update({ minHealthCheckDate: '' })}>
              Clear date
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Any date makes the registry run a live health check on every listed agent, on each load
          and each page, so results load slower. Empty shows the stored status.
        </p>
      </div>
    </section>
  );
}
