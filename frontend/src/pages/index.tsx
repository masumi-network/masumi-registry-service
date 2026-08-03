import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bot, Database, Key, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StatCard } from '@/components/ui/stat-card';
import { RefreshButton } from '@/components/RefreshButton';
import { Spinner } from '@/components/ui/spinner';
import { useAppContext } from '@/lib/contexts/AppContext';
import type { Client } from '@/lib/api/generated/client';
import {
  getApiKey,
  getHealth,
  getRegistrySource,
  postRegistryEntry,
} from '@/lib/api/generated';

const PAGE_SIZE = 50;
/** Safety cap so a huge registry can't hang the dashboard forever. */
const MAX_PAGES = 100;

type CountResult = {
  count: number;
  hasMore: boolean;
};

async function countInclusiveCursorPages(options: {
  fetchPage: (cursorId: string | undefined) => Promise<Array<{ id: string }>>;
}): Promise<CountResult> {
  const seen = new Set<string>();
  let cursorId: string | undefined;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page = await options.fetchPage(cursorId);
    pages += 1;

    for (const item of page) {
      if (!seen.has(item.id)) seen.add(item.id);
    }

    if (page.length < PAGE_SIZE) {
      return { count: seen.size, hasMore: false };
    }

    const lastId = page[page.length - 1]?.id;
    if (!lastId || lastId === cursorId) {
      return { count: seen.size, hasMore: false };
    }
    cursorId = lastId;
  }

  return { count: seen.size, hasMore: true };
}

function formatCount({ count, hasMore }: CountResult) {
  return `${count}${hasMore ? '+' : ''}`;
}

async function countAgents(apiClient: Client, network: 'Preprod' | 'Mainnet') {
  return countInclusiveCursorPages({
    fetchPage: async (cursorId) => {
      const response = await postRegistryEntry({
        client: apiClient,
        body: { network, limit: PAGE_SIZE, cursorId },
      });
      if (response.error) throw response.error;
      return response.data?.data?.entries ?? [];
    },
  });
}

async function countSources(apiClient: Client) {
  return countInclusiveCursorPages({
    fetchPage: async (cursorId) => {
      const response = await getRegistrySource({
        client: apiClient,
        query: { limit: PAGE_SIZE, cursorId },
      });
      if (response.error) throw response.error;
      return response.data?.data?.sources ?? [];
    },
  });
}

async function countApiKeys(apiClient: Client) {
  return countInclusiveCursorPages({
    fetchPage: async (cursorId) => {
      const response = await getApiKey({
        client: apiClient,
        query: { limit: PAGE_SIZE, cursorId },
      });
      if (response.error) throw response.error;
      return response.data?.data?.apiKeys ?? [];
    },
  });
}

export default function DashboardPage() {
  const { apiClient, network } = useAppContext();

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await getHealth({ client: apiClient });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const agentsCountQuery = useQuery({
    queryKey: ['agents-count', network],
    queryFn: () => countAgents(apiClient, network),
  });

  const sourcesCountQuery = useQuery({
    queryKey: ['sources-count'],
    queryFn: () => countSources(apiClient),
  });

  const keysCountQuery = useQuery({
    queryKey: ['api-keys-count'],
    queryFn: () => countApiKeys(apiClient),
  });

  const isRefreshing =
    healthQuery.isFetching ||
    agentsCountQuery.isFetching ||
    sourcesCountQuery.isFetching ||
    keysCountQuery.isFetching;

  const handleRefresh = async () => {
    await Promise.all([
      healthQuery.refetch(),
      agentsCountQuery.refetch(),
      sourcesCountQuery.refetch(),
      keysCountQuery.refetch(),
    ]);
  };

  return (
    <MainLayout>
      <Head>
        <title>Dashboard | Registry Admin</title>
      </Head>
      <AnimatedPage>
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Overview of registry sources and agents on {network}.
              </p>
            </div>
            <RefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {agentsCountQuery.isLoading ? (
              <div className="border rounded-lg p-6 flex items-center justify-center min-h-[120px]">
                <Spinner size={18} />
              </div>
            ) : (
              <StatCard
                label="Agents"
                index={0}
                icon={<Bot className="h-4 w-4 text-blue-500" />}
              >
                <div className="text-2xl font-semibold">
                  {agentsCountQuery.isError
                    ? '—'
                    : formatCount(agentsCountQuery.data ?? { count: 0, hasMore: false })}
                </div>
                <Link
                  href="/agents"
                  className="text-sm text-primary hover:underline flex items-center mt-1"
                >
                  Browse agents <ChevronRight className="h-4 w-4" />
                </Link>
              </StatCard>
            )}

            {sourcesCountQuery.isLoading ? (
              <div className="border rounded-lg p-6 flex items-center justify-center min-h-[120px]">
                <Spinner size={18} />
              </div>
            ) : (
              <StatCard
                label="Sources"
                index={1}
                icon={<Database className="h-4 w-4 text-green-500" />}
              >
                <div className="text-2xl font-semibold">
                  {sourcesCountQuery.isError
                    ? '—'
                    : formatCount(sourcesCountQuery.data ?? { count: 0, hasMore: false })}
                </div>
                <Link
                  href="/sources"
                  className="text-sm text-primary hover:underline flex items-center mt-1"
                >
                  Manage sources <ChevronRight className="h-4 w-4" />
                </Link>
              </StatCard>
            )}

            {keysCountQuery.isLoading ? (
              <div className="border rounded-lg p-6 flex items-center justify-center min-h-[120px]">
                <Spinner size={18} />
              </div>
            ) : (
              <StatCard
                label="API keys"
                index={2}
                icon={<Key className="h-4 w-4 text-orange-500" />}
              >
                <div className="text-2xl font-semibold">
                  {keysCountQuery.isError
                    ? '—'
                    : formatCount(keysCountQuery.data ?? { count: 0, hasMore: false })}
                </div>
                <Link
                  href="/api-keys"
                  className="text-sm text-primary hover:underline flex items-center mt-1"
                >
                  Manage keys <ChevronRight className="h-4 w-4" />
                </Link>
              </StatCard>
            )}

            {healthQuery.isLoading ? (
              <div className="border rounded-lg p-6 flex items-center justify-center min-h-[120px]">
                <Spinner size={18} />
              </div>
            ) : (
              <StatCard label="Service health" index={3}>
                {healthQuery.isError ? (
                  <div className="text-sm text-destructive">Health check failed</div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-semibold">{healthQuery.data?.type ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      v{healthQuery.data?.version ?? '—'}
                    </div>
                  </div>
                )}
              </StatCard>
            )}
          </div>
        </div>
      </AnimatedPage>
    </MainLayout>
  );
}
