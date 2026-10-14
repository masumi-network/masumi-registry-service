import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TextFilterInput } from '@/components/agents/TextFilterInput';
import {
  MAX_UNIT_LENGTH,
  PRICING_TYPES,
  isValidAmount,
  type AgentFilters,
  type PricingType,
} from '@/lib/agent-filters';
import type { AgentFiltersUpdate } from '@/lib/hooks/useAgentFilters';

interface PricingFilterProps {
  filters: AgentFilters;
  onChange: (update: AgentFiltersUpdate) => void;
}

// Radix Select cannot hold an empty value, so "any" stands in for no pricing filter.
const ANY = 'any';

/** Clears the unit and what depends on it: the amount range and a price sort. */
function withoutUnit(filters: AgentFilters): AgentFilters {
  return {
    ...filters,
    priceUnit: '',
    minPrice: '',
    maxPrice: '',
    sortBy: filters.sortBy === 'price' ? '' : filters.sortBy,
  };
}

function amountError(value: string): string | null {
  return isValidAmount(value) ? null : 'A whole number of base units, up to 19 digits.';
}

/** `filter.pricing`: pricing model, and for Fixed prices a unit with an amount range. */
export function PricingFilter({ filters, onChange }: PricingFilterProps) {
  const update = (patch: Partial<AgentFilters>) =>
    onChange((current) => ({ ...current, ...patch }));
  // The API takes a unit and amounts only for Fixed pricing (or an unset model).
  const takesUnit = filters.pricingType === '' || filters.pricingType === 'Fixed';
  const hasUnit = filters.priceUnit !== '';

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Pricing</legend>
      <div className="space-y-1.5">
        <Label htmlFor="filter-pricing-type" className="font-normal">
          Pricing model
        </Label>
        <Select
          value={filters.pricingType || ANY}
          onValueChange={(next) => {
            const pricingType: PricingType | '' = PRICING_TYPES.find((type) => type === next) ?? '';
            onChange((current) => {
              const typed = { ...current, pricingType };
              return pricingType === 'Free' || pricingType === 'Dynamic'
                ? withoutUnit(typed)
                : typed;
            });
          }}
        >
          <SelectTrigger id="filter-pricing-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            {PRICING_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TextFilterInput
        revision={filters}
        id="filter-price-unit"
        label="Price unit"
        labelClassName="font-normal"
        value={filters.priceUnit}
        maxLength={MAX_UNIT_LENGTH}
        placeholder="lovelace, or policy ID + asset name"
        disabled={!takesUnit}
        hint={
          takesUnit
            ? 'Only agents with a fixed price in this unit. Needed to sort by price.'
            : 'Free and Dynamic pricing have no unit.'
        }
        onCommit={(priceUnit) =>
          onChange((current) => (priceUnit ? { ...current, priceUnit } : withoutUnit(current)))
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <TextFilterInput
          revision={filters}
          id="filter-min-price"
          label="Min price"
          labelClassName="font-normal"
          value={filters.minPrice}
          maxLength={19}
          inputMode="numeric"
          disabled={!hasUnit}
          validate={(value) =>
            amountError(value) ??
            (filters.maxPrice && BigInt(value) > BigInt(filters.maxPrice)
              ? 'Above the max price.'
              : null)
          }
          onCommit={(minPrice) => update({ minPrice })}
        />
        <TextFilterInput
          revision={filters}
          id="filter-max-price"
          label="Max price"
          labelClassName="font-normal"
          value={filters.maxPrice}
          maxLength={19}
          inputMode="numeric"
          disabled={!hasUnit}
          validate={(value) =>
            amountError(value) ??
            (filters.minPrice && BigInt(value) < BigInt(filters.minPrice)
              ? 'Below the min price.'
              : null)
          }
          onCommit={(maxPrice) => update({ maxPrice })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Amounts are in base units (1 ADA = 1,000,000 lovelace) and need a unit.
      </p>
    </fieldset>
  );
}
