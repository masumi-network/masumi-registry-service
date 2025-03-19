import { $Enums, Network, PrismaClient, RPCProvider } from '@prisma/client';
import dotenv from 'dotenv';
import { DEFAULTS } from '../src/utils/config';
dotenv.config();
const prisma = new PrismaClient();
export const seed = async (prisma: PrismaClient) => {
  const adminKey = process.env.Admin_KEY;
  if (adminKey != null) {
    if (adminKey.length < 15) throw Error('API-KEY is insecure');
    console.log('Admin_KEY is seeded');
    await prisma.apiKey.upsert({
      create: { token: adminKey, permission: 'Admin', status: 'Active' },
      update: { token: adminKey, permission: 'Admin', status: 'Active' },
      where: { token: adminKey },
    });

  } else {
    console.log('Admin_KEY is seeded');
  }

  const registryPolicyPreprod = DEFAULTS.REGISTRY_POLICY_ID_Preprod;
  if (process.env.Blockfrost_API_KEY_Preprod != null) {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Preprod is seeded');
    await prisma.registrySource.upsert({
      create: {
        type: $Enums.RegistryEntryType.Web3CardanoV1,
        network: Network.Preprod,
        note: 'Created via seeding',
        policyId: registryPolicyPreprod,
        RegistrySourceConfig: {
          create: {
            rpcProvider: RPCProvider.Blockfrost,
            rpcProviderApiKey: process.env.Blockfrost_API_KEY_Preprod,
          },
        },
      },
      update: {},
      where: {
        type_policyId: {
          type: $Enums.RegistryEntryType.Web3CardanoV1,
          policyId: registryPolicyPreprod,
        },
      },
    });
  } else {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Preprod is not seeded');
  }

  const registrySourcePolicyMainnet = DEFAULTS.REGISTRY_POLICY_ID_Mainnet;
  if (process.env.Blockfrost_API_KEY_Mainnet != null) {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Mainnet is seeded');
    await prisma.registrySource.upsert({
      create: {
        type: $Enums.RegistryEntryType.Web3CardanoV1,
        network: Network.Mainnet,
        note: 'Created via seeding',
        policyId: registrySourcePolicyMainnet,
        RegistrySourceConfig: {
          create: {
            rpcProvider: RPCProvider.Blockfrost,
            rpcProviderApiKey: process.env.Blockfrost_API_KEY_Mainnet,
          },
        },
      },
      update: {},
      where: {
        type_policyId: {
          type: $Enums.RegistryEntryType.Web3CardanoV1,
          policyId: registrySourcePolicyMainnet,
        },
      },
    });
  } else {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Mainnet is not seeded');
  }
};
seed(prisma)
  .then(() => {
    prisma.$disconnect();
    console.log('Seed completed');
  })
  .catch((e) => {
    prisma.$disconnect();
    console.error(e);
  });
