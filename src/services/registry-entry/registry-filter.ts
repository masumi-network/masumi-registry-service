import { $Enums, Prisma, Status } from '@prisma/client';
import { z } from '@/utils/zod-openapi';
import { queryRegistrySchemaInput } from '@/routes/api/registry-entry/schemas';

type RegistryEntryFilter = z.infer<typeof queryRegistrySchemaInput>['filter'];
type PricingFilter = NonNullable<RegistryEntryFilter>['pricing'];

// Without any status filter only Online entries are returned (legacy default).
// excludeStatus alone widens the base to every status except the excluded ones.
export function resolveAllowedStatuses(filter: RegistryEntryFilter): Status[] {
  const excluded = new Set(filter?.excludeStatus ?? []);
  const base =
    filter?.status && filter.status.length > 0
      ? filter.status
      : excluded.size > 0
        ? Object.values(Status)
        : [Status.Online];
  const onlyOnline = filter?.health?.onlyOnline === true;
  return base.filter(
    (status) =>
      !excluded.has(status) && (!onlyOnline || status === Status.Online)
  );
}

function buildPricingWhere(
  pricing: PricingFilter
): Prisma.AgentPricingWhereInput | undefined {
  if (pricing == null) return undefined;
  if (pricing.unit == null) {
    return pricing.pricingType == null
      ? undefined
      : { pricingType: pricing.pricingType };
  }
  // unit and amount range must hold for the same price row.
  return {
    pricingType: $Enums.PricingType.Fixed,
    FixedPricing: {
      Amounts: {
        some: {
          unit: pricing.unit,
          amount: {
            gte:
              pricing.minAmount != null ? BigInt(pricing.minAmount) : undefined,
            lte:
              pricing.maxAmount != null ? BigInt(pricing.maxAmount) : undefined,
          },
        },
      },
    },
  };
}

// Translates the API filter DTO into a Prisma where. All filters AND-combine.
export function buildRegistryEntryWhere(params: {
  filter: RegistryEntryFilter;
  network: $Enums.Network;
  assetIdentifier: string | undefined;
  searchQuery: string | undefined;
}): Prisma.RegistryEntryWhereInput {
  const { filter } = params;
  const pricingWhere = buildPricingWhere(filter?.pricing);
  const hasRegisteredRange =
    filter?.registeredAfter != null || filter?.registeredBefore != null;

  return {
    Capability: filter?.capability
      ? { name: filter.capability.name, version: filter.capability.version }
      : undefined,
    paymentType:
      filter?.paymentTypes && filter.paymentTypes.length > 0
        ? { in: filter.paymentTypes }
        : undefined,
    status: { in: resolveAllowedStatuses(filter) },
    assetIdentifier: params.assetIdentifier,
    RegistrySource: {
      policyId: filter?.policyId,
      network: params.network,
    },
    tags: filter?.tags ? { hasSome: filter.tags } : undefined,
    searchText: params.searchQuery
      ? { contains: params.searchQuery }
      : undefined,
    createdAt: hasRegisteredRange
      ? { gte: filter?.registeredAfter, lte: filter?.registeredBefore }
      : undefined,
    // V1 entries carry pricing on the entry, V2 entries per payment source.
    OR: pricingWhere
      ? [
          { AgentPricing: pricingWhere },
          { SupportedPaymentSources: { some: { Pricing: pricingWhere } } },
        ]
      : undefined,
  };
}

// Prisma cannot compare a ratio of two columns, so the uptime filter runs in
// memory on each fetched page, before the live health check.
export function meetsMinUptimePercent(
  entry: { uptimeCount: number; uptimeCheckCount: number },
  minUptimePercent: number | undefined
): boolean {
  if (minUptimePercent == null) return true;
  if (entry.uptimeCheckCount === 0) return false;
  return entry.uptimeCount * 100 >= minUptimePercent * entry.uptimeCheckCount;
}
