import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppContext } from '@/lib/contexts/AppContext';
import { postRegistryEntryRefresh, type RegistryEntry } from '@/lib/api/generated';
import {
  cn,
  extractErrorMessage,
  formatAssetAmount,
  formatDate,
  formatDateTime,
  formatFundUnit,
  shortenId,
} from '@/lib/utils';

function statusVariant(status: RegistryEntry['status']) {
  switch (status) {
    case 'Online':
      return 'success' as const;
    case 'Offline':
      return 'warning' as const;
    case 'Deregistered':
    case 'Invalid':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

function paymentTypeLabel(paymentType: RegistryEntry['paymentType']) {
  switch (paymentType) {
    case 'Web3CardanoV1':
      return 'Cardano V1';
    case 'Web3CardanoV2':
      return 'Cardano V2';
    case 'None':
      return 'None';
    default:
      return paymentType;
  }
}

type FixedAmount = { amount: string; unit: string };

function getFixedAmounts(pricing: RegistryEntry['AgentPricing']): FixedAmount[] {
  if (
    !pricing ||
    typeof pricing !== 'object' ||
    !('pricingType' in pricing) ||
    pricing.pricingType !== 'Fixed' ||
    !('FixedPricing' in pricing) ||
    !pricing.FixedPricing ||
    typeof pricing.FixedPricing !== 'object' ||
    !('Amounts' in pricing.FixedPricing) ||
    !Array.isArray(pricing.FixedPricing.Amounts)
  ) {
    return [];
  }
  return pricing.FixedPricing.Amounts as FixedAmount[];
}

function PricingSection({
  pricing,
  network,
}: {
  pricing: RegistryEntry['AgentPricing'];
  network: string;
}) {
  if (!pricing || typeof pricing !== 'object' || !('pricingType' in pricing)) {
    return <p className="text-sm text-muted-foreground">No pricing information available</p>;
  }

  if (pricing.pricingType === 'Free') {
    return (
      <div className="text-sm">
        <span className="font-medium">Free</span>
      </div>
    );
  }

  if (pricing.pricingType === 'Dynamic') {
    return (
      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Dynamic</span>
        <span className="ml-1 text-xs">(price set per request)</span>
      </div>
    );
  }

  const amounts = getFixedAmounts(pricing);
  if (amounts.length === 0) {
    return <p className="text-sm text-muted-foreground">No pricing information available</p>;
  }

  return (
    <div className="space-y-0 rounded-md border bg-muted/40 p-2">
      {amounts.map((price, index) => (
        <div
          key={`${price.unit}-${price.amount}-${index}`}
          className={cn(
            'flex items-center justify-between gap-3 py-2',
            index < amounts.length - 1 && 'border-b border-border/60',
          )}
        >
          <span
            className="text-sm text-muted-foreground truncate"
            title={price.unit || 'lovelace'}
          >
            Price ({formatFundUnit(price.unit || 'lovelace', network)})
          </span>
          <span className="font-medium text-sm whitespace-nowrap">
            {formatAssetAmount(price.amount, price.unit || 'lovelace', network)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-sm text-right min-w-0 break-words">{children}</div>
    </div>
  );
}

interface AgentDetailsDialogProps {
  agent: RegistryEntry | null;
  onClose: () => void;
  onAgentUpdated?: (agent: RegistryEntry) => void;
}

export function AgentDetailsDialog({ agent, onClose, onAgentUpdated }: AgentDetailsDialogProps) {
  const { apiClient, network } = useAppContext();
  const queryClient = useQueryClient();

  const refreshMutation = useMutation({
    mutationFn: async (agentIdentifier: string) => {
      const response = await postRegistryEntryRefresh({
        client: apiClient,
        body: { network, agentIdentifier },
      });
      if (response.error) throw response.error;
      return response.data?.data?.entry;
    },
    onSuccess: (entry) => {
      toast.success('Agent refreshed');
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      if (entry) onAgentUpdated?.(entry);
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Refresh failed')),
  });

  const capabilityLabel = agent?.Capability?.name
    ? `${agent.Capability.name}${agent.Capability.version ? `@${agent.Capability.version}` : ''}`
    : null;

  return (
    <Dialog open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="max-h-[90vh] px-0 pb-0 flex flex-col">
        {agent && (
          <>
            <DialogHeader className="px-6 shrink-0">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start gap-3">
                    <DialogTitle className="text-xl leading-tight break-words">
                      {agent.name}
                    </DialogTitle>
                    <Badge
                      variant={statusVariant(agent.status)}
                      className="mt-0.5 shrink-0 whitespace-nowrap"
                    >
                      {agent.status}
                    </Badge>
                  </div>
                  {agent.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {agent.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate(agent.agentIdentifier)}
                >
                  <RefreshCw
                    className={cn('h-4 w-4', refreshMutation.isPending && 'animate-spin')}
                  />
                  Refresh
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4 px-6 overflow-y-auto min-h-0 flex-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Identity</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/60">
                  <DetailRow label="Agent ID">
                    <div className="flex items-center justify-end gap-1 font-mono text-xs">
                      <span title={agent.agentIdentifier}>
                        {shortenId(agent.agentIdentifier, 12)}
                      </span>
                      <CopyButton value={agent.agentIdentifier} className="h-7 w-7" />
                    </div>
                  </DetailRow>
                  <DetailRow label="Payment type">
                    {paymentTypeLabel(agent.paymentType)}
                  </DetailRow>
                  <DetailRow label="Capability">{capabilityLabel ?? '—'}</DetailRow>
                  <DetailRow label="Metadata version">v{agent.metadataVersion}</DetailRow>
                  {agent.supersedesAgentIdentifier && (
                    <DetailRow label="Supersedes">
                      <span className="font-mono text-xs">
                        {shortenId(agent.supersedesAgentIdentifier, 10)}
                      </span>
                    </DetailRow>
                  )}
                  {agent.supersededByAgentIdentifier && (
                    <DetailRow label="Superseded by">
                      <span className="font-mono text-xs">
                        {shortenId(agent.supersededByAgentIdentifier, 10)}
                      </span>
                    </DetailRow>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">API</CardTitle>
                </CardHeader>
                <CardContent>
                  {agent.apiBaseUrl ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2">
                      <a
                        href={agent.apiBaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate flex items-center gap-1 min-w-0"
                      >
                        <span className="truncate">{agent.apiBaseUrl}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <CopyButton value={agent.apiBaseUrl} className="h-7 w-7 shrink-0" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No API base URL</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Health</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/60">
                  <DetailRow label="Uptime">
                    {agent.uptimeCount}/{agent.uptimeCheckCount}
                  </DetailRow>
                  <DetailRow label="Last check">
                    {formatDateTime(agent.lastUptimeCheck)}
                  </DetailRow>
                  <DetailRow label="Status updated">
                    {formatDateTime(agent.statusUpdatedAt)}
                  </DetailRow>
                  <DetailRow label="Created">{formatDate(agent.createdAt)}</DetailRow>
                  <DetailRow label="Updated">{formatDateTime(agent.updatedAt)}</DetailRow>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pricing</CardTitle>
                </CardHeader>
                <CardContent>
                  <PricingSection pricing={agent.AgentPricing} network={network} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {agent.tags && agent.tags.length > 0 ? (
                      agent.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No tags</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Author</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/60">
                  <DetailRow label="Name">{agent.authorName || '—'}</DetailRow>
                  <DetailRow label="Organization">
                    {agent.authorOrganization || '—'}
                  </DetailRow>
                  <DetailRow label="Email">
                    {agent.authorContactEmail ? (
                      <a
                        href={`mailto:${agent.authorContactEmail}`}
                        className="text-primary hover:underline"
                      >
                        {agent.authorContactEmail}
                      </a>
                    ) : (
                      '—'
                    )}
                  </DetailRow>
                  <DetailRow label="Other">{agent.authorContactOther || '—'}</DetailRow>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Registry source</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/60">
                  <DetailRow label="Policy ID">
                    {agent.RegistrySource.policyId ? (
                      <div className="flex items-center justify-end gap-1 font-mono text-xs">
                        <span>{shortenId(agent.RegistrySource.policyId, 10)}</span>
                        <CopyButton
                          value={agent.RegistrySource.policyId}
                          className="h-7 w-7"
                        />
                      </div>
                    ) : (
                      '—'
                    )}
                  </DetailRow>
                  <DetailRow label="URL">
                    {agent.RegistrySource.url ? (
                      <a
                        href={agent.RegistrySource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {agent.RegistrySource.url}
                      </a>
                    ) : (
                      '—'
                    )}
                  </DetailRow>
                </CardContent>
              </Card>

              {(agent.privacyPolicy || agent.termsAndCondition || agent.otherLegal) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Legal</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {agent.privacyPolicy && (
                      <a
                        href={agent.privacyPolicy}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Privacy policy <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {agent.termsAndCondition && (
                      <a
                        href={agent.termsAndCondition}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Terms & conditions <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {agent.otherLegal && (
                      <a
                        href={agent.otherLegal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Other legal <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              )}

              {agent.SupportedPaymentSources.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Payment sources ({agent.SupportedPaymentSources.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agent.SupportedPaymentSources.map((source) => (
                      <div
                        key={`${source.chain}-${source.sourceIndex}-${source.address}`}
                        className="rounded-lg border bg-muted/30 p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {source.chain} · {source.network}
                          </span>
                          {source.paymentSourceType && (
                            <Badge variant="outline" className="text-[10px]">
                              {source.paymentSourceType}
                            </Badge>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground break-all">
                          {source.address}
                        </div>
                        {source.scheme && (
                          <div className="text-xs text-muted-foreground">
                            Scheme: {source.scheme}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {agent.Verifications.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Verifications ({agent.Verifications.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agent.Verifications.map((verification) => (
                      <div
                        key={`${verification.method}-${verification.credentialSaid}`}
                        className="rounded-lg border bg-muted/30 p-3 space-y-1"
                      >
                        <div className="text-sm font-medium">{verification.method}</div>
                        {verification.schemaVersion && (
                          <div className="text-xs text-muted-foreground">
                            Schema {verification.schemaVersion}
                          </div>
                        )}
                        <div className="font-mono text-xs text-muted-foreground break-all">
                          {shortenId(verification.credentialSaid, 14)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {agent.ExampleOutput.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Example outputs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {agent.ExampleOutput.map((example) => (
                      <a
                        key={`${example.name}-${example.url}`}
                        href={example.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {example.name}
                        <span className="text-xs text-muted-foreground">
                          ({example.mimeType})
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
