import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { MainLayout } from '@/components/layout/MainLayout';
import { AgentHealth } from '@/components/agents/AgentHealth';
import { STATUS_BADGE } from '@/components/agents/AgentList';
import { AgentOverview } from '@/components/agents/AgentOverview';
import { AgentPricing } from '@/components/agents/AgentPricing';
import { AgentSpecViewer } from '@/components/agents/AgentSpecViewer';
import { AgentVersionLineage } from '@/components/agents/AgentVersionLineage';
import { AgentDetailSkeleton } from '@/components/skeletons/AgentDetailSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { Network } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { useAppContext } from '@/lib/contexts/AppContext';
import { ENTRY_TYPE_LABELS } from '@/lib/display-labels';
import { isAdminKey } from '@/lib/permissions';
import { useAgent } from '@/lib/queries/useAgent';
import { useApiKeyStatus } from '@/lib/queries/useApiKeyStatus';
import { useRefreshAgent } from '@/lib/queries/useRefreshAgent';

// A policy ID (56 hex characters) and a hex asset name; 57 to 250 is what the endpoints
// this page calls accept.
const AGENT_IDENTIFIER = /^[0-9a-fA-F]{57,250}$/;

function parseAgentIdentifier(value: unknown): string | null {
  return typeof value === 'string' && AGENT_IDENTIFIER.test(value) ? value : null;
}

function RefreshButton({
  network,
  agentIdentifier,
  apiClient,
}: {
  network: Network;
  agentIdentifier: string;
  apiClient: ReturnType<typeof useAppContext>['apiClient'];
}) {
  const refresh = useRefreshAgent(network, agentIdentifier, apiClient);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={refresh.isPending}
      title="Sync the registry from chain and run this agent's health check now"
      onClick={() =>
        refresh.mutate(undefined, {
          onSuccess: (entry) => toast.success(`Refreshed. The agent is ${entry.status}.`),
          onError: (error) => toast.error(`Refresh failed. ${classifyAuthError(error).message}`),
        })
      }
    >
      {refresh.isPending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {refresh.isPending ? 'Refreshing…' : 'Refresh'}
    </Button>
  );
}

function AgentDetail({ agentIdentifier }: { agentIdentifier: string }) {
  const { network, setNetwork, apiClient, apiKey } = useAppContext();
  const query = useAgent(network, agentIdentifier, apiClient);
  const { data: key } = useApiKeyStatus(Boolean(apiKey), apiClient);

  if (query.isPending) return <AgentDetailSkeleton />;
  if (query.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border px-4 py-10 text-center text-sm">
        <p className="font-medium">Could not load this agent.</p>
        <p className="mx-auto max-w-md text-muted-foreground">
          {classifyAuthError(query.error).message}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const agent = query.data;
  if (!agent) {
    // Entries belong to one network, and the network is app-level, not part of the link.
    const other: Network = network === 'Preprod' ? 'Mainnet' : 'Preprod';
    return (
      <>
        <Head>
          <title>Agent not found | Masumi Registry</title>
        </Head>
        <EmptyState
          icon="search"
          className="rounded-lg border"
          title={`No agent with this identifier on ${network}`}
          description={`The link may be for an agent on ${other}.`}
          action={
            <Button variant="outline" size="sm" onClick={() => setNetwork(other)}>
              Look on {other}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Head>
        <title>{`${agent.name} | Masumi Registry`}</title>
      </Head>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">{agent.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={STATUS_BADGE[agent.status]}>{agent.status}</Badge>
            {ENTRY_TYPE_LABELS[agent.type]} agent on {network}
          </p>
        </div>
        {isAdminKey(key) && (
          <RefreshButton
            network={network}
            agentIdentifier={agent.agentIdentifier}
            apiClient={apiClient}
          />
        )}
      </div>
      <AgentOverview agent={agent} network={network} />
      <AgentHealth agent={agent} />
      <AgentVersionLineage agent={agent} network={network} apiClient={apiClient} />
      <AgentPricing agent={agent} network={network} apiClient={apiClient} />
      <AgentSpecViewer agent={agent} network={network} apiClient={apiClient} />
    </div>
  );
}

/** One registry entry, opened from the agent list or by a link with its asset identifier. */
export default function AgentPage() {
  const router = useRouter();
  const agentIdentifier = parseAgentIdentifier(router.query.agentIdentifier);

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All agents
        </Link>
        {!router.isReady ? (
          <AgentDetailSkeleton />
        ) : agentIdentifier ? (
          // Keyed, so following a version link starts that agent fresh (refresh state included).
          <AgentDetail key={agentIdentifier} agentIdentifier={agentIdentifier} />
        ) : (
          <>
            <Head>
              <title>Agent not found | Masumi Registry</title>
            </Head>
            <EmptyState
              icon="search"
              className="rounded-lg border"
              title="This link has no valid asset identifier"
              description="Open an agent from the list to see its details."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/">Browse agents</Link>
                </Button>
              }
            />
          </>
        )}
      </div>
    </MainLayout>
  );
}
