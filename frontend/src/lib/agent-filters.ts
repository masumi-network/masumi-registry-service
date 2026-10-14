import type { ParsedUrlQuery } from 'querystring';
import { z } from 'zod';
import type { PostRegistryEntryData } from '@/lib/api/generated';

export const AGENT_STATUSES = ['Online', 'Offline', 'Deregistered', 'Invalid'] as const;
export const PAYMENT_TYPES = ['Web3CardanoV1', 'Web3CardanoV2', 'None'] as const;
export const NETWORKS = ['Preprod', 'Mainnet'] as const;
export const PAGE_SIZES = [10, 25, 50] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type Network = (typeof NETWORKS)[number];
export type PageSize = (typeof PAGE_SIZES)[number];

// Bounds mirror registryEntryFilterSchema in src/routes/api/registry-entry/schemas.ts.
export const MAX_IDENTIFIER_LENGTH = 250;
const MAX_CAPABILITY_LENGTH = 150;
export const MAX_TAG_LENGTH = 150;
// The API takes any number of tags, but a link is untrusted input: cap what one can carry.
export const MAX_TAGS = 20;
const DEFAULT_PAGE_SIZE: PageSize = 10;

/**
 * One agent-browser view. Every field maps to one API filter; empty strings and arrays
 * mean "not filtered", except `statuses`, which is never empty (see DEFAULT_STATUSES).
 */
export interface AgentFilters {
  statuses: AgentStatus[];
  paymentTypes: PaymentType[];
  policyId: string;
  assetIdentifier: string;
  resolveToLatestVersion: boolean;
  tags: string[];
  capabilityName: string;
  capabilityVersion: string;
  /** `yyyy-MM-dd`, or empty for no forced re-check. */
  minHealthCheckDate: string;
  pageSize: PageSize;
}

// Without a status filter the API returns Online agents only, so that is the default the UI
// shows and always sends: an empty selection would silently mean "Online" server side.
const DEFAULT_STATUSES: AgentStatus[] = ['Online'];

