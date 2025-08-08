import { $Enums, PricingType } from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { prisma } from '@/utils/db';
import { z } from 'zod';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { resolvePaymentKeyHash } from '@meshsdk/core';
import cuid2 from '@paralleldrive/cuid2';
import { DEFAULTS } from '@/utils/config';

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
        pricingType: z.enum([PricingType.None]),
      })
    ),
  image: z.string().or(z.array(z.string())),
  metadata_version: z.number({ coerce: true }).int().min(1).max(1),
});

const deleteMutex = new Mutex();

export async function updateDeregisteredCardanoRegistryEntries() {
  const sources = await prisma.registrySource.findMany({
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
    release = await tryAcquire(deleteMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }

  await Promise.allSettled(
    sources.map(async (source) => {
      try {
        const blockfrost = new BlockFrostAPI({
          projectId: source.RegistrySourceConfig.rpcProviderApiKey!,
          network:
            source.network == $Enums.Network.Mainnet ? 'mainnet' : 'preprod',
        });
        let cursorId = null;
        let latestAssets = await prisma.registryEntry.findMany({
          where: {
            status: { in: [$Enums.Status.Online, $Enums.Status.Offline] },
            registrySourceId: source.id,
          },
          orderBy: { lastUptimeCheck: 'desc' },
          take: 50,
          cursor: cursorId != null ? { id: cursorId } : undefined,
        });

        while (latestAssets.length != 0) {
          const assetsToProcess = await Promise.all(
            latestAssets.map(async (asset) => {
              return await blockfrost.assetsById(asset.assetIdentifier);
            })
          );

          const burnedAssets = assetsToProcess.filter((a) => a.quantity == '0');

          await Promise.all(
            burnedAssets.map(async (asset) => {
              await prisma.registryEntry.update({
                where: {
                  assetIdentifier: asset.asset,
                },
                data: { status: $Enums.Status.Deregistered },
              });
            })
          );

          if (latestAssets.length < 50) break;

          cursorId = latestAssets[latestAssets.length - 1].id;
          latestAssets = await prisma.registryEntry.findMany({
            where: {
              status: { in: [$Enums.Status.Online, $Enums.Status.Offline] },
              registrySourceId: source.id,
            },
            orderBy: { lastUptimeCheck: 'desc' },
            take: 50,
            cursor: cursorId != null ? { id: cursorId } : undefined,
          });
        }
        if (latestAssets.length == 0) return;
      } catch (error) {
        logger.error('Error updating deregistered cardano registry entries', {
          error: error,
          sourceId: source.id,
        });
      }
      return null;
    })
  );
  release();
}
const healthMutex = new Mutex();
export async function updateHealthCheck(onlyEntriesAfter?: Date | undefined) {
  logger.info('Updating cardano registry entries health check: ', {
    onlyEntriesAfter: onlyEntriesAfter,
  });
  if (onlyEntriesAfter == undefined) {
    onlyEntriesAfter = new Date();
  }

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
    release = await tryAcquire(healthMutex).acquire();
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
        const filteredOutInvalidStaggeredEntries = invalidEntries.filter(
          (e) => {
            if (e.status !== $Enums.Status.Invalid) return true;
            const retries = e.uptimeCheckCount;
            const staggeredWaitTime = 1000 * 60 * 10 * retries;
            return (
              e.lastUptimeCheck.getTime() + staggeredWaitTime <
              onlyEntriesAfter.getTime()
            );
          }
        );
        const excludedEntries = invalidEntries.filter(
          (e) => !filteredOutInvalidStaggeredEntries.includes(e)
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

const updateMutex = new Mutex();
export async function updateLatestCardanoRegistryEntries(
  onlyEntriesAfter?: Date | undefined
) {
  logger.info('Updating cardano registry entries after: ', {
    onlyEntriesAfter: onlyEntriesAfter,
  });
  if (onlyEntriesAfter == undefined) return;

  //we do not need any isolation level here as worst case we have a few duplicate checks in the next run but no data loss. Advantage we do not need to lock the table
  let sources = await prisma.registrySource.findMany({
    where: {
      type: $Enums.RegistryEntryType.Web3CardanoV1,
      updatedAt: {
        lte: onlyEntriesAfter,
      },
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
      updatedAt: {
        lte: onlyEntriesAfter,
      },
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

    //the return variable, note that the order of the entries is not guaranteed
    const latestEntries = [];
    //iterate via promises to skip await time
    await Promise.all(
      sources.map(async (source) => {
        try {
          const blockfrost = new BlockFrostAPI({
            projectId: source.RegistrySourceConfig.rpcProviderApiKey!,
            network:
              source.network == $Enums.Network.Mainnet ? 'mainnet' : 'preprod',
          });
          let pageOffset = source.latestPage;
          let latestIdentifier = source.latestIdentifier;
          let latestAssets = await blockfrost.assetsPolicyById(
            source.policyId!,
            { page: pageOffset, count: 100, order: 'asc' }
          );
          pageOffset = pageOffset + 1;
          while (latestAssets.length != 0) {
            let assetsToProcess = latestAssets;
            if (latestIdentifier != null) {
              const foundAsset = latestAssets.findIndex(
                (a) => a.asset === latestIdentifier
              );
              //sanity check
              if (foundAsset != -1) {
                logger.info('found asset', { foundAsset: foundAsset });
                //check if we have more assets to process
                if (foundAsset + 1 < latestAssets.length) {
                  assetsToProcess = latestAssets.slice(foundAsset + 1);
                } else {
                  //we are at the latest asset of the page
                  assetsToProcess = [];
                }
              } else {
                logger.info('Latest identifier not found', {
                  latestIdentifier: latestIdentifier,
                });
              }
            }

            const updatedTMP = await updateCardanoAssets(
              assetsToProcess,
              source
            );
            if (updatedTMP) {
              latestEntries.push(...updatedTMP);
            }
            if (latestAssets.length > 0)
              latestIdentifier = latestAssets[latestAssets.length - 1].asset;

            if (latestAssets.length < 100) {
              break;
            }

            latestAssets = await blockfrost.assetsPolicyById(source.policyId!, {
              page: pageOffset,
              count: 100,
              order: 'asc',
            });
            pageOffset = pageOffset + 1;
          }
          await prisma.registrySource.update({
            where: { id: source.id },
            data: {
              latestPage: pageOffset - 1,
              latestIdentifier: latestIdentifier,
            },
          });
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

export const updateCardanoAssets = async (
  latestAssets: { asset: string; quantity: string }[],
  source: {
    id: string;
    policyId: string;
    RegistrySourceConfig: { rpcProviderApiKey: string };
    network: $Enums.Network | null;
  }
) => {
  logger.info(`updating ${latestAssets.length} cardano assets`);
  //note that the order of the entries is not guaranteed at this point
  const resultingUpdates = await Promise.all(
    latestAssets.map(async (asset) => {
      if (source.network == null) throw new Error('Source network is not set');
      if (source.RegistrySourceConfig.rpcProviderApiKey == null)
        throw new Error('Source api key is not set');

      //we will allow only unique tokens (integer quantities) via smart contract, therefore we do not care about large numbers
      const quantity = parseInt(asset.quantity);
      if (quantity == 0) {
        //TOKEN is deregistered we will update the status and return null
        await prisma.registryEntry.upsert({
          where: {
            assetIdentifier: asset.asset,
          },
          update: { status: $Enums.Status.Deregistered },
          create: {
            status: $Enums.Status.Deregistered,
            Capability: {
              connectOrCreate: {
                create: { name: '', version: '' },
                where: { name_version: { name: '', version: '' } },
              },
            },
            AgentPricing: {
              create: {
                pricingType: PricingType.Fixed,
              },
            },
            metadataVersion: -1,
            assetIdentifier: asset.asset,
            RegistrySource: { connect: { id: source.id } },
            name: '?',
            description: '?',
            apiBaseUrl: '?_' + cuid2.createId(),
            image: '?',
            lastUptimeCheck: new Date(),
          },
        });
        return null;
      }

      const blockfrost = new BlockFrostAPI({
        projectId: source.RegistrySourceConfig.rpcProviderApiKey!,
        network:
          source.network == $Enums.Network.Mainnet ? 'mainnet' : 'preprod',
      });

      const registryData = await blockfrost.assetsById(asset.asset);
      const holderData = await blockfrost.assetsAddresses(asset.asset, {
        order: 'desc',
      });
      const onchainMetadata = registryData.onchain_metadata;
      const parsedMetadata = metadataSchema.safeParse(onchainMetadata);

      //if the metadata is not valid or the token has no holder -> is burned, we skip it
      if (!parsedMetadata.success || holderData.length < 1) {
        return null;
      }
      const paymentType =
        parsedMetadata.data.agentPricing.pricingType == 'None'
          ? $Enums.PaymentType.Offchain
          : $Enums.PaymentType.Web3CardanoV1;

      //check endpoint
      const endpoint = metadataStringConvert(parsedMetadata.data.api_base_url)!;
      const isAvailable = await healthCheckService.checkAndVerifyEndpoint({
        api_url: endpoint,
        assetIdentifier: asset.asset,
      });

      return await prisma.$transaction(
        async (tx) => {
          /*  We do not need to ensure uniqueness of the api url as we require each agent to send its registry identifier, when requesting a payment  */

          const existingEntry = await tx.registryEntry.findUnique({
            where: {
              assetIdentifier: asset.asset,
            },
          });

          let newEntry;
          if (existingEntry) {
            //TODO: once we have dynamic pricing, update the pricing here

            newEntry = await tx.registryEntry.update({
              include: {
                RegistrySource: true,
                PaymentIdentifier: true,
                Capability: true,
                AgentPricing: {
                  include: { FixedPricing: { include: { Amounts: true } } },
                },
                ExampleOutput: true,
              },
              where: {
                assetIdentifier: asset.asset,
              },
              data: {
                lastUptimeCheck: new Date(),
                uptimeCount: {
                  increment: isAvailable == $Enums.Status.Online ? 1 : 0,
                },
                uptimeCheckCount: { increment: 1 },
                status: isAvailable,
                AgentPricing: {
                  create:
                    parsedMetadata.data.agentPricing.pricingType == 'None'
                      ? {
                          pricingType: PricingType.None,
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
                                      unit: metadataStringConvert(price.unit)!,
                                    })
                                  ),
                                },
                              },
                            },
                          },
                        },
                },
                PaymentIdentifier: {
                  upsert: {
                    create: {
                      paymentIdentifier: holderData[0].address,
                      sellerVKey: resolvePaymentKeyHash(holderData[0].address),
                      paymentType: paymentType,
                    },
                    update: {
                      sellerVKey: resolvePaymentKeyHash(holderData[0].address),
                      paymentIdentifier: holderData[0].address,
                      paymentType: paymentType,
                    },
                    where: {
                      registryEntryId_paymentType: {
                        registryEntryId: existingEntry.id,
                        paymentType: paymentType,
                      },
                    },
                  },
                },
              },
            });
          } else {
            const capability_name = metadataStringConvert(
              parsedMetadata.data.capability?.name
            )!;
            const capability_version = metadataStringConvert(
              parsedMetadata.data.capability?.version
            )!;

            newEntry = await tx.registryEntry.create({
              include: {
                RegistrySource: true,
                PaymentIdentifier: true,
                Capability: true,
                AgentPricing: {
                  include: { FixedPricing: { include: { Amounts: true } } },
                },
                ExampleOutput: true,
              },
              data: {
                lastUptimeCheck: new Date(),
                uptimeCount: isAvailable == $Enums.Status.Online ? 1 : 0,
                uptimeCheckCount: 1,
                status: isAvailable,
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
                    parsedMetadata.data.agentPricing.pricingType == 'None'
                      ? {
                          pricingType: PricingType.None,
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
                                      unit: metadataStringConvert(price.unit)!,
                                    })
                                  ),
                                },
                              },
                            },
                          },
                        },
                },
                assetIdentifier: asset.asset,
                PaymentIdentifier: {
                  create: {
                    paymentIdentifier: holderData[0].address,
                    paymentType: paymentType,
                    sellerVKey: resolvePaymentKeyHash(holderData[0].address),
                  },
                },
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
              },
            });
          }
          return newEntry;
        },
        { maxWait: 50000, timeout: 10000 }
      );
    })
  );

  //filter out nulls -> tokens not following the metadata standard and burned tokens
  const resultingUpdatesFiltered = resultingUpdates.filter((x) => x != null);
  //sort entries by creation date
  return resultingUpdatesFiltered.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
};

export const cardanoRegistryService = {
  updateLatestCardanoRegistryEntries,
  updateCardanoAssets,
};
