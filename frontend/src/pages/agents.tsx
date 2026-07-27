import Head from 'next/head';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RefreshButton } from '@/components/RefreshButton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppContext } from '@/lib/contexts/AppContext';
import {
  postRegistryEntry,
  postRegistryEntryRefresh,
  postRegistryEntrySearch,
  type RegistryEntry,
} from '@/lib/api/generated';
import { extractErrorMessage, formatDate, shortenId } from '@/lib/utils';

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

export default function AgentsPage() {
  const router = useRouter();
  const { apiClient, network } = useAppContext();
  const queryClient = useQueryClient();
  const routerQuery = typeof router.query.q === 'string' ? router.query.q : '';
  const [search, setSearch] = useState(routerQuery);
  const [submittedQuery, setSubmittedQuery] = useState(routerQuery);
  const [prevRouterQuery, setPrevRouterQuery] = useState(routerQuery);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursorId = cursorStack[cursorStack.length - 1];

  if (router.isReady && routerQuery !== prevRouterQuery) {
    setPrevRouterQuery(routerQuery);
    setSearch(routerQuery);
    setSubmittedQuery(routerQuery);
    setCursorStack([]);
  }

  const agentsQuery = useQuery({
    queryKey: ['agents', network, submittedQuery, cursorId ?? 'start'],
    queryFn: async () => {
      if (submittedQuery.trim()) {
        const response = await postRegistryEntrySearch({
          client: apiClient,
          body: {
            network,
            query: submittedQuery.trim(),
            limit: 20,
            cursorId,
          },
        });
        if (response.error) throw response.error;
        return response.data?.data;
      }
      const response = await postRegistryEntry({
        client: apiClient,
        body: {
          network,
          limit: 20,
          cursorId,
        },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (agentIdentifier: string) => {
      const response = await postRegistryEntryRefresh({
        client: apiClient,
        body: { network, agentIdentifier },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: () => {
      toast.success('Agent refreshed');
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Refresh failed')),
  });

  const entries = useMemo(
    () => agentsQuery.data?.entries ?? [],
    [agentsQuery.data?.entries],
  );
  const hasMore = entries.length >= 20;
  const lastId = entries[entries.length - 1]?.id;

  const runSearch = () => {
    setCursorStack([]);
    const next = search.trim();
    setSubmittedQuery(next);
    void router.replace(
      next ? { pathname: '/agents', query: { q: next } } : { pathname: '/agents' },
      undefined,
      { shallow: true },
    );
  };

  return (
    <MainLayout>
      <Head>
        <title>Agents | Registry Admin</title>
      </Head>
      <AnimatedPage>
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
              <p className="text-sm text-muted-foreground">
                Browse and search registry entries on {network}
              </p>
            </div>
            <RefreshButton
              onRefresh={async () => {
                await agentsQuery.refetch();
              }}
              isRefreshing={agentsQuery.isFetching}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, tags, identifier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch();
                }}
              />
            </div>
            <Button onClick={runSearch}>Search</Button>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setSubmittedQuery('');
                setCursorStack([]);
                void router.replace({ pathname: '/agents' }, undefined, { shallow: true });
              }}
            >
              Clear
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Capability</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Last check</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentsQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16">
                      <div className="flex justify-center">
                        <Spinner size={20} addContainer />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!agentsQuery.isLoading && entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={submittedQuery ? 'search' : 'inbox'}
                        title={
                          submittedQuery
                            ? `No agents matching “${submittedQuery}”`
                            : 'No agents found'
                        }
                        description={
                          submittedQuery
                            ? 'Try a different search query or clear filters.'
                            : `No registry entries on ${network} yet.`
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    id={`agent-${entry.id}`}
                    className="hover:bg-muted/40"
                  >
                    <TableCell>
                      <div className="font-medium">{entry.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {entry.description || entry.apiBaseUrl}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortenId(entry.agentIdentifier, 8)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {entry.Capability?.name
                        ? `${entry.Capability.name}${entry.Capability.version ? `@${entry.Capability.version}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {entry.uptimeCount}/{entry.uptimeCheckCount}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(entry.lastUptimeCheck)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={refreshMutation.isPending}
                        onClick={() => refreshMutation.mutate(entry.agentIdentifier)}
                      >
                        Refresh
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={cursorStack.length === 0}
              onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!hasMore || !lastId}
              onClick={() => {
                if (lastId) setCursorStack((stack) => [...stack, lastId]);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </AnimatedPage>
    </MainLayout>
  );
}
