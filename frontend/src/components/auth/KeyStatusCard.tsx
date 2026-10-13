import { describeUsage } from '@/lib/permissions';
import { useApiKeyStatus } from '@/lib/queries/useApiKeyStatus';

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * What the signed-in key is: permission, credits used, and the limit if it has one.
 * One wrapping line, so it sits above the agent list without pushing it down.
 */
export function KeyStatusCard() {
  const { data } = useApiKeyStatus();
  if (!data) return null;

  const { used, limit } = describeUsage(data);

  return (
    <section aria-labelledby="key-status-heading" className="space-y-1 text-sm">
      <h2 id="key-status-heading" className="text-xs font-medium text-muted-foreground">
        Your API key
      </h2>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        <Item label="Permission">{data.permission}</Item>
        <Item label="Credits used">{used.toLocaleString()}</Item>
        <Item label="Limit">{limit === null ? 'Unlimited' : limit.toLocaleString()}</Item>
      </dl>
    </section>
  );
}