const DEFAULT_AGENT_FILTERS: Readonly<AgentFilters> = {
  statuses: [...DEFAULT_STATUSES],
  paymentTypes: [],
  policyId: '',
  assetIdentifier: '',
  resolveToLatestVersion: false,
  tags: [],
  capabilityName: '',
  capabilityVersion: '',
  minHealthCheckDate: '',
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

/** Today as `yyyy-MM-dd` in local time, the format `<input type="date">` uses. */
export function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const allValues = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// Each field falls back on its own, so one bad parameter never wipes the rest of a view.
export const boundedText = (maxLength: number) =>
  z.preprocess(firstValue, z.string().trim().max(maxLength)).catch('');
// Capability names come from on-chain metadata and the API matches them exactly, so a
// name with surrounding spaces must survive the URL round trip untouched.
const verbatimText = (maxLength: number) =>
  z.preprocess(firstValue, z.string().max(maxLength)).catch('');

// Keeps the allowed values in their canonical order, so one view always has one URL.
export const enumValues = <T extends string>(allowed: readonly T[]) =>
  z
    .preprocess(allValues, z.array(z.unknown()))
    .transform((raw) => allowed.filter((value) => raw.includes(value)));

const tagSchema = z.string().trim().min(1).max(MAX_TAG_LENGTH);

const agentFiltersQuerySchema = z.object({
  status: enumValues(AGENT_STATUSES),
  paymentTypes: enumValues(PAYMENT_TYPES),
  policyId: boundedText(MAX_IDENTIFIER_LENGTH),
  assetIdentifier: boundedText(MAX_IDENTIFIER_LENGTH),
  resolveToLatestVersion: z.preprocess(firstValue, z.unknown()).transform((v) => v === 'true'),
  tags: z.preprocess(allValues, z.array(z.unknown())).transform((raw) => {
    const valid = raw.flatMap((value) => {
      const tag = tagSchema.safeParse(value);
      return tag.success ? [tag.data] : [];
    });
    return [...new Set(valid)].slice(0, MAX_TAGS);
  }),
  capability: verbatimText(MAX_CAPABILITY_LENGTH),
  capabilityVersion: verbatimText(MAX_CAPABILITY_LENGTH),
  minHealthCheckDate: z
    .preprocess(firstValue, z.string())
    // A real day, and not a future one, which the picker (max today) never offers. Any
    // date makes the API live-check every listed agent, so the panel copy says so.
    .refine((value) => parseDay(value) !== null && value <= today())
    .catch(''),
  limit: z
    .preprocess(firstValue, z.coerce.number())
    .pipe(z.union(PAGE_SIZES.map((size) => z.literal(size))))
    .catch(DEFAULT_PAGE_SIZE),
});

export function parseAgentFilters(query: ParsedUrlQuery): AgentFilters {
  const raw = agentFiltersQuerySchema.parse(query);
  return {
    statuses: raw.status.length > 0 ? raw.status : [...DEFAULT_STATUSES],
    paymentTypes: raw.paymentTypes,
    policyId: raw.policyId,
    assetIdentifier: raw.assetIdentifier,
    // The API ignores it without an asset identifier; keeping it would give one view two URLs.
    resolveToLatestVersion: raw.resolveToLatestVersion && raw.assetIdentifier !== '',
    tags: raw.tags,
    capabilityName: raw.capability,
    // The API takes a version only as part of a named capability.
    capabilityVersion: raw.capability === '' ? '' : raw.capabilityVersion,
    minHealthCheckDate: raw.minHealthCheckDate,
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

/** The URL query for a view. Defaults are left out; arrays become repeated parameters. */
export function serializeAgentFilters(filters: AgentFilters): Record<string, string | string[]> {
  const entries: [string, string | string[] | undefined][] = [
    ['status', isDefaultStatusSelection(filters.statuses) ? undefined : filters.statuses],
    ['paymentTypes', filters.paymentTypes.length > 0 ? filters.paymentTypes : undefined],
    ['policyId', filters.policyId || undefined],
    ['assetIdentifier', filters.assetIdentifier || undefined],
    ['resolveToLatestVersion', filters.resolveToLatestVersion ? 'true' : undefined],
    ['tags', filters.tags.length > 0 ? filters.tags : undefined],
    ['capability', filters.capabilityName || undefined],
    ['capabilityVersion', filters.capabilityVersion || undefined],
    ['minHealthCheckDate', filters.minHealthCheckDate || undefined],
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

/** Every filter back to its default. The page size stays: it is a display choice. */
export function resetFilters(filters: AgentFilters): AgentFilters {
  return { ...DEFAULT_AGENT_FILTERS, statuses: [...DEFAULT_STATUSES], pageSize: filters.pageSize };
}

export function parseNetwork(value: unknown): Network | undefined {
  return NETWORKS.find((network) => network === value);
}

export type RegistryQueryBody = NonNullable<PostRegistryEntryData['body']>;

/** The `POST /registry-entry` body for a view and one page of it. */
export function buildRegistryQueryBody(
  filters: AgentFilters,
  network: Network,
  page: Readonly<{ limit: number; cursorId?: string }>,
): RegistryQueryBody {
  // Unset filters are left undefined: JSON drops them, on the wire and in query keys alike.
  return {
    network,
    limit: page.limit,
    cursorId: page.cursorId,
    filter: {
      status: filters.statuses,
      paymentTypes: filters.paymentTypes.length > 0 ? filters.paymentTypes : undefined,
      policyId: filters.policyId || undefined,
      assetIdentifier: filters.assetIdentifier || undefined,
      resolveToLatestVersion:
        (filters.resolveToLatestVersion && !!filters.assetIdentifier) || undefined,
      tags: filters.tags.length > 0 ? filters.tags : undefined,
      capability: filters.capabilityName
        ? { name: filters.capabilityName, version: filters.capabilityVersion || undefined }
        : undefined,
    },
    minHealthCheckDate: parseDay(filters.minHealthCheckDate) ?? undefined,
  };
}
