import { isAxiosError } from 'axios';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import type { RegistryEntry } from '@/lib/api/generated';
import type { Network } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { PAYMENT_TYPE_LABELS, formatAmount, unitLabel } from '@/lib/display-labels';
import { usePaymentInformation } from '@/lib/queries/usePaymentInformation';
import { DetailSection, Field, Mono, UrlText } from './AgentDetailSection';

type PricingFields = Pick<
  RegistryEntry,
  'paymentType' | 'AgentPricing' | 'SupportedPaymentSources'
>;
type PaymentSource = RegistryEntry['SupportedPaymentSources'][number];

// The generated type of AgentPricing collapses to `unknown` (a nullable union), so it is
// narrowed here against the API's own output schema.
const agentPricingSchema = z.discriminatedUnion('pricingType', [
  z.object({
    pricingType: z.literal('Fixed'),
    FixedPricing: z.object({
      Amounts: z.array(z.object({ amount: z.string(), unit: z.string() })),
    }),
  }),
  z.object({ pricingType: z.literal('Free') }),
  z.object({ pricingType: z.literal('Dynamic') }),
]);

function Amounts({ amounts }: { amounts: ReturnType<typeof formatAmount>[] }) {
  return (
    <ul className="space-y-1">
      {amounts.map(({ amount, unit, inBaseUnits }, index) => (
        <li key={index} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium tabular-nums">{amount}</span>
          {inBaseUnits && <span className="text-xs text-muted-foreground">base units of</span>}
          <Mono>{unit}</Mono>
        </li>
      ))}
    </ul>
  );
}

function AgentPrice({ pricing, network }: { pricing: PricingFields; network: Network }) {
  const parsed = agentPricingSchema.safeParse(pricing.AgentPricing);
  if (!parsed.success) {
    // V2 agents price each payment source instead.
    return pricing.SupportedPaymentSources.length > 0 ? (
      <>Set per payment source, below</>
    ) : (
      <>No pricing in the metadata</>
    );
  }
  if (parsed.data.pricingType === 'Free') return <>Free</>;
  if (parsed.data.pricingType === 'Dynamic') return <>Dynamic, quoted by the agent per request</>;
  return (
    <Amounts
      amounts={parsed.data.FixedPricing.Amounts.map((price) =>
        formatAmount(price.amount, price.unit, network),
      )}
    />
  );
}

function SourcePrice({ source }: { source: PaymentSource }) {
  const { pricing } = source;
  if (pricing.pricingType === 'Free') return <>Free</>;
  if (pricing.pricingType === 'Dynamic') {
    const asset = pricing.dynamic?.[0];
    return (
      <>
        Dynamic, quoted by the agent per request
        {asset && (
          <span className="block text-muted-foreground">
            Paid in <Mono>{unitLabel(asset.asset, source.network)}</Mono>
          </span>
        )}
      </>
    );
  }
  return (
    <Amounts
      amounts={pricing.fixed.map((price) =>
        formatAmount(price.amount, price.asset, source.network, price.decimals),
      )}
    />
  );
}

function PaymentSources({ sources }: { sources: PaymentSource[] }) {
  return (
    <ul aria-label="Payment sources" className="divide-y rounded-md border">
      {sources.map((source) => (
        <li key={source.sourceIndex} className="space-y-3 p-3">
          <p className="text-sm font-medium">
            Source {source.sourceIndex}
            <span className="font-normal text-muted-foreground">
              {' · '}
              {[source.chain, source.network, source.scheme ?? source.paymentSourceType]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          <dl className="grid gap-4 @xl:grid-cols-2">
            <Field label="Price">
              <SourcePrice source={source} />
            </Field>
            <Field label="Address">
              <Mono>{source.address}</Mono>
            </Field>
            {source.payTo && (
              <Field label="Pay to">
                <Mono>{source.payTo}</Mono>
              </Field>
            )}
            {source.resource && (
              <Field label="Resource">
                <UrlText url={source.resource} />
              </Field>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function unavailableMessage(error: unknown): string {
  // payment-information answers 404 for several causes it does not tell apart: no wallet
  // holds the asset (as after a burn), no registry source with chain access matches the
  // policy, or the entry is gone. Name them all rather than guess one.
  if (isAxiosError(error) && error.response?.status === 404) {
    return 'The registry could not read this asset on chain. It may have been burned, or the registry has no chain access for this policy.';
  }
  return classifyAuthError(error).message;
}

/** Payment type and price, from payment-information, which reads the seller wallet from chain. */
export function AgentPricing({ agent, network }: { agent: RegistryEntry; network: Network }) {
  const paymentInformation = usePaymentInformation(agent.agentIdentifier);
  // Without the live read (a burned asset, Blockfrost down), the entry's own copy of the
  // pricing is shown; only the seller wallet is missing then.
  const pricing: PricingFields = paymentInformation.data ?? agent;

  return (
    <DetailSection id="agent-pricing-heading" title="Pricing">
      {paymentInformation.isPending ? (
        <div role="status" className="grid gap-4 @xl:grid-cols-2">
          <span className="sr-only">Loading pricing…</span>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-56 max-w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {paymentInformation.isError && (
            <p role="status" className="rounded-md bg-muted px-3 py-2 text-xs">
              Live payment information is unavailable:{' '}
              {unavailableMessage(paymentInformation.error)} Showing the pricing stored with the
              registry entry.
            </p>
          )}
          <dl className="grid gap-4 @xl:grid-cols-2">
            <Field label="Payment type">{PAYMENT_TYPE_LABELS[pricing.paymentType]}</Field>
            <Field label="Price">
              <AgentPrice pricing={pricing} network={network} />
            </Field>
            {paymentInformation.data && (
              <div className="@xl:col-span-2">
                <Field label="Seller wallet">
                  <Mono>{paymentInformation.data.sellerWallet.address}</Mono>
                </Field>
              </div>
            )}
          </dl>
          {pricing.SupportedPaymentSources.length > 0 && (
            <PaymentSources sources={pricing.SupportedPaymentSources} />
          )}
        </div>
      )}
    </DetailSection>
  );
}
