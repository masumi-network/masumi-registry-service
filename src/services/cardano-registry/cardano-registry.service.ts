import { $Enums, PricingType } from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { prisma } from '@/utils/db';
import { z } from '@/utils/zod-openapi';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { DEFAULTS } from '@/utils/config';

// Cache BlockFrostAPI instances to prevent memory leaks from repeated instantiation
// Key format: `${network}-${apiKey}`
const blockfrostInstanceCache = new Map<string, BlockFrostAPI>();

function getBlockfrostInstance(
  network: $Enums.Network,
  apiKey: string
): BlockFrostAPI {
  const cacheKey = `${network}-${apiKey}`;
  let instance = blockfrostInstanceCache.get(cacheKey);

  if (!instance) {
    instance = new BlockFrostAPI({
      projectId: apiKey,
      network: network === $Enums.Network.Mainnet ? 'mainnet' : 'preprod',
    });
    blockfrostInstanceCache.set(cacheKey, instance);
    logger.info('Created new BlockFrostAPI instance', { network, cacheKey });
  }

  return instance;
}

const metadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  description: z.string().or(z.array(z.string())).optional(),
  api_base_url: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  example_output: z
    .array(
      z.object({
        name: z
          .string()
          .max(60)
          .or(z.array(z.string().max(60)).min(1).max(1)),
        mime_type: z
          .string()
          .min(1)
          .max(60)
          .or(z.array(z.string().min(1).max(60)).min(1).max(1)),
        url: z.string().or(z.array(z.string())),
      })
    )
    .optional(),
  capability: z
    .object({
      name: z.string().or(z.array(z.string())),
      version: z
        .string()
        .max(60)
        .or(z.array(z.string().max(60)).min(1).max(1)),
    })
    .optional(),
  author: z.object({
    name: z
      .string()
      .min(1)
      .or(z.array(z.string().min(1))),
    contact_email: z.string().or(z.array(z.string())).optional(),
    contact_other: z.string().or(z.array(z.string())).optional(),
    organization: z.string().or(z.array(z.string())).optional(),
  }),
  legal: z
    .object({
      privacy_policy: z.string().or(z.array(z.string())).optional(),
      terms: z.string().or(z.array(z.string())).optional(),
      other: z.string().or(z.array(z.string())).optional(),
    })
    .optional(),
  tags: z.array(z.string().min(1)).min(1),
  agentPricing: z
    .object({
      pricingType: z.enum([PricingType.Fixed]),
      fixedPricing: z
        .array(
          z.object({
            amount: z.number({ coerce: true }).int().min(1),
            unit: z
              .string()
              .min(1)
              .or(z.array(z.string().min(1))),
          })
        )
        .min(1)
        .max(25),
    })
    .or(
      z.object({
        pricingType: z.enum([PricingType.Free]),
      })
    ),
  image: z.string().or(z.array(z.string())),
  metadata_version: z.number({ coerce: true }).int().min(1).max(1),
});

