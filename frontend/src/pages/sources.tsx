import { useState } from 'react';
import Head from 'next/head';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { MainLayout } from '@/components/layout/MainLayout';
import { SourceFormDialog } from '@/components/sources/SourceFormDialog';
import { SyncPosition } from '@/components/sources/SourceSyncList';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { RegistrySource } from '@/lib/api/generated';
import { classifyAuthError } from '@/lib/auth/errors';
import { maskSecret } from '@/lib/registry-sources';
import {
  useRegistrySources,
  useRemoveRegistrySource,
  useSourceDependents,
} from '@/lib/queries/useRegistrySources';

type FormTarget = { source: RegistrySource | null; key: number };

function RemoveSourceDialog({ source, onClose }: { source: RegistrySource; onClose: () => void }) {
  const dependents = useSourceDependents(source);
  const remove = useRemoveRegistrySource();

  const affected = dependents.isPending
    ? 'Counting the agents and inbox registrations it would delete…'
    : dependents.isError
      ? 'Could not count what it would delete. Every agent and inbox registration read from this policy is deleted with it.'
      : `It deletes ${dependents.data.isComplete ? '' : 'at least '}${dependents.data.agents} agent ${dependents.data.agents === 1 ? 'entry' : 'entries'} and ${dependents.data.inboxRegistrations} inbox ${dependents.data.inboxRegistrations === 1 ? 'registration' : 'registrations'} read from this policy.`;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Remove registry source?"
      description={
        <>
          <p>
            Stops scanning policy <span className="font-mono break-all">{source.policyId}</span> on{' '}
            {source.network}.
          </p>
          <p className="font-medium text-foreground">{affected}</p>
          <p>They come back only if the source is added again and re-synced from chain.</p>
        </>
      }
      acknowledgementLabel="I understand these entries are deleted from the registry."
      confirmLabel="Remove source"
      canConfirm={!dependents.isPending}
      isLoading={remove.isPending}
      error={remove.isError ? classifyAuthError(remove.error).message : null}
      onConfirm={() =>
        remove.mutate(source.id, {
          onSuccess: () => {
            toast.success(`Source removed from ${source.network}`);
            onClose();
          },
        })
      }
    />
  );
}

/** Admin: the policies the registry scans for agents, per network. */
export default function SourcesPage() {
  const sources = useRegistrySources();
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RegistrySource | null>(null);
  const openForm = (source: RegistrySource | null) =>
    setFormTarget((current) => ({ source, key: (current?.key ?? 0) + 1 }));

  return (
    <MainLayout>
      <Head>
        <title>Sources | Masumi Registry</title>
      </Head>
      <div className="@container space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Registry sources</h1>
            <p className="max-w-prose text-sm text-muted-foreground">
              Each source is a policy the registry scans for agent NFTs, with the Blockfrost project
              key it scans with.
            </p>
          </div>
          <Button onClick={() => openForm(null)}>
            <Plus aria-hidden="true" />
            Add source
          </Button>
        </div>

        <section aria-label="Registry sources" className="rounded-lg border">
          {sources.isPending ? (
            <Skeleton className="m-4 h-24" />
          ) : sources.isError ? (
            <p role="alert" className="p-4 text-sm text-muted-foreground">
              Could not load the registry sources. {classifyAuthError(sources.error).message}
            </p>
          ) : sources.data.length === 0 ? (
            <EmptyState
              title="No registry sources"
              description="Add a policy for the registry to scan."
            />
          ) : (
            <ul className="divide-y">
              {sources.data.map((source) => (
                <li
                  key={source.id}
                  className="grid gap-x-6 gap-y-2 p-4 @3xl:grid-cols-[6rem_minmax(0,1fr)_7rem_9rem_auto] @3xl:items-start"
                >
                  <span className="font-medium">{source.network ?? '—'}</span>
                  <span className="min-w-0">
                    <span className="block font-mono text-xs break-all">
                      {source.policyId ?? '—'}
                    </span>
                    {source.note && (
                      <span className="block text-sm text-muted-foreground">{source.note}</span>
                    )}
                  </span>
                  <span className="text-sm">
                    <span className="block text-xs text-muted-foreground @3xl:sr-only">Key</span>
                    <span className="font-mono">{maskSecret(source.rpcProviderApiKey)}</span>
                  </span>
                  <span className="text-sm">
                    <SyncPosition source={source} />
                  </span>
                  <span className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openForm(source)}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRemoveTarget(source)}>
                      <Trash2 aria-hidden="true" />
                      Remove
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {formTarget && (
        <SourceFormDialog
          key={formTarget.key}
          open
          source={formTarget.source}
          existing={sources.data ?? []}
          onClose={() => setFormTarget(null)}
          onSaved={(message) => {
            toast.success(message);
            setFormTarget(null);
          }}
        />
      )}
      {/* Keyed per source, so one removal's error or progress never shows in the next. */}
      {removeTarget && (
        <RemoveSourceDialog
          key={removeTarget.id}
          source={removeTarget}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </MainLayout>
  );
}
