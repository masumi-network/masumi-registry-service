import { ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Must match registry-entry API `sort` enum. */
export type AgentSortKey =
  | 'createdAt-desc'
  | 'createdAt-asc'
  | 'name-asc'
  | 'name-desc'
  | 'lastUptimeCheck-desc'
  | 'lastUptimeCheck-asc';

export const DEFAULT_AGENT_SORT: AgentSortKey = 'createdAt-desc';

const SORT_OPTIONS: { value: AgentSortKey; label: string }[] = [
  { value: 'createdAt-desc', label: 'Newest registered' },
  { value: 'createdAt-asc', label: 'Oldest registered' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'lastUptimeCheck-desc', label: 'Last check (newest)' },
  { value: 'lastUptimeCheck-asc', label: 'Last check (oldest)' },
];

type AgentSortProps = {
  sort: AgentSortKey;
  onChange: (sort: AgentSortKey) => void;
};

export function AgentSort({ sort, onChange }: AgentSortProps) {
  return (
    <Select value={sort} onValueChange={(value) => onChange(value as AgentSortKey)}>
      <SelectTrigger className="h-9 w-auto min-w-[12rem] gap-2 border-foreground/20 bg-transparent hover:border-foreground/30 focus:ring-0">
        <ArrowUpDown className="h-4 w-4 shrink-0 opacity-100" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[12rem]">
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
