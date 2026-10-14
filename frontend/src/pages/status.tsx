import Head from 'next/head';
import type { ParsedUrlQuery } from 'querystring';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { NetworkOverview } from '@/components/status/NetworkOverview';
import { SourceSyncList } from '@/components/sources/SourceSyncList';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NETWORKS } from '@/lib/agent-filters';
import { useUrlView } from '@/lib/hooks/useUrlView';
import { useHealth } from '@/lib/queries/useHealth';
import { queryKeys } from '@/lib/queries/query-keys';

const WINDOWS = {
  '24h': { days: 1, label: '24 hours' },
  '7d': { days: 7, label: '7 days' },
  '30d': { days: 30, label: '30 days' },
} as const;
type WindowKey = keyof typeof WINDOWS;
const DEFAULT_WINDOW: WindowKey = '7d';
const isWindow = (value: unknown): value is WindowKey =>
  typeof value === 'string' && Object.hasOwn(WINDOWS, value);

// The sync window is part of the view, so it lives in the URL like the agent filters.
const windowCodec = {
  parse: (query: ParsedUrlQuery): WindowKey =>
    isWindow(query.window) ? query.window : DEFAULT_WINDOW,
  serialize: (key: WindowKey): Record<string, string> =>
    key === DEFAULT_WINDOW ? {} : { window: key },
};

function ServiceHealth() {
  const { data, isPending, isError, error, dataUpdatedAt } = useHealth();
  return (
    <section aria-labelledby="service-health" className="space-y-2 rounded-lg border p-4">
      <h2 id="service-health" className="text-base font-semibold">
        Service health
      </h2>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          The registry API did not answer:{' '}
          {error instanceof Error ? error.message : 'unknown error'}
        </p>
      ) : (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="font-medium text-green-700 dark:text-green-400">Online</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Service</dt>
            <dd className="font-medium">{data.data.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Version</dt>
            <dd className="font-medium">{data.data.version}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Checked</dt>
            <dd className="font-medium">{new Date(dataUpdatedAt).toLocaleTimeString()}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/** Admin: service health, agents by status, sync activity and sources, per network. */
export default function StatusPage() {
  const queryClient = useQueryClient();
  const { view: syncWindow, updateView } = useUrlView(windowCodec);

  return (
    <MainLayout>
      <Head>
        <title>Status | Masumi Registry</title>
      </Head>
      <div className="@container space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
            <p className="max-w-prose text-sm text-muted-foreground">
              Registry sync and health on both networks. The registry records no run times, so the
              times shown are the newest changes the sync and the health job wrote.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="status-window" className="text-xs font-normal text-muted-foreground">
                Sync window
              </Label>
              <Select
                value={syncWindow}
                onValueChange={(next) => isWindow(next) && updateView(() => next)}
              >
                <SelectTrigger id="status-window" className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WINDOWS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      Last {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                for (const queryKey of [
                  ['overview'],
                  queryKeys.inbox,
                  queryKeys.health,
                  queryKeys.registrySources,
                ]) {
                  void queryClient.invalidateQueries({ queryKey });
                }
              }}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>

        <ServiceHealth />
        <div className="grid gap-6 @5xl:grid-cols-2">
          {NETWORKS.map((network) => (
            <NetworkOverview
              key={network}
              network={network}
              windowDays={WINDOWS[syncWindow].days}
              windowLabel={WINDOWS[syncWindow].label}
            />
          ))}
        </div>
        <SourceSyncList />
      </div>
    </MainLayout>
  );
}
