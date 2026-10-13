import { AGENT_STATUSES, type AgentFilters } from './agent-filters';
import { PAYMENT_TYPE_LABELS } from './display-labels';

// Works out which filter emptied a view: each active filter is left out once, and a probe
// that then finds agents names its filter as the cause.

const FILTER_KEYS = [
  'status',
  'paymentTypes',
  'policyId',
  'assetIdentifier',
  'tags',
  'capability',
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];
export type ProbeId = FilterKey | 'unfiltered';
export type ProbeOutcome = 'pending' | 'results' | 'empty' | 'error';

export type EmptyResultExplanation =
  | { kind: 'checking' }
  /** Removing any one of these filters on its own brings agents back. */
  | { kind: 'single'; keys: FilterKey[] }
  /** No single filter is responsible; only these filters together are. */
  | { kind: 'combination'; keys: FilterKey[] }
  | { kind: 'network-empty' }
  | { kind: 'unknown'; keys: FilterKey[] };

export interface EmptyResultProbe {
  id: ProbeId;
  filters: AgentFilters;
}

const isFilterActive: Record<FilterKey, (filters: AgentFilters) => boolean> = {
  // The default Online status counts: it alone hides most of the registry.
  status: (filters) => filters.statuses.length < AGENT_STATUSES.length,
  paymentTypes: (filters) => filters.paymentTypes.length > 0,
  policyId: (filters) => filters.policyId !== '',
  assetIdentifier: (filters) => filters.assetIdentifier !== '',
  tags: (filters) => filters.tags.length > 0,
  capability: (filters) => filters.capabilityName !== '',
};

const clearFilter: Record<FilterKey, (filters: AgentFilters) => AgentFilters> = {
  status: (filters) => ({ ...filters, statuses: [...AGENT_STATUSES] }),
  paymentTypes: (filters) => ({ ...filters, paymentTypes: [] }),
  policyId: (filters) => ({ ...filters, policyId: '' }),
  assetIdentifier: (filters) => ({
    ...filters,
    assetIdentifier: '',
    resolveToLatestVersion: false,
  }),
  tags: (filters) => ({ ...filters, tags: [] }),
  capability: (filters) => ({ ...filters, capabilityName: '', capabilityVersion: '' }),
};

const describers: Record<FilterKey, (filters: AgentFilters) => string> = {
  status: (filters) => `Status: ${filters.statuses.join(', ')}`,
  paymentTypes: (filters) =>
    `Payment type: ${filters.paymentTypes.map((type) => PAYMENT_TYPE_LABELS[type]).join(', ')}`,
  policyId: (filters) => `Policy ID: ${filters.policyId}`,
  assetIdentifier: (filters) =>
    `Asset identifier: ${filters.assetIdentifier}${filters.resolveToLatestVersion ? ' (latest version)' : ''}`,
  tags: (filters) => `Tags: ${filters.tags.join(', ')}`,
  capability: (filters) =>
    `Capability: ${[filters.capabilityName, filters.capabilityVersion].filter(Boolean).join(' ')}`,
};

/** Filters that narrow the view, in a fixed order. The health re-check date is not one. */
export function activeFilterKeys(filters: AgentFilters): FilterKey[] {
  return FILTER_KEYS.filter((key) => isFilterActive[key](filters));
}

/** The view with one filter reset: what a probe asks for, and what removing a chip does. */
export function withoutFilter(filters: AgentFilters, key: FilterKey): AgentFilters {
  return clearFilter[key](filters);
}

export function describeFilter(filters: AgentFilters, key: FilterKey): string {
  return describers[key](filters);
}

export function planEmptyResultProbes(filters: AgentFilters): EmptyResultProbe[] {
  // A probe only asks whether anything would show; it must never force live health checks.
  const base: AgentFilters = { ...filters, minHealthCheckDate: '' };
  const keys = activeFilterKeys(base);
  const probes: EmptyResultProbe[] = keys.map((key) => ({
    id: key,
    filters: withoutFilter(base, key),
  }));
  // With a single active filter, leaving it out already is the unfiltered list.
  if (keys.length < 2) return probes;
  const unfiltered = keys.reduce((current, key) => withoutFilter(current, key), base);
  return [...probes, { id: 'unfiltered', filters: unfiltered }];
}

export function explainEmptyResult(
  keys: readonly FilterKey[],
  outcomes: Readonly<Partial<Record<ProbeId, ProbeOutcome>>>,
): EmptyResultExplanation {
  if (keys.length === 0) return { kind: 'network-empty' };

  const probeIds: ProbeId[] = keys.length > 1 ? [...keys, 'unfiltered'] : [...keys];
  // Answering early would let the message change under the reader as probes arrive.
  if (probeIds.some((id) => (outcomes[id] ?? 'pending') === 'pending')) return { kind: 'checking' };

  const culprits = keys.filter((key) => outcomes[key] === 'results');
  if (culprits.length > 0) return { kind: 'single', keys: culprits };
  if (probeIds.some((id) => outcomes[id] === 'error')) return { kind: 'unknown', keys: [...keys] };
  if (keys.length > 1 && outcomes.unfiltered === 'results') {
    return { kind: 'combination', keys: [...keys] };
  }
  return { kind: 'network-empty' };
}
