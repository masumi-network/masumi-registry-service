import { prisma } from '@/utils/db';
import { $Enums } from '@prisma/client';

// More than any one address plausibly registers; bounds the join.
const MAX_REGISTERED_ENTRIES = 20;

// X402 entries that sell to this address on an EVM payment source. `payTo` is
// stored lowercase. The cached manifest is selected to tell which resources an
// entry already lists.
async function findRegisteredByPayTo(payTo: string) {
  return prisma.registryEntry.findMany({
    where: {
      type: $Enums.RegistryEntryType.X402,
      status: { not: $Enums.Status.Deregistered },
      SupportedPaymentSources: { some: { chain: 'EVM', payTo } },
    },
    select: {
      assetIdentifier: true,
      status: true,
      spec: true,
      RegistrySource: { select: { network: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_REGISTERED_ENTRIES,
  });
}

export const x402DiscoveryRepository = { findRegisteredByPayTo };
