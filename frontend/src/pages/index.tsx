import { useState } from 'react';
import Head from 'next/head';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { KeyStatusCard } from '@/components/auth/KeyStatusCard';
import { ApiStatus } from '@/components/dashboard/ApiStatus';
import { AgentFilterPanel } from '@/components/agents/AgentFilterPanel';
import { AgentList, AgentListHeader } from '@/components/agents/AgentList';
import { AgentsEmptyState } from '@/components/agents/AgentsEmptyState';
import { AgentListSkeleton } from '@/components/skeletons/AgentListSkeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { activeFilterKeys } from '@/lib/agent-empty-result';
import { PAGE_SIZES, type Network, type PageSize } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { useNetwork } from '@/lib/contexts/NetworkContext';
import { useAgentFilters } from '@/lib/hooks/useAgentFilters';
import { useAgents } from '@/lib/queries/useAgents';
import { cn } from '@/lib/utils';

const FILTER_PANEL_ID = 'agent-filters';

function LoadError({
  error,
  network,
  onRetry,
}: {
  error: unknown;
  network: Network;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 px-4 py-10 text-center text-sm">
      <p className="font-medium">Could not load agents.</p>
      <p className="mx-auto max-w-md text-muted-foreground">
        {classifyAuthError(error).message} The registry also fails this way when {network} has no
        registry source configured.
      </p>
      {/* A retry resets the query to pending, so the skeleton shows the progress. */}
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (pageSize: PageSize) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="agents-page-size" className="text-xs font-normal text-muted-foreground">
        Per page
      </Label>
      <Select
        value={String(value)}
        onValueChange={(next) =>
          onChange(PAGE_SIZES.find((size) => String(size) === next) ?? value)
        }
      >
        <SelectTrigger id="agents-page-size" className="h-8 w-18">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The main screen: the registry's agents, with every filter the API supports. */
export default function AgentsPage() {
  const { network } = useNetwork();
  const { isReady, filters, updateFilters } = useAgentFilters();
  const { query, agents } = useAgents(filters, network, isReady);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const activeCount = activeFilterKeys(filters).length;

  const isLoadingFirstPage = !isReady || query.isPending;
  const isEmpty = query.isSuccess && agents.length === 0;
  const hasFailed = query.isError && agents.length === 0;
  const statusText = isLoadingFirstPage
    ? 'Loading agents…'
    : hasFailed
      ? 'Agents unavailable'
      : `${agents.length} ${agents.length === 1 ? 'agent' : 'agents'} shown`;

  return (
    <MainLayout>
      <Head>
        <title>Agents | Masumi Registry</title>
      </Head>
      <div className="@container space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="max-w-prose text-sm text-muted-foreground">
              Registry entries on {network}. The filters live in the URL, so this view can be shared
              as a link.
            </p>
          </div>
          <div className="space-y-2">
            <ApiStatus />
            <KeyStatusCard />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="@5xl:hidden"
          aria-expanded={isPanelOpen}
          aria-controls={FILTER_PANEL_ID}
          onClick={() => setIsPanelOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {isPanelOpen ? 'Hide filters' : 'Show filters'}
          {activeCount > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{activeCount}</span>
          )}
        </Button>

        <div className="grid grid-cols-1 items-start gap-6 @5xl:grid-cols-[18rem_minmax(0,1fr)]">
          <AgentFilterPanel
            id={FILTER_PANEL_ID}
            filters={filters}
            onChange={updateFilters}
            className={cn(!isPanelOpen && 'hidden @5xl:block')}
          />

          <section aria-labelledby="agent-results-heading" className="@container rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <h2 id="agent-results-heading" className="sr-only">
                Results
              </h2>
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                {statusText}
                {query.isRefetching && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Refreshing" />
                )}
              </p>
              <PageSizeSelect
                value={filters.pageSize}
                onChange={(pageSize) => updateFilters((current) => ({ ...current, pageSize }))}
              />
            </div>

            {isLoadingFirstPage ? (
              <AgentListSkeleton rows={Math.min(filters.pageSize, 5)} />
            ) : hasFailed ? (
              <LoadError
                error={query.error}
                network={network}
                onRetry={() => void query.refetch()}
              />
            ) : isEmpty ? (
              <AgentsEmptyState filters={filters} network={network} onChange={updateFilters} />
            ) : (
              <>
                <AgentListHeader />
                <AgentList agents={agents} />
                {/* A failed next page or a failed background refresh: the rows above stay. */}
                {query.isError ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-2 border-t p-4 text-sm"
                  >
                    <p className="text-muted-foreground">
                      {!query.isFetchNextPageError &&
                        'Could not refresh, showing earlier results. '}
                      {classifyAuthError(query.error).message}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
                      }
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <Pagination
                    className="border-t p-4"
                    hasMore={query.hasNextPage}
                    isLoading={query.isFetchingNextPage}
                    onLoadMore={() => void query.fetchNextPage()}
                  />
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
