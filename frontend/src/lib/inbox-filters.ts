import type { ParsedUrlQuery } from 'querystring';
import { z } from 'zod';
import type {
  PostInboxAgentRegistrationData,
  PostInboxAgentRegistrationSearchData,
} from '@/lib/api/generated';
import { INBOX_STATUSES, type InboxStatus } from './admin-dashboard';
import { boundedText, enumValues, type Network } from './agent-filters';

// Bounds mirror the routes as registered. The search route
// (src/routes/api/inbox-agent-registration-search) caps `query` at 80, not the 120 the
// OpenAPI document states, and ignores status and policy filters: its handler passes the
// input to a service that reads `input.filter`, which that route's schema does not have.
// So a search covers Pending and Verified registrations only, whatever is sent.
export const MAX_INBOX_QUERY_LENGTH = 80;
export const MAX_POLICY_ID_LENGTH = 250;

/** One inbox view; it lives in the URL so a filtered view is a shareable link. */
export interface InboxFilters {
  /** Matches slug, name or linked email; non-empty switches to the search endpoint. */
  query: string;
  /** Never empty: the API's own default when sent none is these same two. */
  statuses: InboxStatus[];
  policyId: string;
}

const DEFAULT_STATUSES: InboxStatus[] = ['Pending', 'Verified'];

const inboxQuerySchema = z.object({
  q: boundedText(MAX_INBOX_QUERY_LENGTH),
  status: enumValues(INBOX_STATUSES),
  policyId: boundedText(MAX_POLICY_ID_LENGTH),
});

export function parseInboxFilters(query: ParsedUrlQuery): InboxFilters {
  const raw = inboxQuerySchema.parse(query);
  return {
    query: raw.q,
    statuses: raw.status.length > 0 ? raw.status : [...DEFAULT_STATUSES],
    policyId: raw.policyId,
  };
}

const isDefaultStatuses = (statuses: readonly InboxStatus[]) =>
  statuses.length === DEFAULT_STATUSES.length &&
  DEFAULT_STATUSES.every((status) => statuses.includes(status));

export function serializeInboxFilters(filters: InboxFilters): Record<string, string | string[]> {
  const entries: [string, string | string[] | undefined][] = [
    ['q', filters.query || undefined],
    ['status', isDefaultStatuses(filters.statuses) ? undefined : filters.statuses],
    ['policyId', filters.policyId || undefined],
  ];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string | string[]] => entry[1] !== undefined),
  );
}

type InboxQueryBody = NonNullable<PostInboxAgentRegistrationData['body']>;
type InboxSearchBody = NonNullable<PostInboxAgentRegistrationSearchData['body']>;

export type InboxListRequest =
  | { endpoint: 'query'; body: InboxQueryBody }
  | { endpoint: 'search'; body: InboxSearchBody };

export function buildInboxListRequest(
  filters: InboxFilters,
  network: Network,
  page: Readonly<{ limit: number; cursorId?: string }>,
): InboxListRequest {
  const paging = { network, limit: page.limit, cursorId: page.cursorId };
  // A search sends only what its route honours (see above); the UI says filters do not apply.
  if (filters.query) return { endpoint: 'search', body: { ...paging, query: filters.query } };
  return {
    endpoint: 'query',
    body: {
      ...paging,
      // Statuses are always sent: none would silently mean Pending and Verified only.
      filter: { status: filters.statuses, policyId: filters.policyId || undefined },
    },
  };
}
