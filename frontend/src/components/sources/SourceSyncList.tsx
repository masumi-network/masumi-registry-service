import { Skeleton } from '@/components/ui/skeleton';
import type { RegistrySource } from '@/lib/api/generated';
import { shortId } from '@/lib/api-keys';
import { classifyAuthError } from '@/lib/auth/errors';
import { useRegistrySources } from '@/lib/queries/useRegistrySources';

/** How far the sync has read a source's policy: the Blockfrost page and last transaction. */
export function SyncPosition({ source }: { source: RegistrySource }) {
  return (
    <span className="tabular-nums">
      Page {source.latestPage}
      {source.latestIdentifier && (
        <span
          className="block font-mono text-xs text-muted-foreground"
          title={source.latestIdentifier}
        >
          last tx {shortId(source.latestIdentifier)}
        </span>
      )}
    </span>
  );
}

/** Each source's sync position, for the status dashboard. */
export function SourceSyncList() {
  const sources = useRegistrySources();
  return (
    <section aria-labelledby="source-sync" className="space-y-3 rounded-lg border p-4">
      <h2 id="source-sync" className="text-base font-semibold">
        Sync position by source
      </h2>
      {sources.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : sources.isError ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Could not load the registry sources. {classifyAuthError(sources.error).message}
        </p>
      ) : sources.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No registry sources yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {sources.data.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-2"
            >
              <span className="min-w-0">
                <span className="block font-medium">{source.network ?? 'Unknown network'}</span>
                <span
                  className="block truncate font-mono text-xs text-muted-foreground"
                  title={source.policyId ?? ''}
                >
                  {source.policyId ?? '—'}
                </span>
                {source.note && (
                  <span className="block text-xs text-muted-foreground">{source.note}</span>
                )}
              </span>
              <SyncPosition source={source} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
