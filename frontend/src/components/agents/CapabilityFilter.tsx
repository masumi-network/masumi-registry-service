import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Client } from '@/lib/api/generated/client';
import { useCapabilityOptions } from '@/lib/queries/useCapabilityOptions';

// Radix Select items cannot have an empty value, so "any" needs a stand-in.
const ANY = '__any__';

interface CapabilityFilterProps {
  name: string;
  version: string;
  onChange: (name: string, version: string) => void;
  apiClient?: Client;
}

/** Keeps a value from the URL selectable even when the option list does not offer it. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

export function CapabilityFilter({ name, version, onChange, apiClient }: CapabilityFilterProps) {
  const { data: options, isPending, isError } = useCapabilityOptions(apiClient);
  // The endpoint lists only capabilities of Online agents, so a shared link may name one
  // that is missing here; it still has to show as selected.
  const names = withCurrent(options?.map((option) => option.name) ?? [], name);
  const versions = withCurrent(
    options?.find((option) => option.name === name)?.versions ?? [],
    version,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="filter-capability">Capability</Label>
        <Select
          value={name || ANY}
          onValueChange={(next) => onChange(next === ANY ? '' : next, '')}
        >
          <SelectTrigger
            id="filter-capability"
            className="h-9"
            aria-describedby="filter-capability-hint"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any capability</SelectItem>
            {names.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="filter-capability-hint" className="text-xs text-muted-foreground">
          {isPending
            ? 'Loading capabilities…'
            : isError
              ? 'Could not load the capability list.'
              : 'Lists capabilities of agents that are currently Online.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-capability-version">Capability version</Label>
        <Select
          value={version || ANY}
          disabled={!name}
          onValueChange={(next) => onChange(name, next === ANY ? '' : next)}
        >
          <SelectTrigger id="filter-capability-version" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any version</SelectItem>
            {versions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
