import { $Enums, Network, PrismaClient, RPCProvider } from '@prisma/client';
import dotenv from 'dotenv';
import { DEFAULTS } from '../src/utils/config';
import { hashToken } from '../src/utils/crypto';
dotenv.config();
const prisma = new PrismaClient();
export const seed = async (prisma: PrismaClient) => {
  const seedOnlyIfEmpty = process.env.SEED_ONLY_IF_EMPTY;
  if (seedOnlyIfEmpty?.toLowerCase() === 'true') {
    const adminKey = await prisma.apiKey.findFirst({});
    if (adminKey) {
      console.log('Already seeded, skipping');
      return;
    }
  }
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey != null) {
    if (adminKey.length < 15) throw Error('API-KEY is insecure');
    console.log('Admin_KEY is seeded');
    await prisma.apiKey.upsert({
      create: {
        token: adminKey,
        permission: 'Admin',
        status: 'Active',
        tokenHash: hashToken(adminKey),
      },
      update: {
        token: adminKey,
        permission: 'Admin',
        status: 'Active',
        tokenHash: hashToken(adminKey),
      },
      where: { token: adminKey },
    });
  } else {
    console.log('Admin_KEY is seeded');
  }

  const registryPolicyPreprod = DEFAULTS.REGISTRY_POLICY_ID_PREPROD;
  if (process.env.BLOCKFROST_API_KEY_PREPROD != null) {
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
            rpcProviderApiKey: process.env.BLOCKFROST_API_KEY_PREPROD,
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

  const registrySourcePolicyMainnet = DEFAULTS.REGISTRY_POLICY_ID_MAINNET;
  if (process.env.BLOCKFROST_API_KEY_MAINNET != null) {
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
            rpcProviderApiKey: process.env.BLOCKFROST_API_KEY_MAINNET,
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
