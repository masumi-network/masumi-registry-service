import { useState } from 'react';
import Head from 'next/head';
import { Ban, Gauge, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import { CreateApiKeyDialog } from '@/components/api-keys/CreateApiKeyDialog';
import { RevokeKeyDialog, UsageLimitDialog } from '@/components/api-keys/KeyActionDialogs';
import { MainLayout } from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApiKey } from '@/lib/api/generated';
import { shortId } from '@/lib/api-keys';
import { classifyAuthError } from '@/lib/auth/errors';
import { useAuth } from '@/lib/contexts/AuthContext';
import { describeUsage } from '@/lib/permissions';
import { useApiKeys } from '@/lib/queries/useApiKeys';
import { useApiKeyStatus } from '@/lib/queries/useApiKeyStatus';

type Dialog =
  | { kind: 'create' }
  | { kind: 'revoke'; key: ApiKey }
  | { kind: 'limit'; key: ApiKey }
  | null;

function Usage({ apiKey }: { apiKey: ApiKey }) {
  const { used, limit } = describeUsage(apiKey);
  return (
    <span className="tabular-nums">
      {used}
      <span className="text-muted-foreground">
        {limit === null ? ' credits, no limit' : ` of ${limit} credits`}
      </span>
    </span>
  );
}

/** Admin: create API keys, see their usage, set limits and revoke them. */
export default function ApiKeysPage() {
  const keys = useApiKeys();
  const session = useApiKeyStatus();
  const { signOut } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  return (
    <MainLayout>
      <Head>
        <title>API keys | Masumi Registry</title>
      </Head>
      <div className="@container space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
            <p className="max-w-prose text-sm text-muted-foreground">
              Keys for the registry API. A key&apos;s token is shown once, when it is created;
              changing a key later needs that token.
            </p>
          </div>
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus aria-hidden="true" />
            Create key
          </Button>
        </div>

        <section aria-label="API keys" className="rounded-lg border">
          {keys.isPending ? (
            <Skeleton className="m-4 h-24" />
          ) : keys.isError ? (
            <p role="alert" className="p-4 text-sm text-muted-foreground">
              Could not load the API keys. {classifyAuthError(keys.error).message}
            </p>
          ) : keys.data.length === 0 ? (
            <EmptyState title="No API keys" description="Create a key to give a client access." />
          ) : (
            <ul className="divide-y">
              {keys.data.map((apiKey) => {
                const isSessionKey = apiKey.id === session.data?.id;
                return (
                  <li
                    key={apiKey.id}
                    className="grid gap-x-6 gap-y-2 p-4 @3xl:grid-cols-[minmax(0,1fr)_6rem_6rem_minmax(0,1fr)_auto] @3xl:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-sm" title={apiKey.id}>
                        {shortId(apiKey.id)}
                      </span>
                      {isSessionKey && (
                        <span className="text-xs text-muted-foreground">This session</span>
                      )}
                    </span>
                    <Badge variant={apiKey.permission === 'Admin' ? 'warning' : 'secondary'}>
                      {apiKey.permission}
                    </Badge>
                    <Badge variant={apiKey.status === 'Active' ? 'success' : 'destructive'}>
                      {apiKey.status}
                    </Badge>
                    <span className="text-sm">
                      <Usage apiKey={apiKey} />
                    </span>
                    {/* A revoked key's token is refused, so it can no longer be verified or changed. */}
                    {apiKey.status === 'Active' ? (
                      <span className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDialog({ kind: 'limit', key: apiKey })}
                        >
                          <Gauge aria-hidden="true" />
                          Limit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDialog({ kind: 'revoke', key: apiKey })}
                        >
                          <Ban aria-hidden="true" />
                          Revoke
                        </Button>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No actions</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {dialog?.kind === 'create' && <CreateApiKeyDialog onClose={close} />}
      {dialog?.kind === 'limit' && (
        <UsageLimitDialog
          apiKey={dialog.key}
          onClose={close}
          onDone={(message) => {
            toast.success(message);
            close();
          }}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeKeyDialog
          apiKey={dialog.key}
          isSessionKey={dialog.key.id === session.data?.id}
          onClose={close}
          onDone={(message) => {
            close();
            if (dialog.key.id === session.data?.id) {
              signOut('You revoked the key this session used. Sign in with another key.');
              return;
            }
            toast.success(message);
          }}
        />
      )}
    </MainLayout>
  );
}
