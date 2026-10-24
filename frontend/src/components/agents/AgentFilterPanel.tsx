import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CapabilityFilter } from '@/components/agents/CapabilityFilter';
import { PricingFilter } from '@/components/agents/PricingFilter';
import { StatusFilter } from '@/components/agents/StatusFilter';
import { TagFilterInput } from '@/components/agents/TagFilterInput';
import { TextFilterInput } from '@/components/agents/TextFilterInput';
import {
  isValidUptimePercent,
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
 * One control per filter the registry list and search endpoints accept. Every change applies at once, to
 * the newest view (`onChange` takes an update, not a value), so quick changes never undo
 * each other.
 */
export function AgentFilterPanel({ id, filters, onChange, className }: AgentFilterPanelProps) {
  const update = (patch: Partial<AgentFilters>) =>
    onChange((current) => ({ ...current, ...patch }));
  const isDefault = sameView(resetFilters(filters), filters);

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

      <StatusFilter filters={filters} onChange={onChange} />

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

      <PricingFilter filters={filters} onChange={onChange} />

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

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Health</legend>
        <TextFilterInput
          revision={filters}
          id="filter-min-uptime"
          label="Minimum uptime (%)"
          labelClassName="font-normal"
          value={filters.minUptimePercent}
          maxLength={6}
          inputMode="decimal"
          placeholder="e.g. 95"
          validate={(value) => (isValidUptimePercent(value) ? null : 'A number from 0 to 100.')}
          hint="Share of health checks passed. Agents never checked are left out."
          onCommit={(minUptimePercent) => update({ minUptimePercent })}
        />
        <div className="flex items-start gap-2">
          <Checkbox
            id="filter-only-online"
            className="mt-0.5"
            checked={filters.onlyOnline}
            aria-describedby="filter-only-online-hint"
            onCheckedChange={(checked) => update({ onlyOnline: checked === true })}
          />
          <div className="space-y-1">
            <Label htmlFor="filter-only-online" className="font-normal">
              Only Online
            </Label>
            <p id="filter-only-online-hint" className="text-xs text-muted-foreground">
              Narrows any status selection to Online agents.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-last-checked" className="font-normal">
            Re-check agents not verified since
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="filter-last-checked"
              type="date"
              value={filters.lastCheckedAfter}
              max={today()}
              onChange={(event) => update({ lastCheckedAfter: event.target.value })}
              // The browser draws the picker icon; dark mode needs it told the colour scheme.
              className="min-w-36 flex-1 dark:scheme-dark"
            />
            {filters.lastCheckedAfter && (
              <Button variant="outline" onClick={() => update({ lastCheckedAfter: '' })}>
                Clear date
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Any date makes the registry run a live health check on every listed agent, on each load
            and each page, so results load slower. Empty shows the stored status.
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">First seen</legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="filter-registered-after" className="font-normal">
              From
            </Label>
            <Input
              id="filter-registered-after"
              type="date"
              value={filters.registeredAfter}
              max={filters.registeredBefore || undefined}
              onChange={(event) => update({ registeredAfter: event.target.value })}
              className="dark:scheme-dark"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-registered-before" className="font-normal">
              Until
            </Label>
            <Input
              id="filter-registered-before"
              type="date"
              value={filters.registeredBefore}
              min={filters.registeredAfter || undefined}
              onChange={(event) => update({ registeredBefore: event.target.value })}
              className="dark:scheme-dark"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          When the registry first saw the agent. Both days are included.
        </p>
      </fieldset>
    </section>
  );
}
