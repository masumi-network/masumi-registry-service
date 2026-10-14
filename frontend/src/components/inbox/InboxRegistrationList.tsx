import { RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { RelativeTime } from '@/components/agents/AgentList';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { InboxAgentRegistration } from '@/lib/api/generated';
import type { InboxStatus } from '@/lib/admin-dashboard';
import type { Network } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { useRefreshInboxRegistration } from '@/lib/queries/useInboxRegistrations';
import { httpUrl } from '@/lib/utils';

export const INBOX_STATUS_BADGE: Record<InboxStatus, BadgeProps['variant']> = {
  Pending: 'warning',
  Verified: 'success',
  Invalid: 'destructive',
  Deregistered: 'secondary',
};

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs break-all">{value ?? '—'}</dd>
    </div>
  );
}

function Registration({
  registration,
  network,
}: {
  registration: InboxAgentRegistration;
  network: Network;
}) {
  const refresh = useRefreshInboxRegistration(network);
  const providerUrl = httpUrl(registration.providerUrl);

  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {registration.name}{' '}
            <span className="font-normal text-muted-foreground">@{registration.agentSlug}</span>
          </p>
          {registration.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{registration.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Status changed <RelativeTime date={registration.statusUpdatedAt} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={INBOX_STATUS_BADGE[registration.status]}>{registration.status}</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={refresh.isPending}
            onClick={() =>
              refresh.mutate(registration.agentIdentifier, {
                onSuccess: () => toast.success(`Re-checked @${registration.agentSlug}`),
                onError: (error) => toast.error(classifyAuthError(error).message),
              })
            }
          >
            <RefreshCw
              className={refresh.isPending ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            Re-check
          </Button>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Details and keys</summary>
        <dl className="mt-2 grid gap-3 @2xl:grid-cols-2">
          <Detail label="Agent identifier" value={registration.agentIdentifier} />
          <Detail label="Policy ID" value={registration.RegistrySource.policyId} />
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Provider URL</dt>
            <dd className="text-xs break-all">
              {providerUrl ? (
                <a
                  href={providerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {providerUrl}
                </a>
              ) : (
                (registration.providerUrl ?? '—')
              )}
            </dd>
          </div>
          <Detail label="Linked email" value={registration.linkedEmail} />
          <Detail
            label={`Encryption key${registration.encryptionKeyVersion ? ` (v${registration.encryptionKeyVersion})` : ''}`}
            value={registration.encryptionPublicKey}
          />
          <Detail
            label={`Signing key${registration.signingKeyVersion ? ` (v${registration.signingKeyVersion})` : ''}`}
            value={registration.signingPublicKey}
          />
        </dl>
      </details>
    </li>
  );
}

export function InboxRegistrationList({
  registrations,
  network,
}: {
  registrations: InboxAgentRegistration[];
  network: Network;
}) {
  return (
    <ul aria-label="Inbox agent registrations" className="divide-y">
      {registrations.map((registration) => (
        <Registration key={registration.id} registration={registration} network={network} />
      ))}
    </ul>
  );
}
