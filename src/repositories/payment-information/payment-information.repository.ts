import { prisma } from '@/utils/db';

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

  return registryEntry;
}

export const paymentInformationRepository = { getPaymentInformation };
