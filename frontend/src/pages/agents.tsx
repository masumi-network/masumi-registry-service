import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { RefreshButton } from '@/components/RefreshButton';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import {
  AgentFilters,
  EMPTY_AGENT_FILTERS,
  countActiveAgentFilters,
  toRegistryEntryFilter,
  type AgentFilterState,
} from '@/components/agents/AgentFilters';
import { AgentDetailsDialog } from '@/components/agents/AgentDetailsDialog';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppContext } from '@/lib/contexts/AppContext';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { flattenInclusiveCursorPages } from '@/lib/pagination/cursor-pagination';
import { rowActivation } from '@/lib/a11y';
import {
  postRegistryEntry,
  postRegistryEntrySearch,
  type RegistryEntry,
} from '@/lib/api/generated';
import { cn, extractErrorMessage, formatAssetAmount, formatDateTime, shortenId } from '@/lib/utils';

const PAGE_SIZE = 20;

type AgentPricingType = 'Free' | 'Dynamic' | 'Fixed';

function statusVariant(status: RegistryEntry['status']) {
  switch (status) {
    case 'Online':
      return 'success' as const;
    case 'Offline':
      return 'warning' as const;
    case 'Deregistered':
    case 'Invalid':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

/** Narrow generated `AgentPricing | unknown` for safe table rendering. */
function getPricingType(pricing: RegistryEntry['AgentPricing']): AgentPricingType | null {
  if (!pricing || typeof pricing !== 'object' || !('pricingType' in pricing)) return null;
  const pricingType = (pricing as { pricingType?: unknown }).pricingType;
  if (pricingType === 'Free' || pricingType === 'Dynamic' || pricingType === 'Fixed') {
    return pricingType;
  }
  return null;
}

function getFixedAmounts(pricing: RegistryEntry['AgentPricing']) {
  if (getPricingType(pricing) !== 'Fixed') {
    return [] as Array<{ amount: string; unit: string }>;
  }
  const fixed = pricing as {
    FixedPricing?: { Amounts?: Array<{ amount: string; unit: string }> };
  };
  if (!fixed.FixedPricing || typeof fixed.FixedPricing !== 'object') {
    return [] as Array<{ amount: string; unit: string }>;
  }
  if (!Array.isArray(fixed.FixedPricing.Amounts)) {
    return [] as Array<{ amount: string; unit: string }>;
  }
  return fixed.FixedPricing.Amounts;
}

/** Instant client filter while debounce/server results are still catching up. */
function matchesLocalSearch(entry: RegistryEntry, query: string) {
  if (entry.name?.toLowerCase().includes(query)) return true;
  if (entry.description?.toLowerCase().includes(query)) return true;
  if (entry.agentIdentifier?.toLowerCase().includes(query)) return true;
  if (entry.apiBaseUrl?.toLowerCase().includes(query)) return true;
  if (entry.status?.toLowerCase().includes(query)) return true;
  if (entry.Capability?.name?.toLowerCase().includes(query)) return true;
  if (entry.Capability?.version?.toLowerCase().includes(query)) return true;
  // Backend tag match is exact (hasSome); keep the same feel locally.
  if (entry.tags?.some((tag) => tag.toLowerCase() === query)) return true;
  if (entry.tags?.some((tag) => tag.toLowerCase().includes(query))) return true;
  return false;
}

export default function AgentsPage() {
  const router = useRouter();
  const { apiClient, network } = useAppContext();
  const routerQuery = typeof router.query.q === 'string' ? router.query.q : '';

  const [searchQuery, setSearchQuery] = useState(routerQuery);
  const [prevRouterQuery, setPrevRouterQuery] = useState(routerQuery);
  const [filters, setFilters] = useState<AgentFilterState>(EMPTY_AGENT_FILTERS);
  const [selectedAgent, setSelectedAgent] = useState<RegistryEntry | null>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const entryFilter = useMemo(() => toRegistryEntryFilter(filters), [filters]);
  const activeFilterCount = countActiveAgentFilters(filters);

  // Deep-link / Cmd+K: adopt `?q=` into the live input.
  if (router.isReady && routerQuery !== prevRouterQuery) {
    setPrevRouterQuery(routerQuery);
    setSearchQuery(routerQuery);
  }

  // Keep the URL shareable without requiring Enter.
  useEffect(() => {
    if (!router.isReady) return;
    const current = typeof router.query.q === 'string' ? router.query.q : '';
    const next = debouncedSearchQuery.trim();
    if (next === current) return;
    void router.replace(
      next ? { pathname: '/agents', query: { q: next } } : { pathname: '/agents' },
      undefined,
      { shallow: true },
    );
  }, [debouncedSearchQuery, router]);

  const agentsQuery = useInfiniteQuery({
    queryKey: ['agents', network, debouncedSearchQuery, entryFilter],
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = debouncedSearchQuery.trim();
      const cursorId = pageParam;
      if (query) {
        const response = await postRegistryEntrySearch({
          client: apiClient,
          body: {
            network,
            query,
            limit: PAGE_SIZE,
            cursorId,
            filter: entryFilter,
          },
        });
        if (response.error) throw response.error;
        const entries = response.data?.data?.entries ?? [];
        const nextCursor =
          entries.length === PAGE_SIZE && entries[entries.length - 1]?.id
            ? entries[entries.length - 1].id
            : undefined;
        return { entries, nextCursor };
      }
      const response = await postRegistryEntry({
        client: apiClient,
        body: {
          network,
          limit: PAGE_SIZE,
          cursorId,
          filter: entryFilter,
        },
      });
      if (response.error) throw response.error;
      const entries = response.data?.data?.entries ?? [];
      const nextCursor =
        entries.length === PAGE_SIZE && entries[entries.length - 1]?.id
          ? entries[entries.length - 1].id
          : undefined;
      return { entries, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const entries = useMemo(
    () =>
      flattenInclusiveCursorPages(
        (agentsQuery.data?.pages ?? []).map((page) => page.entries),
        (entry) => entry.id,
      ),
    [agentsQuery.data?.pages],
  );

  // True while debounce hasn't fired, or a fetch is in-flight with previous rows.
  const isSearchPending =
    searchQuery !== debouncedSearchQuery ||
    (agentsQuery.isFetching && agentsQuery.isPlaceholderData);

  // Client-side filter for instant feedback while server results catch up.
  const displayEntries = useMemo(() => {
    let rows = entries;
    if (filters.status) {
      rows = rows.filter((entry) => entry.status === filters.status);
    }
    if (filters.paymentType) {
      rows = rows.filter((entry) => entry.paymentType === filters.paymentType);
    }

    const query = searchQuery.toLowerCase().trim();
    if (
      !query ||
      (query === debouncedSearchQuery.toLowerCase().trim() && !agentsQuery.isPlaceholderData)
    ) {
      return rows;
    }
    return rows.filter((entry) => matchesLocalSearch(entry, query));
  }, [
    entries,
    filters.paymentType,
    filters.status,
    searchQuery,
    debouncedSearchQuery,
    agentsQuery.isPlaceholderData,
  ]);

  const hasMore = Boolean(agentsQuery.hasNextPage);
  const isFetchingNextPage = agentsQuery.isFetchingNextPage;
  const showFetchError = agentsQuery.isError && entries.length === 0 && !isSearchPending;
  const showInitialLoading =
    !showFetchError &&
    ((agentsQuery.isLoading && entries.length === 0) ||
      (displayEntries.length === 0 && isSearchPending));

  const loadMore = useCallback(() => {
    if (hasMore && !isFetchingNextPage) {
      void agentsQuery.fetchNextPage();
    }
  }, [agentsQuery, hasMore, isFetchingNextPage]);

  return (
    <MainLayout>
      <Head>
        <title>Agents | Registry Admin</title>
      </Head>
      <AnimatedPage>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground">
              Browse and search registry entries on {network}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, description, tags, or identifier…"
                className="max-w-xs"
                isLoading={isSearchPending && !!searchQuery}
              />
            </div>
            <AgentFilters filters={filters} onChange={setFilters} />
            <RefreshButton
              onRefresh={async () => {
                await agentsQuery.refetch();
              }}
              isRefreshing={agentsQuery.isFetching && !isSearchPending && !isFetchingNextPage}
            />
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table
              className={cn(
                'min-w-[960px] transition-opacity duration-150',
                isSearchPending && 'opacity-70',
              )}
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Capability</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead className="pr-8">Last check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showInitialLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16">
                      <div className="flex justify-center">
                        <Spinner size={20} addContainer />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : showFetchError ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon="inbox"
                        title="Failed to load agents"
                        description={extractErrorMessage(
                          agentsQuery.error,
                          'Something went wrong while fetching registry entries.',
                        )}
                        action={
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void agentsQuery.refetch();
                            }}
                          >
                            Try again
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : displayEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={searchQuery || activeFilterCount > 0 ? 'search' : 'inbox'}
                        title={
                          searchQuery || activeFilterCount > 0
                            ? 'No agents found matching your search'
                            : 'No agents found'
                        }
                        description={
                          searchQuery || activeFilterCount > 0
                            ? 'Try a different search query or clear filters.'
                            : `No registry entries on ${network} yet.`
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  displayEntries.map((entry) => {
                    const capabilityLabel = entry.Capability?.name
                      ? `${entry.Capability.name}${entry.Capability.version ? `@${entry.Capability.version}` : ''}`
                      : null;
                    const pricingType = getPricingType(entry.AgentPricing);
                    const fixedAmounts = getFixedAmounts(entry.AgentPricing);

                    return (
                      <TableRow
                        key={entry.id}
                        id={`agent-${entry.id}`}
                        className="hover:bg-muted/40 cursor-pointer"
                        onClick={() => setSelectedAgent(entry)}
                        aria-label={`View details for ${entry.name}`}
                        {...rowActivation(() => setSelectedAgent(entry))}
                      >
                        <TableCell className="pl-6 max-w-[240px]">
                          <div className="text-sm font-medium truncate" title={entry.name}>
                            {entry.name}
                          </div>
                          <div
                            className="text-xs text-muted-foreground truncate"
                            title={entry.description || entry.apiBaseUrl || undefined}
                          >
                            {entry.description || entry.apiBaseUrl}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span title={entry.agentIdentifier}>
                              {shortenId(entry.agentIdentifier, 8)}
                            </span>
                            <CopyButton
                              value={entry.agentIdentifier}
                              className="h-7 w-7 shrink-0"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[10rem]">
                          {pricingType === 'Free' && (
                            <div className="whitespace-nowrap">Free</div>
                          )}
                          {pricingType === 'Dynamic' && (
                            <div className="whitespace-nowrap">Dynamic</div>
                          )}
                          {pricingType === 'Fixed' &&
                            fixedAmounts.map((price, index) => (
                              <div
                                key={`${price.unit}-${price.amount}-${index}`}
                                className="whitespace-nowrap truncate"
                                title={formatAssetAmount(price.amount, price.unit, network)}
                              >
                                {formatAssetAmount(price.amount, price.unit, network)}
                              </div>
                            ))}
                          {!pricingType && <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">
                          <span title={capabilityLabel ?? undefined}>{capabilityLabel ?? '—'}</span>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {entry.uptimeCount}/{entry.uptimeCheckCount}
                        </TableCell>
                        <TableCell
                          className="text-xs whitespace-nowrap pr-8"
                          title={
                            entry.lastUptimeCheck
                              ? new Date(entry.lastUptimeCheck).toLocaleString()
                              : undefined
                          }
                        >
                          {formatDateTime(entry.lastUptimeCheck)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-4 items-center">
            {!showFetchError &&
              !showInitialLoading &&
              displayEntries.length > 0 && (
                <Pagination
                  hasMore={hasMore}
                  isLoading={
                    isFetchingNextPage ||
                    (agentsQuery.isFetching && !agentsQuery.isPlaceholderData)
                  }
                  onLoadMore={loadMore}
                />
              )}
          </div>
        </div>
      </AnimatedPage>

      <AgentDetailsDialog
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onAgentUpdated={setSelectedAgent}
      />
    </MainLayout>
  );
}
