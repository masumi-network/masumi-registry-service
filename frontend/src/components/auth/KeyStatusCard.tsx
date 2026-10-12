import { describeUsage } from '@/lib/permissions';
import { useApiKeyStatus } from '@/lib/queries/useApiKeyStatus';

// Stacked on narrow screens: the content column is only ~190px beside the sidebar rail.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-8">
      <dt className="text-muted-foreground sm:w-32 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** What the signed-in key is: permission, credits used, and the limit if it has one. */
export function KeyStatusCard() {
  const { data } = useApiKeyStatus();
  if (!data) return null;

  const { used, limit } = describeUsage(data);

  return (
    <section
      aria-labelledby="key-status-heading"
      className="max-w-xl space-y-4 rounded-lg border p-4 sm:p-5"
    >
      <h2 id="key-status-heading" className="text-sm font-semibold tracking-tight">
        Your API key
      </h2>
      <dl className="space-y-3 text-sm">
        <Row label="Permission">{data.permission}</Row>
        <Row label="Usage credits">{used.toLocaleString()} used</Row>
        <Row label="Usage limit">
          {limit === null ? 'Unlimited' : `${limit.toLocaleString()} credits`}
        </Row>
      </dl>
    </section>
  );
}
