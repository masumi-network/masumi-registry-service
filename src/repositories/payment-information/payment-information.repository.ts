import { updateCardanoAssets } from '@/services/cardano-registry/cardano-registry.service';
import { prisma } from '@/utils/db';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';

async function getPaymentInformation(currentAgentIdentifier: string) {
  const registrySource = await prisma.registrySource.findFirst({
    where: {
      policyId: currentAgentIdentifier.substring(0, 56),
    },
    include: {
      RegistrySourceConfig: true,
    },
  });

  if (
    !registrySource ||
    !registrySource.RegistrySourceConfig.rpcProviderApiKey ||
    !registrySource.policyId
  ) {
    return null;
  }

  const registryEntry = await prisma.registryEntry.findUnique({
    where: {
      assetIdentifier: currentAgentIdentifier,
    },
    include: {
      AgentPricing: {
        include: { FixedPricing: { include: { Amounts: true } } },
      },
      Capability: true,
      ExampleOutput: true,
      RegistrySource: {
        include: {
          RegistrySourceConfig: true,
        },
      },
    },
  });

  if (!registryEntry) {
    return null;
  }

  const blockfrost = new BlockFrostAPI({
    projectId: registrySource.RegistrySourceConfig.rpcProviderApiKey,
  });
  const asset = await blockfrost.assetsById(currentAgentIdentifier);
  if (!asset) {
    return null;
  }
  const updatedTMP = await updateCardanoAssets(
    [{ asset: currentAgentIdentifier, quantity: asset.quantity }],
    registrySource
  );

  if (updatedTMP.length != 1) {
    return null;
  }

  return updatedTMP[0];
}

export const paymentInformationRepository = { getPaymentInformation };
