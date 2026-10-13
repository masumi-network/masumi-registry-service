import { MainLayout } from '@/components/layout/MainLayout';
import { useHealth } from '@/lib/queries/useHealth';
import { cn } from '@/lib/utils';

function ApiStatus() {
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

export default function Dashboard() {
  return (
    <MainLayout>
      <section aria-labelledby="dashboard-heading" className="space-y-4">
        <div className="space-y-2">
          <h1 id="dashboard-heading" className="text-2xl font-semibold tracking-tight">
            Registry Admin
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Agents, registry sources and API keys will be managed here.
          </p>
        </div>
        <ApiStatus />
      </section>
    </MainLayout>
  );
}
