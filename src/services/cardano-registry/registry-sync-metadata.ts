import { $Enums } from '@prisma/client';
import { prisma } from '@/utils/db';

export type SyncableRegistrySource = {
  id: string;
  policyId: string;
  network: $Enums.Network;
  lastTxId: string | null;
  lastCheckedPage: number;
  RegistrySourceConfig: {
    rpcProviderApiKey: string;
  };
};

export async function markRegistryMetadataInvalid(params: {
  sourceId: string;
  assetIdentifier: string;
}): Promise<void> {
  await prisma.registryEntry.updateMany({
    where: {
      registrySourceId: params.sourceId,
      assetIdentifier: params.assetIdentifier,
    },
    data: {
      status: $Enums.Status.Invalid,
      statusUpdatedAt: new Date(),
    },
  });
}

// On-chain registry `type` string -> RegistryEntryType. Absent/unrecognised ->
// Standard so legacy/untyped entries (and any newer type an older indexer does
// not know) degrade to the base standard shape instead of being dropped. Kept in
// sync with payment-core's registryEntryTypeFromOnChain / the inbox types are
// handled separately by getRegistryMetadataType before this is reached.
export function registryEntryTypeFromOnChain(
  onChainType: string | string[] | undefined
): $Enums.RegistryEntryType {
  const value = Array.isArray(onChainType) ? onChainType.join('') : onChainType;
  if (value === 'OpenAPI') return $Enums.RegistryEntryType.OpenApi;
  if (value === 'x402V1') return $Enums.RegistryEntryType.X402;
  if (value === 'a2aV1') return $Enums.RegistryEntryType.A2A;
  return $Enums.RegistryEntryType.Standard;
}
