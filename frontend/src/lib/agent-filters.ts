import type { ParsedUrlQuery } from 'querystring';
import { z } from 'zod';
import type {
  PostRegistryEntryData,
  PostRegistryEntrySearchData,
  RegistryEntryFilter,
} from '@/lib/api/generated';

export const AGENT_STATUSES = ['Online', 'Offline', 'Deregistered', 'Invalid'] as const;
export const PAYMENT_TYPES = ['Web3CardanoV1', 'Web3CardanoV2', 'None'] as const;
export const PRICING_TYPES = ['Fixed', 'Free', 'Dynamic'] as const;
export const NETWORKS = ['Preprod', 'Mainnet'] as const;
export const PAGE_SIZES = [10, 25, 50] as const;
// Every sortBy the search endpoint takes; the query endpoint takes all but `relevance`.
export const SORT_OPTIONS = ['relevance', 'score', 'uptime', 'price', 'recency'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type PricingType = (typeof PRICING_TYPES)[number];
export type Network = (typeof NETWORKS)[number];
export type PageSize = (typeof PAGE_SIZES)[number];
export type SortBy = (typeof SORT_OPTIONS)[number];

// Bounds mirror registryEntryFilterSchema and searchRegistrySchemaInput in
// src/routes/api/registry-entry/schemas.ts.
export const MAX_IDENTIFIER_LENGTH = 250;
const MAX_CAPABILITY_LENGTH = 150;
export const MAX_TAG_LENGTH = 150;
export const MAX_QUERY_LENGTH = 120;
export const MAX_UNIT_LENGTH = 250;
// The API takes any number of tags, but a link is untrusted input: cap what one can carry.
export const MAX_TAGS = 20;
const DEFAULT_PAGE_SIZE: PageSize = 10;
// Prices are base units capped at the Postgres BIGINT max (pricingAmountSchema).
const MAX_AMOUNT = BigInt('9223372036854775807');

/**
 * One agent-browser view. Every field maps to one API parameter; empty strings and arrays
 * mean "not set", except `statuses`, which is never empty (see DEFAULT_STATUSES).
 */
export interface AgentFilters {
  /** Search text. Non-empty switches the list to `POST /registry-entry/search`. */
  query: string;
  /** '' is the default order: relevance while searching, the registry's own otherwise. */
  sortBy: SortBy | '';
  /** Statuses to show. Ignored while `excludedStatuses` is set. */
  statuses: AgentStatus[];
  /** Statuses to hide (`excludeStatus`), 1-3 of them; empty means `statuses` applies. */
  excludedStatuses: AgentStatus[];
  paymentTypes: PaymentType[];
  pricingType: PricingType | '';
  /** Fixed-price unit; needed by the amount range and by sortBy=price. */
  priceUnit: string;
  /** Base units as digit strings, only with a unit. */
  minPrice: string;
  maxPrice: string;
  /** 0-100 as typed, or empty. */
  minUptimePercent: string;
  onlyOnline: boolean;
  /** `yyyy-MM-dd`, or empty for no forced re-check. */
  lastCheckedAfter: string;
  /** `yyyy-MM-dd` first-seen bounds, both inclusive. */
  registeredAfter: string;
  registeredBefore: string;
  policyId: string;
  assetIdentifier: string;
  resolveToLatestVersion: boolean;
  tags: string[];
  capabilityName: string;
  capabilityVersion: string;
  pageSize: PageSize;
}

// Without a status filter the API returns Online agents only, so that is the default the UI
// shows and always sends: an empty selection would silently mean "Online" server side.
const DEFAULT_STATUSES: AgentStatus[] = ['Online'];

const DEFAULT_AGENT_FILTERS: Readonly<AgentFilters> = {
  query: '',
  sortBy: '',
  statuses: [...DEFAULT_STATUSES],
  excludedStatuses: [],
  paymentTypes: [],
  pricingType: '',
  priceUnit: '',
  minPrice: '',
  maxPrice: '',
  minUptimePercent: '',
  onlyOnline: false,
  lastCheckedAfter: '',
  registeredAfter: '',
  registeredBefore: '',
  policyId: '',
  assetIdentifier: '',
  resolveToLatestVersion: false,
  tags: [],
  capabilityName: '',
  capabilityVersion: '',
  pageSize: DEFAULT_PAGE_SIZE,
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `yyyy-MM-dd` string as local midnight, or null when it is not a real day. */
function parseDay(value: string): Date | null {
  const match = DAY.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  // Date rolls 2026-02-30 over into March; a real day survives the round trip.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** The last millisecond of a `yyyy-MM-dd` day, local time: an inclusive upper bound. */
function endOfDay(value: string): Date | null {
  const start = parseDay(value);
  return start && new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, -1);
}

/** Today as `yyyy-MM-dd` in local time, the format `<input type="date">` uses. */
export function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** A base-unit amount the API accepts: 1-19 digits, at most the BIGINT max. */
export function isValidAmount(value: string): boolean {
  return /^\d{1,19}$/.test(value) && BigInt(value) <= MAX_AMOUNT;
}

/** A minimum-uptime percentage the API accepts: 0-100. */
export function isValidUptimePercent(value: string): boolean {
  return /^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100;
}

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const allValues = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// Each field falls back on its own, so one bad parameter never wipes the rest of a view.
const boundedText = (maxLength: number) =>
  z.preprocess(firstValue, z.string().trim().max(maxLength)).catch('');
// Capability names come from on-chain metadata and the API matches them exactly, so a
// name with surrounding spaces must survive the URL round trip untouched.
const verbatimText = (maxLength: number) =>
  z.preprocess(firstValue, z.string().max(maxLength)).catch('');

// Keeps the allowed values in their canonical order, so one view always has one URL.
const enumValues = <T extends string>(allowed: readonly T[]) =>
  z
    .preprocess(allValues, z.array(z.unknown()))
    .transform((raw) => allowed.filter((value) => raw.includes(value)));
const enumValue = <T extends string>(allowed: readonly T[]) =>
  z
    .preprocess(firstValue, z.unknown())
    .transform((raw): T | '' => allowed.find((value) => value === raw) ?? '');

const checkedText = (isValid: (value: string) => boolean) =>
  z.preprocess(firstValue, z.string().trim()).refine(isValid).catch('');
// Canonical spellings ("007" -> "7", "95.50" -> "95.5"), so one view has one URL.
const amountText = checkedText(isValidAmount).transform((v) => (v ? BigInt(v).toString() : ''));
const uptimeText = checkedText(isValidUptimePercent).transform((v) => (v ? String(Number(v)) : ''));
const realDay = checkedText((value) => parseDay(value) !== null);
// A real day, and not a future one, which the picker (max today) never offers. Any date
// makes the API live-check every listed agent, so the panel copy says so.
const pastDay = checkedText((value) => parseDay(value) !== null && value <= today());
const flag = z.preprocess(firstValue, z.unknown()).transform((v) => v === 'true');

const tagSchema = z.string().trim().min(1).max(MAX_TAG_LENGTH);

const agentFiltersQuerySchema = z.object({
  q: boundedText(MAX_QUERY_LENGTH),
  sortBy: enumValue(SORT_OPTIONS),
  status: enumValues(AGENT_STATUSES),
  excludeStatus: enumValues(AGENT_STATUSES),
  paymentTypes: enumValues(PAYMENT_TYPES),
  pricingType: enumValue(PRICING_TYPES),
  priceUnit: boundedText(MAX_UNIT_LENGTH),
  minPrice: amountText,
  maxPrice: amountText,
  minUptime: uptimeText,
  onlyOnline: flag,
  lastCheckedAfter: pastDay,
  // The pre-MAS-614 name of lastCheckedAfter, still read so old links keep working.
  minHealthCheckDate: pastDay,
  registeredAfter: realDay,
  registeredBefore: realDay,
  policyId: boundedText(MAX_IDENTIFIER_LENGTH),
  assetIdentifier: boundedText(MAX_IDENTIFIER_LENGTH),
  resolveToLatestVersion: flag,
  tags: z.preprocess(allValues, z.array(z.unknown())).transform((raw) => {
    const valid = raw.flatMap((value) => {
      const tag = tagSchema.safeParse(value);
      return tag.success ? [tag.data] : [];
    });
    return [...new Set(valid)].slice(0, MAX_TAGS);
  }),
  capability: verbatimText(MAX_CAPABILITY_LENGTH),
  capabilityVersion: verbatimText(MAX_CAPABILITY_LENGTH),
  limit: z
    .preprocess(firstValue, z.coerce.number())
    .pipe(z.union(PAGE_SIZES.map((size) => z.literal(size))))
    .catch(DEFAULT_PAGE_SIZE),
});

/**
 * The sortBy a view sends, or undefined for the API's default order. Relevance only exists
 * for a search and is its default; price needs a unit (sortBy=price requires
 * filter.pricing.unit), so without one the view falls back to the default order.
 */
export function effectiveSortBy(
  filters: Pick<AgentFilters, 'query' | 'sortBy' | 'priceUnit'>,
): SortBy | undefined {
  const sortBy = filters.sortBy || (filters.query ? 'relevance' : undefined);
  if (sortBy === 'relevance' && !filters.query) return undefined;
  if (sortBy === 'price' && !filters.priceUnit) return undefined;
  return sortBy;
}

export function parseAgentFilters(query: ParsedUrlQuery): AgentFilters {
  const raw = agentFiltersQuerySchema.parse(query);
  // Hiding every status would hide everything; a valid exclusion hides 1-3 of them.
  const excludedStatuses =
    raw.excludeStatus.length < AGENT_STATUSES.length ? raw.excludeStatus : [];
  // A unit and amounts only apply to Fixed pricing (the API rejects them otherwise).
  const priceUnit = raw.pricingType === '' || raw.pricingType === 'Fixed' ? raw.priceUnit : '';
  const minPrice = priceUnit ? raw.minPrice : '';
  const maxPrice =
    priceUnit && !(minPrice && raw.maxPrice && BigInt(minPrice) > BigInt(raw.maxPrice))
      ? raw.maxPrice
      : '';
  const sortBy = raw.sortBy === 'relevance' ? '' : raw.sortBy;
  return {
    query: raw.q,
    // Relevance is the search default, and a price sort without a unit cannot be sent:
    // either way the view is the default order, which has one URL.
    sortBy: sortBy === 'price' && !priceUnit ? '' : sortBy,
    statuses:
      excludedStatuses.length === 0 && raw.status.length > 0 ? raw.status : [...DEFAULT_STATUSES],
    excludedStatuses,
    paymentTypes: raw.paymentTypes,
    pricingType: raw.pricingType,
    priceUnit,
    minPrice,
    maxPrice,
    minUptimePercent: raw.minUptime,
    onlyOnline: raw.onlyOnline,
    lastCheckedAfter: raw.lastCheckedAfter || raw.minHealthCheckDate,
    registeredAfter: raw.registeredAfter,
    registeredBefore: raw.registeredBefore,
    policyId: raw.policyId,
    assetIdentifier: raw.assetIdentifier,
    // The API ignores it without an asset identifier; keeping it would give one view two URLs.
    resolveToLatestVersion: raw.resolveToLatestVersion && raw.assetIdentifier !== '',
    tags: raw.tags,
    capabilityName: raw.capability,
    // The API takes a version only as part of a named capability.
    capabilityVersion: raw.capability === '' ? '' : raw.capabilityVersion,
    pageSize: raw.limit,
  };
}

/** Turns one value of a multi-select on or off, keeping the canonical order of `allowed`. */
export function toggleValue<T extends string>(
  allowed: readonly T[],
  selected: readonly T[],
  value: T,
  isOn: boolean,
): T[] {
  return allowed.filter((option) => (option === value ? isOn : selected.includes(option)));
}

export function isDefaultStatusSelection(statuses: readonly AgentStatus[]): boolean {
  return statuses.length === DEFAULT_STATUSES.length && statuses[0] === DEFAULT_STATUSES[0];
}

/** The statuses a view lets through, whichever way (show or hide) it states them. */
export function shownStatuses(filters: AgentFilters): AgentStatus[] {
  return filters.excludedStatuses.length > 0
    ? AGENT_STATUSES.filter((status) => !filters.excludedStatuses.includes(status))
    : filters.statuses;
}

/**
 * Switches the status filter between "show these" and "hide these" without changing what
 * the view shows: the new selection is the complement of the old one. Showing every status
 * has nothing to hide, so that view stays as it is.
 */
export function setStatusMode(filters: AgentFilters, mode: 'show' | 'hide'): AgentFilters {
  const isHiding = filters.excludedStatuses.length > 0;
  if (mode === 'hide' && !isHiding) {
    const hidden = AGENT_STATUSES.filter((status) => !filters.statuses.includes(status));
    return hidden.length === 0
      ? filters
      : { ...filters, excludedStatuses: hidden, statuses: [...DEFAULT_STATUSES] };
  }
  if (mode === 'show' && isHiding) {
    return { ...filters, statuses: shownStatuses(filters), excludedStatuses: [] };
  }
  return filters;
}

/** The URL query for a view. Defaults are left out; arrays become repeated parameters. */
export function serializeAgentFilters(filters: AgentFilters): Record<string, string | string[]> {
  const sortBy = effectiveSortBy(filters);
  const isHiding = filters.excludedStatuses.length > 0;
  const entries: [string, string | string[] | undefined][] = [
    ['q', filters.query || undefined],
    // Relevance is what a search does without a sortBy, so it needs no parameter.
    ['sortBy', sortBy === 'relevance' ? undefined : sortBy],
    [
      'status',
      isHiding || isDefaultStatusSelection(filters.statuses) ? undefined : filters.statuses,
    ],
    ['excludeStatus', isHiding ? filters.excludedStatuses : undefined],
    ['paymentTypes', filters.paymentTypes.length > 0 ? filters.paymentTypes : undefined],
    ['pricingType', filters.pricingType || undefined],
    ['priceUnit', filters.priceUnit || undefined],
    ['minPrice', (filters.priceUnit && filters.minPrice) || undefined],
    ['maxPrice', (filters.priceUnit && filters.maxPrice) || undefined],
    ['minUptime', filters.minUptimePercent || undefined],
    ['onlyOnline', filters.onlyOnline ? 'true' : undefined],
    ['lastCheckedAfter', filters.lastCheckedAfter || undefined],
    ['registeredAfter', filters.registeredAfter || undefined],
    ['registeredBefore', filters.registeredBefore || undefined],
    ['policyId', filters.policyId || undefined],
    ['assetIdentifier', filters.assetIdentifier || undefined],
    ['resolveToLatestVersion', filters.resolveToLatestVersion ? 'true' : undefined],
    ['tags', filters.tags.length > 0 ? filters.tags : undefined],
    ['capability', filters.capabilityName || undefined],
    ['capabilityVersion', filters.capabilityVersion || undefined],
    ['limit', filters.pageSize === DEFAULT_PAGE_SIZE ? undefined : String(filters.pageSize)],
  ];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string | string[]] => entry[1] !== undefined),
  );
}

