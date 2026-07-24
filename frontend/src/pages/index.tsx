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
import {
  getApiKey,
  getHealth,
  getRegistrySource,
  postRegistryEntry,
} from '@/lib/api/generated';

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

  const agentsQuery = useQuery({
    queryKey: ['agents-preview', network],
    queryFn: async () => {
      const response = await postRegistryEntry({
        client: apiClient,
        body: { network, limit: 5 },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const sourcesQuery = useQuery({
    queryKey: ['sources-preview'],
    queryFn: async () => {
      const response = await getRegistrySource({
        client: apiClient,
        query: { limit: 5 },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const keysQuery = useQuery({
    queryKey: ['api-keys-preview'],
    queryFn: async () => {
      const response = await getApiKey({
        client: apiClient,
        query: { limit: 5 },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const isRefreshing =
    healthQuery.isFetching ||
    agentsQuery.isFetching ||
    sourcesQuery.isFetching ||
    keysQuery.isFetching;

  const handleRefresh = async () => {
    await Promise.all([
      healthQuery.refetch(),
      agentsQuery.refetch(),
      sourcesQuery.refetch(),
      keysQuery.refetch(),
    ]);
  };

  const agentsCount = agentsQuery.data?.entries.length ?? 0;
  const sourcesCount = sourcesQuery.data?.sources.length ?? 0;
  const keysCount = keysQuery.data?.apiKeys.length ?? 0;

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
            {agentsQuery.isLoading ? (
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
                  {agentsCount}
                  {agentsCount >= 5 ? '+' : ''}
                </div>
                <Link
                  href="/agents"
                  className="text-sm text-primary hover:underline flex items-center mt-1"
                >
                  Browse agents <ChevronRight className="h-4 w-4" />
                </Link>
              </StatCard>
            )}

            {sourcesQuery.isLoading ? (
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
                  {sourcesCount}
                  {sourcesCount >= 5 ? '+' : ''}
                </div>
                <Link
                  href="/sources"
                  className="text-sm text-primary hover:underline flex items-center mt-1"
                >
                  Manage sources <ChevronRight className="h-4 w-4" />
                </Link>
              </StatCard>
            )}

            {keysQuery.isLoading ? (
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
                  {keysCount}
                  {keysCount >= 5 ? '+' : ''}
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
