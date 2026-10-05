import {
  $Enums,
  InboxAgentRegistrationStatus,
  PricingType,
} from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { prisma } from '@/utils/db';
import { z } from '@/utils/zod-openapi';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';
import { DEFAULTS } from '@/utils/config';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import { isV2Policy } from '@/utils/agent-version';
import {
  INBOX_REGISTRY_METADATA_TYPES,
  hasInboxAgentRegistrationContentChanged,
  nextInboxAgentRegistrationStatus,
  parseInboxAgentRegistrationMetadata,
} from './inbox-agent-registration';
import { web3CardanoMetadataSchema } from './web3-cardano-metadata';
import { syncWeb3CardanoV2RegistryEntry } from './sync-web3-cardano-v2';
import {
  markRegistryMetadataInvalid,
  registryEntryTypeFromOnChain,
  type SyncableRegistrySource,
} from './registry-sync-metadata';
import {
  getPolicyAssetQuantityChanges,
  getScriptsRedeemers,
  ScriptRedeemersResponse,
} from './registry-sync-blockfrost';

export { registryEntryTypeFromOnChain } from './registry-sync-metadata';
export { updateHealthCheck } from './registry-health-check-job';

const registryMetadataTypeSchema = z.object({
  type: z.string(),
});

function getRegistryMetadataType(metadata: unknown): string | undefined {
  const parsed = registryMetadataTypeSchema.safeParse(metadata);
  return parsed.success ? parsed.data.type : undefined;
}