/** True when two views have the same URL, i.e. would show the same agents. */
export function sameView(left: AgentFilters, right: AgentFilters): boolean {
  return (
    JSON.stringify(serializeAgentFilters(left)) === JSON.stringify(serializeAgentFilters(right))
  );
}

/**
 * Every filter back to its default. The page size, search text and sort stay: the first is
 * a display choice, the other two have their own controls outside the filter panel.
 */
export function resetFilters(filters: AgentFilters): AgentFilters {
  return {
    ...DEFAULT_AGENT_FILTERS,
    statuses: [...DEFAULT_STATUSES],
    pageSize: filters.pageSize,
    query: filters.query,
    // A price sort cannot outlive the unit the reset clears; the URL parser drops it too.
    sortBy: filters.sortBy === 'price' ? '' : filters.sortBy,
  };
}

export function parseNetwork(value: unknown): Network | undefined {
  return NETWORKS.find((network) => network === value);
}

export type RegistryQueryBody = NonNullable<PostRegistryEntryData['body']>;
type RegistrySearchBody = NonNullable<PostRegistryEntrySearchData['body']>;

/** One list request: a search while the view has search text, a plain query otherwise. */
export type RegistryListRequest =
  | { endpoint: 'query'; body: RegistryQueryBody }
  | { endpoint: 'search'; body: RegistrySearchBody };

