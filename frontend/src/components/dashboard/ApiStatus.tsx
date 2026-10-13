import { useHealth } from '@/lib/queries/useHealth';
import { cn } from '@/lib/utils';

/** Registry API reachability and version, from the public health endpoint. */
export function ApiStatus() {
  const { data, isPending, isError } = useHealth();

  const label = isPending
    ? 'Checking…'
    : isError
      ? 'Unavailable'
      : `Online · v${data.data.version}`;

  return (
    <p
      role="status"
      className="inline-flex flex-wrap items-center gap-x-2 rounded-full border px-3 py-1 text-sm whitespace-nowrap"
    >
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          isPending && 'animate-pulse bg-muted-foreground',
          isError && 'bg-destructive',
          !isPending && !isError && 'bg-green-500',
        )}
      />
      <span className="text-muted-foreground">Registry API:</span>
      <span className="font-medium">{label}</span>
    </p>
  );
}
