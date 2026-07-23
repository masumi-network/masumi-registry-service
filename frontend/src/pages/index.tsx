import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bot, Database, Key, RefreshCw } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  return (
    <MainLayout>
      <Head>
        <title>Dashboard | Registry Admin</title>
      </Head>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Registry overview for <span className="text-foreground font-medium">{network}</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void healthQuery.refetch();
              void agentsQuery.refetch();
              void sourcesQuery.refetch();
              void keysQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4" /> Agents
              </CardTitle>
              <CardDescription>Entries on {network}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {agentsQuery.isLoading ? '…' : (agentsQuery.data?.entries.length ?? 0)}
                {!agentsQuery.isLoading && (agentsQuery.data?.entries.length ?? 0) >= 5 ? '+' : ''}
              </div>
              <Button variant="ghost" className="px-0 mt-2 h-auto" asChild>
                <Link href="/agents">Browse agents</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" /> Sources
              </CardTitle>
              <CardDescription>Registry sources</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {sourcesQuery.isLoading ? '…' : (sourcesQuery.data?.sources.length ?? 0)}
                {!sourcesQuery.isLoading && (sourcesQuery.data?.sources.length ?? 0) >= 5
                  ? '+'
                  : ''}
              </div>
              <Button variant="ghost" className="px-0 mt-2 h-auto" asChild>
                <Link href="/sources">Manage sources</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4" /> API keys
              </CardTitle>
              <CardDescription>Access tokens</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {keysQuery.isLoading ? '…' : (keysQuery.data?.apiKeys.length ?? 0)}
                {!keysQuery.isLoading && (keysQuery.data?.apiKeys.length ?? 0) >= 5 ? '+' : ''}
              </div>
              <Button variant="ghost" className="px-0 mt-2 h-auto" asChild>
                <Link href="/api-keys">Manage keys</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Service health</CardTitle>
            <CardDescription>Unauthenticated /health probe</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {healthQuery.isLoading && <p>Checking…</p>}
            {healthQuery.data && (
              <>
                <p>
                  <span className="text-muted-foreground">Type:</span> {healthQuery.data.type}
                </p>
                <p>
                  <span className="text-muted-foreground">Version:</span>{' '}
                  {healthQuery.data.version}
                </p>
              </>
            )}
            {healthQuery.isError && (
              <p className="text-destructive">Health check failed</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