function buildPricingFilter(filters: AgentFilters): RegistryEntryFilter['pricing'] {
  if (!filters.pricingType && !filters.priceUnit) return undefined;
  const unit = filters.priceUnit || undefined;
  return {
    pricingType: filters.pricingType || undefined,
    unit,
    minAmount: (unit && filters.minPrice) || undefined,
    maxAmount: (unit && filters.maxPrice) || undefined,
  };
}

function buildHealthFilter(filters: AgentFilters): RegistryEntryFilter['health'] {
  const minUptimePercent = isValidUptimePercent(filters.minUptimePercent)
    ? Number(filters.minUptimePercent)
    : undefined;
  const lastCheckedAfter = parseDay(filters.lastCheckedAfter) ?? undefined;
  const onlyOnline = filters.onlyOnline || undefined;
  if (minUptimePercent === undefined && !lastCheckedAfter && !onlyOnline) return undefined;
  return { minUptimePercent, lastCheckedAfter, onlyOnline };
}

/** The `filter` object every list request sends for a view. */
function buildRegistryEntryFilter(filters: AgentFilters): RegistryEntryFilter {
  const isHiding = filters.excludedStatuses.length > 0;
  // Unset filters are left undefined: JSON drops them, on the wire and in query keys alike.
  return {
    // Hiding sends excludeStatus alone: without `status` the API keeps every other status.
    status: isHiding ? undefined : filters.statuses,
    excludeStatus: isHiding ? filters.excludedStatuses : undefined,
    paymentTypes: filters.paymentTypes.length > 0 ? filters.paymentTypes : undefined,
    pricing: buildPricingFilter(filters),
    health: buildHealthFilter(filters),
    registeredAfter: parseDay(filters.registeredAfter) ?? undefined,
    registeredBefore: endOfDay(filters.registeredBefore) ?? undefined,
    policyId: filters.policyId || undefined,
    assetIdentifier: filters.assetIdentifier || undefined,
    resolveToLatestVersion:
      (filters.resolveToLatestVersion && !!filters.assetIdentifier) || undefined,
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    capability: filters.capabilityName
      ? { name: filters.capabilityName, version: filters.capabilityVersion || undefined }
      : undefined,
  };
}

/** The list request for a view and one page of it. */
export function buildRegistryListRequest(
  filters: AgentFilters,
  network: Network,
  page: Readonly<{ limit: number; cursorId?: string }>,
): RegistryListRequest {
  const common = {
    network,
    limit: page.limit,
    cursorId: page.cursorId,
    filter: buildRegistryEntryFilter(filters),
  };
  const sortBy = effectiveSortBy(filters);
  if (filters.query) {
    return { endpoint: 'search', body: { ...common, query: filters.query, sortBy } };
  }
  // effectiveSortBy never yields relevance without search text; this narrows the type.
  return {
    endpoint: 'query',
    body: { ...common, sortBy: sortBy === 'relevance' ? undefined : sortBy },
  };
}