async function getSyncableRegistrySources() {
  return prisma.registrySource.findMany({
    include: {
      RegistrySourceConfig: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

async function syncWeb3CardanoRegistryEntry(params: {
  source: SyncableRegistrySource;
  asset: string;
  onchainMetadata: unknown;
}): Promise<boolean> {
  const parsedMetadata = web3CardanoMetadataSchema.safeParse(
    params.onchainMetadata
  );

  if (!parsedMetadata.success) {
    logger.warn('Rejected invalid V1 registry metadata', {
      assetIdentifier: params.asset,
      validationIssues: parsedMetadata.error.issues,
    });
    await markRegistryMetadataInvalid({
      sourceId: params.source.id,
      assetIdentifier: params.asset,
    });
    return false;
  }

  const paymentType =
    parsedMetadata.data.agentPricing.pricingType == 'Free'
      ? $Enums.PaymentType.None
      : $Enums.PaymentType.Web3CardanoV1;

  // Standard entries advertise api_base_url; OpenApi/X402 entries advertise
  // openapi_spec_url / x402_resources_url instead. Health-check whichever URL the
  // entry carries (spec/manifest URLs return no agent identifier, so they get a
  // plain reachability status; only Standard runs identifier verification below).
  const endpoint = metadataStringConvert(
    parsedMetadata.data.api_base_url ??
      parsedMetadata.data.openapi_spec_url ??
      parsedMetadata.data.x402_resources_url
  )!;
  const isAvailable = await healthCheckService.checkAndVerifyEndpoint({
    api_url: endpoint,
  });
  const status =
    isAvailable.returnedAgentIdentifier != null
      ? isAvailable.returnedAgentIdentifier == params.asset
        ? isAvailable.status
        : $Enums.Status.Invalid
      : isAvailable.status;
  const capability_name = metadataStringConvert(
    parsedMetadata.data.capability?.name
  )!;
  const capability_version = metadataStringConvert(
    parsedMetadata.data.capability?.version
  )!;
  const sharedQuery = {
    status: status,
    name: metadataStringConvert(parsedMetadata.data.name)!,
    description: metadataStringConvert(parsedMetadata.data.description),
    type: registryEntryTypeFromOnChain(parsedMetadata.data.type),
    apiBaseUrl: metadataStringConvert(parsedMetadata.data.api_base_url) ?? null,
    openApiSpecUrl:
      metadataStringConvert(parsedMetadata.data.openapi_spec_url) ?? null,
    x402ResourcesUrl:
      metadataStringConvert(parsedMetadata.data.x402_resources_url) ?? null,
    authorName: metadataStringConvert(parsedMetadata.data.author?.name),
    authorOrganization: metadataStringConvert(
      parsedMetadata.data.author?.organization
    ),
    authorContactEmail: metadataStringConvert(
      parsedMetadata.data.author?.contact_email
    ),
    authorContactOther: metadataStringConvert(
      parsedMetadata.data.author?.contact_other
    ),
    image: metadataStringConvert(parsedMetadata.data.image)!,
    privacyPolicy: metadataStringConvert(
      parsedMetadata.data.legal?.privacy_policy
    ),
    termsAndCondition: metadataStringConvert(parsedMetadata.data.legal?.terms),
    otherLegal: metadataStringConvert(parsedMetadata.data.legal?.other),
    ExampleOutput:
      parsedMetadata.data.example_output &&
      parsedMetadata.data.example_output.length > 0
        ? {
            createMany: {
              data: parsedMetadata.data.example_output.map((example) => ({
                name: metadataStringConvert(example.name)!,
                mimeType: metadataStringConvert(example.mime_type)!,
                url: metadataStringConvert(example.url)!,
              })),
            },
          }
        : undefined,
    tags: parsedMetadata.data.tags,
    metadataVersion: DEFAULTS.METADATA_VERSION,
    AgentPricing: {
      create:
        parsedMetadata.data.agentPricing.pricingType === PricingType.Fixed
          ? {
              pricingType: PricingType.Fixed,
              FixedPricing: {
                create: {
                  Amounts: {
                    createMany: {
                      data: parsedMetadata.data.agentPricing.fixedPricing.map(
                        (price) => ({
                          amount: price.amount,
                          unit: metadataStringConvert(price.unit)!,
                        })
                      ),
                    },
                  },
                },
              },
            }
          : {
              pricingType: parsedMetadata.data.agentPricing.pricingType,
            },
    },
    assetIdentifier: params.asset,
    paymentType: paymentType,
    RegistrySource: { connect: { id: params.source.id } },
    Capability:
      capability_name == null || capability_version == null
        ? undefined
        : {
            connectOrCreate: {
              create: {
                name: capability_name,
                version: capability_version,
              },
              where: {
                name_version: {
                  name: capability_name,
                  version: capability_version,
                },
              },
            },
          },
  };

  const updateData = {
    ...sharedQuery,
    lastUptimeCheck: new Date(),
    uptimeCount: {
      increment: status == $Enums.Status.Online ? 1 : 0,
    },
    uptimeCheckCount: { increment: 1 },
  };

  const createData = {
    ...sharedQuery,
    lastUptimeCheck: new Date(),
    uptimeCount: status == $Enums.Status.Online ? 1 : 0,
    uptimeCheckCount: 1,
  };

  await prisma.registryEntry.upsert({
    where: { assetIdentifier: params.asset },
    update: updateData,
    create: createData,
  });

  return true;
}

async function syncInboxAgentRegistration(params: {
  source: SyncableRegistrySource;
  asset: string;
  onchainMetadata: unknown;
}): Promise<boolean> {
  const normalizedMetadata = parseInboxAgentRegistrationMetadata(
    params.onchainMetadata
  );

  if (!normalizedMetadata) {
    return false;
  }

  const existing = await prisma.inboxAgentRegistration.findUnique({
    where: {
      assetIdentifier: params.asset,
    },
  });

  const changed = existing
    ? hasInboxAgentRegistrationContentChanged(existing, normalizedMetadata)
    : true;
  const status = existing
    ? nextInboxAgentRegistrationStatus({
        currentStatus: existing.status,
        changed,
      })
    : InboxAgentRegistrationStatus.Pending;

  const sharedQuery = {
    name: normalizedMetadata.name,
    description: normalizedMetadata.description,
    agentSlug: normalizedMetadata.agentSlug,
    metadataVersion: normalizedMetadata.metadataVersion,
    registrySourceId: params.source.id,
  };

  await prisma.inboxAgentRegistration.upsert({
    where: { assetIdentifier: params.asset },
    update: {
      ...sharedQuery,
      status,
    },
    create: {
      ...sharedQuery,
      assetIdentifier: params.asset,
      status: InboxAgentRegistrationStatus.Pending,
    },
  });

  return true;
}

async function syncMintedAsset(params: {
  source: SyncableRegistrySource;
  asset: string;
  onchainMetadata: unknown;
}) {
  const metadataType = getRegistryMetadataType(params.onchainMetadata);

  if (
    metadataType != null &&
    INBOX_REGISTRY_METADATA_TYPES.includes(metadataType)
  ) {
    await syncInboxAgentRegistration(params);
    return;
  }

  if (isV2Policy(params.source.policyId)) {
    await syncWeb3CardanoV2RegistryEntry(params);
    return;
  }

  await syncWeb3CardanoRegistryEntry(params);
}

async function markAssetDeregistered(params: {
  source: SyncableRegistrySource;
  asset: string;
}) {
  await prisma.$transaction([
    prisma.registryEntry.updateMany({
      where: { assetIdentifier: params.asset },
      data: { status: $Enums.Status.Deregistered },
    }),
    prisma.inboxAgentRegistration.updateMany({
      where: { assetIdentifier: params.asset },
      data: {
        status: InboxAgentRegistrationStatus.Deregistered,
        linkedEmail: null,
        encryptionPublicKey: null,
        encryptionKeyVersion: null,
        signingPublicKey: null,
        signingKeyVersion: null,
      },
    }),
  ]);
}

const updateMutex = new Mutex();
export async function updateLatestCardanoRegistryEntries() {
  //we do not need any isolation level here as worst case we have a few duplicate checks in the next run but no data loss. Advantage we do not need to lock the table
  let sources = await getSyncableRegistrySources();

  if (sources.length == 0) return;

  let release: MutexInterface.Releaser | null;
  try {
    release = await tryAcquire(updateMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }
  //if we are already performing an update, we wait for it to finish and return

  // Everything after acquisition stays inside try so a failed query cannot
  // leave the mutex held and block all later runs.
  try {
    sources = await getSyncableRegistrySources();
    if (sources.length == 0) return;

    //sanity checks
    const invalidSourceIdentifiers = sources.filter((s) => s.policyId == null);
    if (invalidSourceIdentifiers.length > 0)
      //this should never happen unless the db is corrupted or someone played with the settings
      throw new Error('Invalid source identifiers');
    //iterate via promises to skip await time
    await Promise.all(
      sources.map(async (source) => {
        try {
          // Reuse cached BlockFrostAPI instance to prevent memory leaks
          const blockfrost = getBlockfrostInstance(
            source.network,
            source.RegistrySourceConfig.rpcProviderApiKey
          );
          const cursorTxHash = source.lastTxId;
          if (cursorTxHash == null) {
            logger.info(
              '***** No existing tx id found - Doing a full Sync.  *****'
            );
            logger.info(
              '***** To skip a full sync please import from a snapshot.  *****'
            );
          }
          let page = source.lastCheckedPage;

          let txs: ScriptRedeemersResponse = [];
          let transactionsOnPage = 0;
          do {
            txs = await getScriptsRedeemers(
              source.network,
              source.RegistrySourceConfig.rpcProviderApiKey,
              source.policyId,
              page
            );
            transactionsOnPage = txs.length;

            logger.info(`Found ${txs.length} transactions on page ${page}`, {
              cursorTxId: cursorTxHash,
            });
            const existingTx = txs.findIndex(
              (tx) => tx.tx_hash === cursorTxHash
            );
            if (existingTx != -1) {
              txs = txs.slice(existingTx + 1);
            }

            logger.info(
              `Processing page ${page} with ${txs.length} transactions`
            );

            let count = 0;
            for (const tx of txs) {
              count++;
              if (count % 10 == 0) {
                logger.info(
                  `**** Processed ${count}/${txs.length} transactions from page ${page} ****`
                );
              }
              if (tx.purpose != 'mint') {
                continue;
              }
              const txsUtxos = await blockfrost.txsUtxos(tx.tx_hash);
              const mintedOrBurnedAssetsOfPolicy =
                getPolicyAssetQuantityChanges(txsUtxos, source.policyId);
              for (const [
                asset,
                quantity,
              ] of mintedOrBurnedAssetsOfPolicy.entries()) {
                if (quantity > 0) {
                  //mint
                  let registryData = undefined;
                  try {
                    registryData = await blockfrost.assetsById(asset);
                  } catch (error) {
                    logger.error('Error getting registry data', {
                      error: error,
                      asset: asset,
                    });
                    continue;
                  }

                  await syncMintedAsset({
                    source,
                    asset,
                    onchainMetadata: registryData.onchain_metadata,
                  });
                }

                if (quantity < 0) {
                  //burn
                  await markAssetDeregistered({
                    source,
                    asset,
                  });
                }
              }
              await prisma.registrySource.update({
                where: { id: source.id },
                data: { lastCheckedPage: page, lastTxId: tx.tx_hash },
              });
            }
            page = page + 1;
          } while (transactionsOnPage > 0);
        } catch (error) {
          logger.error('Error updating cardano registry entries', {
            error: error,
            sourceId: source.id,
          });
        }
      })
    );
  } finally {
    release();
  }
}

export const cardanoRegistryService = {
  updateLatestCardanoRegistryEntries,
};
