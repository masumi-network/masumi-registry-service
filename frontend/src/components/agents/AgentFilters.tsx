import { ListFilter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RegistryEntry } from '@/lib/api/generated';

export type AgentStatus = RegistryEntry['status'];
export type AgentPaymentType = 'Web3CardanoV1' | 'Web3CardanoV2' | 'None';

export type AgentFilterState = {
  status: AgentStatus | null;
  paymentType: AgentPaymentType | null;
};

export const EMPTY_AGENT_FILTERS: AgentFilterState = {
  status: null,
  paymentType: null,
};

const AGENT_STATUSES: AgentStatus[] = ['Online', 'Offline', 'Deregistered', 'Invalid'];
const PAYMENT_TYPES: { value: AgentPaymentType; label: string }[] = [
  { value: 'Web3CardanoV1', label: 'Cardano V1' },
  { value: 'Web3CardanoV2', label: 'Cardano V2' },
  { value: 'None', label: 'None' },
];

// Radix Select cannot use an empty-string item value.
const ANY = '__any__';

export function countActiveAgentFilters(filters: AgentFilterState): number {
  return (filters.status ? 1 : 0) + (filters.paymentType ? 1 : 0);
}

export function toRegistryEntryFilter(filters: AgentFilterState) {
  const filter: {
    status?: AgentStatus[];
    paymentTypes?: AgentPaymentType[];
  } = {};
  if (filters.status) filter.status = [filters.status];
  if (filters.paymentType) filter.paymentTypes = [filters.paymentType];
  return Object.keys(filter).length > 0 ? filter : undefined;
}

type AgentFiltersProps = {
  filters: AgentFilterState;
  onChange: (filters: AgentFilterState) => void;
};

export function AgentFilters({ filters, onChange }: AgentFiltersProps) {
  const activeCount = countActiveAgentFilters(filters);

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <ListFilter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 space-y-4 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Filters</span>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => onChange(EMPTY_AGENT_FILTERS)}
            >
              <X className="mr-1 h-3 w-3" />
              Clear all
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select
            value={filters.status ?? ANY}
            onValueChange={(value) =>
              onChange({
                ...filters,
                status: value === ANY ? null : (value as AgentStatus),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {AGENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Payment type</label>
          <Select
            value={filters.paymentType ?? ANY}
            onValueChange={(value) =>
              onChange({
                ...filters,
                paymentType: value === ANY ? null : (value as AgentPaymentType),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any payment type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any payment type</SelectItem>
              {PAYMENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
