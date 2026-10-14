import Head from 'next/head';
import {
  InboxRegistrationList,
  INBOX_STATUS_BADGE,
} from '@/components/inbox/InboxRegistrationList';
import { MainLayout } from '@/components/layout/MainLayout';
import { TextFilterInput } from '@/components/agents/TextFilterInput';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { INBOX_STATUSES, summarizeInbox } from '@/lib/admin-dashboard';
import { toggleValue } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { useNetwork } from '@/lib/contexts/NetworkContext';
import { useUrlView } from '@/lib/hooks/useUrlView';
import {
  MAX_INBOX_QUERY_LENGTH,
  MAX_POLICY_ID_LENGTH,
  parseInboxFilters,
  serializeInboxFilters,
} from '@/lib/inbox-filters';
import { useInboxSnapshot } from '@/lib/queries/useAdminOverview';
import { useInboxRegistrations } from '@/lib/queries/useInboxRegistrations';

const codec = { parse: parseInboxFilters, serialize: serializeInboxFilters };

function StatusCounts() {
  const { network } = useNetwork();
  const snapshot = useInboxSnapshot(network);
  if (snapshot.isPending) return <Skeleton className="h-6 w-80" />;
  if (snapshot.isError) return null;
  const { counts, total } = summarizeInbox(snapshot.data.rows);
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {total} on {network}:
      {INBOX_STATUSES.map((status) => (
        <Badge key={status} variant={INBOX_STATUS_BADGE[status]}>
          {counts[status]} {status}
        </Badge>
      ))}
    </p>
  );
}

/** Admin: inbox agent registrations, searchable and filterable, with a re-check per entry. */
export default function InboxPage() {
  const { network } = useNetwork();
  const { isReady, view: filters, updateView } = useUrlView(codec);
  const { query, registrations } = useInboxRegistrations(filters, network, isReady);
  // The registry's inbox search ignores status and policy filters (see lib/inbox-filters).
  const isSearching = filters.query !== '';

  return (
    <MainLayout>
      <Head>
        <title>Inbox | Masumi Registry</title>
      </Head>
      <div className="@container space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox agent registrations</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Agents registered for the Masumi inbox on {network}. Search and filters live in the URL.
          </p>
          <StatusCounts />
        </div>

        <div className="grid items-start gap-6 @4xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-5 rounded-lg border p-4">
            <TextFilterInput
              revision={filters}
              id="inbox-search"
              label="Search"
              value={filters.query}
              maxLength={MAX_INBOX_QUERY_LENGTH}
              placeholder="Slug, name or email"
              onCommit={(next) => updateView((current) => ({ ...current, query: next }))}
            />
            <fieldset
              disabled={isSearching}
              className="space-y-5 disabled:opacity-60"
              aria-describedby="inbox-filters-hint"
            >
              <fieldset className="space-y-2" aria-describedby="inbox-status-hint">
                <legend className="mb-2 text-sm font-medium">Status</legend>
                {INBOX_STATUSES.map((status) => {
                  const id = `inbox-status-${status}`;
                  const isChecked = filters.statuses.includes(status);
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={isChecked}
                        disabled={isChecked && filters.statuses.length === 1}
                        onCheckedChange={(checked) =>
                          updateView((current) => {
                            const statuses = toggleValue(
                              INBOX_STATUSES,
                              current.statuses,
                              status,
                              checked === true,
                            );
                            return statuses.length > 0 ? { ...current, statuses } : current;
                          })
                        }
                      />
                      <Label htmlFor={id} className="font-normal">
                        {status}
                      </Label>
                    </div>
                  );
                })}
                <p id="inbox-status-hint" className="text-xs text-muted-foreground">
                  Pending and Verified are shown by default. At least one stays selected.
                </p>
              </fieldset>
              <TextFilterInput
                revision={filters}
                id="inbox-policy"
                label="Policy ID"
                value={filters.policyId}
                maxLength={MAX_POLICY_ID_LENGTH}
                placeholder="Exact policy ID"
                onCommit={(policyId) => updateView((current) => ({ ...current, policyId }))}
              />
            </fieldset>
            {isSearching && (
              <p id="inbox-filters-hint" className="text-xs text-muted-foreground">
                The registry&apos;s inbox search ignores these filters: it always covers Pending and
                Verified registrations only. Clear the search to filter.
              </p>
            )}
          </div>

          <section aria-label="Registrations" className="@container rounded-lg border">
            {!isReady || query.isPending ? (
              <Skeleton className="m-4 h-24" />
            ) : query.isError && registrations.length === 0 ? (
              <p role="alert" className="p-4 text-sm text-muted-foreground">
                Could not load inbox registrations. {classifyAuthError(query.error).message}
              </p>
            ) : registrations.length === 0 ? (
              <EmptyState
                icon={filters.query ? 'search' : 'inbox'}
                title="No registrations match"
                description="Try another search, or include more statuses."
              />
            ) : (
              <>
                <InboxRegistrationList registrations={registrations} network={network} />
                <Pagination
                  className="border-t p-4"
                  hasMore={query.hasNextPage}
                  isLoading={query.isFetchingNextPage}
                  onLoadMore={() => void query.fetchNextPage()}
                />
              </>
            )}
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