const healthMutex = new Mutex();
export async function updateHealthCheck(onlyEntriesAfter?: Date | undefined) {
  logger.info('Updating cardano registry entries health check: ', {
    onlyEntriesAfter: onlyEntriesAfter,
  });
  if (onlyEntriesAfter == undefined) {
    onlyEntriesAfter = new Date();
  }

  //we do not need any isolation level here as worst case we have a few duplicate checks in the next run but no data loss. Advantage we do not need to lock the table
  const sourcesCount = await prisma.registrySource.aggregate({
    where: {
      type: $Enums.RegistryEntryType.Web3CardanoV1,
    },
    _count: true,
  });

  if (sourcesCount._count == 0) return;

  let release: MutexInterface.Releaser | null;
  try {
    release = await tryAcquire(healthMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }
  //if we are already performing an update, we wait for it to finish and return

  const sources = await prisma.registrySource.findMany({
    where: {
      type: $Enums.RegistryEntryType.Web3CardanoV1,
    },
    include: {
      RegistrySourceConfig: true,
    },
  });
  if (sources.length == 0) {
    logger.info('No registry sources found, skipping health check');
    release();
    return;
  }

  try {
    logger.info('updating entries from sources', { count: sources.length });
    await Promise.allSettled(
      sources.map(async (source) => {
        const entries = await prisma.registryEntry.findMany({
          where: {
            registrySourceId: source.id,
            status: {
              in: [$Enums.Status.Online, $Enums.Status.Offline],
            },
            lastUptimeCheck: {
              lte: onlyEntriesAfter,
            },
          },
          orderBy: { lastUptimeCheck: 'asc' },
          take: 50,
          include: {
            RegistrySource: true,
            Capability: true,
            AgentPricing: {
              include: {
                FixedPricing: {
                  include: { Amounts: true },
                },
              },
            },
          },
        });
        logger.info(
          `Found ${entries.length} registry entries in status online or offline`
        );
        const invalidEntries = await prisma.registryEntry.findMany({
          where: {
            registrySourceId: source.id,
            status: {
              in: [$Enums.Status.Invalid],
            },
            lastUptimeCheck: {
              lte: onlyEntriesAfter,
            },
            uptimeCheckCount: {
              lte: 20,
            },
          },
          orderBy: { updatedAt: 'asc' },
          take: 50,
          include: {
            RegistrySource: true,
            Capability: true,
            AgentPricing: {
              include: {
                FixedPricing: {
                  include: { Amounts: true },
                },
              },
            },
          },
        });
        logger.info(
          `Found ${invalidEntries.length} registry entries in status invalid`
        );
        const filteredOutInvalidStaggeredEntries = invalidEntries.filter(
          (e) => {
            const retries = Math.max(0.2, e.uptimeCheckCount - e.uptimeCount);
            const staggeredWaitTime = Math.min(
              1000 * 60 * 10 * retries,
              1000 * 60 * 60 * 48
            );
            return (
              e.lastUptimeCheck.getTime() + staggeredWaitTime <
              onlyEntriesAfter.getTime()
            );
          }
        );
        const excludedEntries = invalidEntries.filter(
          (e) =>
            filteredOutInvalidStaggeredEntries.find((e2) => e2.id === e.id) !=
            null
        );
        logger.info(
          `Filtered out ${filteredOutInvalidStaggeredEntries.length} invalid staggered entries`
        );
        await Promise.allSettled(
          excludedEntries.map(async (e) => {
            await prisma.registryEntry.update({
              where: { id: e.id },
              data: {
                updatedAt: new Date(),
              },
            });
          })
        );
        const invalidBatch = filteredOutInvalidStaggeredEntries.slice(
          0,
          Math.min(10, filteredOutInvalidStaggeredEntries.length)
        );
        const combinedEntries = [...entries, ...invalidBatch];
        logger.info(
          `Checking and updating ${combinedEntries.length} registry entries`
        );
        await healthCheckService.checkVerifyAndUpdateRegistryEntries({
          registryEntries: combinedEntries,
          minHealthCheckDate: onlyEntriesAfter,
        });
      })
    );
  } finally {
    release();
  }
}
type ScriptRedeemer = {
  tx_hash: string;
  tx_index: number;
  purpose: 'spend' | 'mint' | 'cert' | 'reward';
  redeemer_data_hash: string;
  datum_hash: string;
  unit_mem: string;
  unit_steps: string;
  fee: string;
};
type ScriptRedeemersResponse = ScriptRedeemer[];

async function getScriptsRedeemers(
  network: $Enums.Network,
  blockfrostToken: string,
  policyId: string,
  page: number
) {
  const result = await fetch(
    `https://cardano-${network == $Enums.Network.Mainnet ? 'mainnet' : 'preprod'}.blockfrost.io/api/v0/scripts/${policyId}/redeemers?count=100&page=${page}&order=asc`,
    {
      headers: {
        project_id: blockfrostToken,
      },
    }
  );
  if (!result.ok) {
    throw new Error('Failed to get scripts redeemers');
  }
  const json = await result.json();
  const data = json as ScriptRedeemersResponse;
  return data;
}

const updateMutex = new Mutex();
export async function updateLatestCardanoRegistryEntries() {
  //we do not need any isolation level here as worst case we have a few duplicate checks in the next run but no data loss. Advantage we do not need to lock the table
  let sources = await prisma.registrySource.findMany({
    where: {
      type: $Enums.RegistryEntryType.Web3CardanoV1,
    },
    include: {
      RegistrySourceConfig: true,
    },
  });

  if (sources.length == 0) return;

  let release: MutexInterface.Releaser | null;
  try {
    release = await tryAcquire(updateMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }
  //if we are already performing an update, we wait for it to finish and return

  sources = await prisma.registrySource.findMany({
    where: {
      type: $Enums.RegistryEntryType.Web3CardanoV1,
    },
    include: {
      RegistrySourceConfig: true,
    },
  });
  if (sources.length == 0) {
    release();
    return;
  }

  try {
    //sanity checks
    const invalidSourcesTypes = sources.filter(
      (s) => s.type !== $Enums.RegistryEntryType.Web3CardanoV1
    );
    if (invalidSourcesTypes.length > 0) throw new Error('Invalid source types');
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
                  `**** Processed ${count} transactions from page ${page} ****`
                );
              }
              if (tx.purpose != 'mint') {
                continue;
              }
              const txsUtxos = await blockfrost.txsUtxos(tx.tx_hash);
              const mintedOrBurnedAssetsOfPolicy = new Map<string, number>();
              for (const inputUtxo of txsUtxos.inputs) {
                for (const asset of inputUtxo.amount) {
                  if (asset.unit.startsWith(source.policyId)) {
                    mintedOrBurnedAssetsOfPolicy.set(
                      asset.unit,
                      -parseInt(asset.quantity)
                    );
                  }
                }
              }
              for (const outputUtxo of txsUtxos.outputs) {
                for (const asset of outputUtxo.amount) {
                  if (asset.unit.startsWith(source.policyId)) {
                    if (mintedOrBurnedAssetsOfPolicy.has(asset.unit)) {
                      mintedOrBurnedAssetsOfPolicy.set(
                        asset.unit,
                        mintedOrBurnedAssetsOfPolicy.get(asset.unit)! +
                          parseInt(asset.quantity)
                      );
                    } else {
                      mintedOrBurnedAssetsOfPolicy.set(
                        asset.unit,
                        parseInt(asset.quantity)
                      );
                    }
                  }
                }
              }
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

                  const onchainMetadata = registryData.onchain_metadata;
                  const parsedMetadata =
                    metadataSchema.safeParse(onchainMetadata);

                  //if the metadata is not valid or the token has no holder -> is burned, we skip it
                  if (!parsedMetadata.success) {
                    continue;
                  }
                  const paymentType =
                    parsedMetadata.data.agentPricing.pricingType == 'Free'
                      ? $Enums.PaymentType.None
                      : $Enums.PaymentType.Web3CardanoV1;

                  //check endpoint
                  const endpoint = metadataStringConvert(
                    parsedMetadata.data.api_base_url
                  )!;
                  const isAvailable =
                    await healthCheckService.checkAndVerifyEndpoint({
                      api_url: endpoint,
                    });
                  const status =
                    isAvailable.returnedAgentIdentifier != null
                      ? isAvailable.returnedAgentIdentifier == asset
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
                    description: metadataStringConvert(
                      parsedMetadata.data.description
                    ),
                    apiBaseUrl: metadataStringConvert(
                      parsedMetadata.data.api_base_url
                    )!,
                    authorName: metadataStringConvert(
                      parsedMetadata.data.author?.name
                    ),
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
                    termsAndCondition: metadataStringConvert(
                      parsedMetadata.data.legal?.terms
                    ),
                    otherLegal: metadataStringConvert(
                      parsedMetadata.data.legal?.other
                    ),
                    ExampleOutput:
                      parsedMetadata.data.example_output &&
                      parsedMetadata.data.example_output.length > 0
                        ? {
                            createMany: {
                              data: parsedMetadata.data.example_output.map(
                                (example) => ({
                                  name: metadataStringConvert(example.name)!,
                                  mimeType: metadataStringConvert(
                                    example.mime_type
                                  )!,
                                  url: metadataStringConvert(example.url)!,
                                })
                              ),
                            },
                          }
                        : undefined,
                    tags: parsedMetadata.data.tags,
                    metadataVersion: DEFAULTS.METADATA_VERSION,
                    AgentPricing: {
                      create:
                        parsedMetadata.data.agentPricing.pricingType == 'Free'
                          ? {
                              pricingType: PricingType.Free,
                            }
                          : {
                              pricingType: PricingType.Fixed,
                              FixedPricing: {
                                create: {
                                  Amounts: {
                                    createMany: {
                                      data: parsedMetadata.data.agentPricing.fixedPricing.map(
                                        (price) => ({
                                          amount: price.amount,
                                          unit: metadataStringConvert(
                                            price.unit
                                          )!,
                                        })
                                      ),
                                    },
                                  },
                                },
                              },
                            },
                    },
                    assetIdentifier: asset,
                    paymentType: paymentType,
                    RegistrySource: { connect: { id: source.id } },
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
                    where: { assetIdentifier: asset },
                    update: updateData,
                    create: createData,
                  });
                }

                if (quantity < 0) {
                  //burn
                  await prisma.$transaction(async (tx) => {
                    const existingEntry = await tx.registryEntry.findUnique({
                      where: { assetIdentifier: asset },
                    });
                    if (existingEntry) {
                      await tx.registryEntry.update({
                        where: { assetIdentifier: asset },
                        data: { status: $Enums.Status.Deregistered },
                      });
                    }
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
