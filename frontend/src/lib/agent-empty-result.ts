import { AGENT_STATUSES, shownStatuses, type AgentFilters } from './agent-filters';
import { PAYMENT_TYPE_LABELS } from './display-labels';

// Works out which filter emptied a view: each active filter is left out once, and a probe
// that then finds agents names its filter as the cause.

const FILTER_KEYS = [
  'query',
  'status',
  'paymentTypes',
  'pricing',
  'uptime',
  'onlyOnline',
  'registered',
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
  query: (filters) => filters.query !== '',
  // The default Online status counts: it alone hides most of the registry.
  status: (filters) => shownStatuses(filters).length < AGENT_STATUSES.length,
  paymentTypes: (filters) => filters.paymentTypes.length > 0,
  pricing: (filters) => filters.pricingType !== '' || filters.priceUnit !== '',
  uptime: (filters) => filters.minUptimePercent !== '',
  onlyOnline: (filters) => filters.onlyOnline,
  registered: (filters) => filters.registeredAfter !== '' || filters.registeredBefore !== '',
  policyId: (filters) => filters.policyId !== '',
  assetIdentifier: (filters) => filters.assetIdentifier !== '',
  tags: (filters) => filters.tags.length > 0,
  capability: (filters) => filters.capabilityName !== '',
};

const clearFilter: Record<FilterKey, (filters: AgentFilters) => AgentFilters> = {
  query: (filters) => ({ ...filters, query: '' }),
  status: (filters) => ({ ...filters, statuses: [...AGENT_STATUSES], excludedStatuses: [] }),
  paymentTypes: (filters) => ({ ...filters, paymentTypes: [] }),
  pricing: (filters) => ({
    ...filters,
    pricingType: '',
    priceUnit: '',
    minPrice: '',
    maxPrice: '',
    // A price sort cannot outlive its unit.
    sortBy: filters.sortBy === 'price' ? '' : filters.sortBy,
  }),
  uptime: (filters) => ({ ...filters, minUptimePercent: '' }),
  onlyOnline: (filters) => ({ ...filters, onlyOnline: false }),
  registered: (filters) => ({ ...filters, registeredAfter: '', registeredBefore: '' }),
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
  query: (filters) => `Search: “${filters.query}”`,
  status: (filters) =>
    filters.excludedStatuses.length > 0
      ? `Hidden status: ${filters.excludedStatuses.join(', ')}`
      : `Status: ${filters.statuses.join(', ')}`,
  paymentTypes: (filters) =>
    `Payment type: ${filters.paymentTypes.map((type) => PAYMENT_TYPE_LABELS[type]).join(', ')}`,
  pricing: (filters) => {
    const range = [
      filters.minPrice && `from ${filters.minPrice}`,
      filters.maxPrice && `up to ${filters.maxPrice}`,
    ].filter(Boolean);
    return `Pricing: ${[filters.pricingType, filters.priceUnit, ...range].filter(Boolean).join(' ')}`;
  },
  uptime: (filters) => `Uptime: at least ${filters.minUptimePercent}%`,
  onlyOnline: () => 'Only Online',
  registered: (filters) =>
    `Registered: ${[
      filters.registeredAfter && `from ${filters.registeredAfter}`,
      filters.registeredBefore && `until ${filters.registeredBefore}`,
    ]
      .filter(Boolean)
      .join(' ')}`,
  policyId: (filters) => `Policy ID: ${filters.policyId}`,
  assetIdentifier: (filters) =>
    `Asset identifier: ${filters.assetIdentifier}${filters.resolveToLatestVersion ? ' (latest version)' : ''}`,
  tags: (filters) => `Tags: ${filters.tags.join(', ')}`,
  capability: (filters) =>
    `Capability: ${[filters.capabilityName, filters.capabilityVersion].filter(Boolean).join(' ')}`,
};

/**
 * What narrows the view, search text included, in a fixed order. The health re-check date
 * and the sort do not narrow it.
 */
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
  // A probe only asks whether anything would show. It must never force live health checks,
  // nor ask for a sort, which makes the API rank the whole filtered set.
  const base: AgentFilters = { ...filters, lastCheckedAfter: '', sortBy: '' };
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
