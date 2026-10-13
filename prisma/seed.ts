import { Network, PrismaClient, RPCProvider } from '@prisma/client';
import dotenv from 'dotenv';
import { DEFAULTS } from '../src/utils/config';
import { hashToken } from '../src/utils/crypto';
import { importSnapshotsForConfiguredSources } from '../src/utils/snapshot';
import { prisma, cleanupDB } from '../src/utils/db';
dotenv.config();

// Provision the V2 registry source for a network, reusing an existing V1
// source's RegistrySourceConfig (Blockfrost token) and url. Idempotent via the
// @@unique([network, policyId]) upsert, matching the provision_v2_registry_sources
// migration so both a migrated and a freshly seeded DB end up with the V2 source.
const upsertV2RegistrySource = async (
  prisma: PrismaClient,
  network: Network,
  policyIdV2: string,
  v1Source: { url: string | null; registrySourceConfigId: string }
) => {
  console.log(`V2 registry source for ${network} is seeded`);
  await prisma.registrySource.upsert({
    create: {
      network,
      url: v1Source.url,
      note: 'Auto-provisioned V2 registry source (migrated from the V1 source)',
      policyId: policyIdV2,
      lastCheckedPage: 1,
      RegistrySourceConfig: {
        connect: { id: v1Source.registrySourceConfigId },
      },
    },
    update: {},
    where: {
      network_policyId: {
        network,
        policyId: policyIdV2,
      },
    },
  });
};

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
    const adminKeyHash = hashToken(adminKey);
    console.log('Admin_KEY is seeded');
    await prisma.apiKey.upsert({
      create: {
        permission: 'Admin',
        status: 'Active',
        tokenHash: adminKeyHash,
      },
      update: {
        permission: 'Admin',
        status: 'Active',
        tokenHash: adminKeyHash,
      },
      where: { tokenHash: adminKeyHash },
    });
  } else {
    console.log('Admin_KEY is seeded');
  }

  const registryPolicyPreprod = DEFAULTS.REGISTRY_POLICY_ID_PREPROD;
  if (process.env.BLOCKFROST_API_KEY_PREPROD != null) {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Preprod is seeded');
    const v1Preprod = await prisma.registrySource.upsert({
      create: {
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
        network_policyId: {
          network: Network.Preprod,
          policyId: registryPolicyPreprod,
        },
      },
    });
    // Auto-provision the matching V2 registry source, reusing the V1 source's
    // config (Blockfrost token) and url. Mirrors the provision_v2_registry_sources
    // migration so a freshly seeded DB already has the V2 source.
    await upsertV2RegistrySource(
      prisma,
      Network.Preprod,
      DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2,
      v1Preprod
    );
  } else {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Preprod is not seeded');
  }

  const registrySourcePolicyMainnet = DEFAULTS.REGISTRY_POLICY_ID_MAINNET;
  if (process.env.BLOCKFROST_API_KEY_MAINNET != null) {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Mainnet is seeded');
    const v1Mainnet = await prisma.registrySource.upsert({
      create: {
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
        network_policyId: {
          network: Network.Mainnet,
          policyId: registrySourcePolicyMainnet,
        },
      },
    });
    // Auto-provision the matching V2 registry source, reusing the V1 source's
    // config (Blockfrost token) and url. Mirrors the provision_v2_registry_sources
    // migration so a freshly seeded DB already has the V2 source.
    await upsertV2RegistrySource(
      prisma,
      Network.Mainnet,
      DEFAULTS.REGISTRY_POLICY_ID_MAINNET_V2,
      v1Mainnet
    );
  } else {
    console.log('REGISTRY_SOURCE_IDENTIFIER_CARDANO_Mainnet is not seeded');
  }

  console.log('Attempting snapshot auto-import...');
  const importResults =
    await importSnapshotsForConfiguredSources('./snapshots');
  for (const result of importResults) {
    if (result.success) {
      console.log(`Snapshot auto-import: imported ${result.imported} entries`);
    } else if (result.skipped) {
      console.log(`Snapshot auto-import skipped: ${result.reason}`);
    } else {
      console.log(`Snapshot auto-import failed: ${result.reason}`);
    }
  }
};
seed(prisma)
  .then(() => {
    cleanupDB();
    console.log('Seed completed');
  })
  .catch((e) => {
    cleanupDB();
    console.error(e);
  });
