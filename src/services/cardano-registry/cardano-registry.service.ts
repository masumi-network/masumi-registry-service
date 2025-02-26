import { $Enums } from '@prisma/client';
import { Sema } from 'async-sema';
import { prisma } from '@/utils/db';
import { z } from 'zod';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { resolvePaymentKeyHash } from '@meshsdk/core';
import cuid2 from '@paralleldrive/cuid2';

const metadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  description: z.string().or(z.array(z.string())).optional(),
  api_url: z
    .string()
    .min(1)
    .url()
    .or(z.array(z.string().min(1))),
  example_output: z.string().or(z.array(z.string())).optional(),
  capability: z.object({
    name: z.string().or(z.array(z.string())),
    version: z.string().or(z.array(z.string())),
  }),
  requests_per_hour: z.string().or(z.array(z.string())).optional(),
  author: z.object({
    name: z
      .string()
      .min(1)
      .or(z.array(z.string().min(1))),
    contact: z.string().or(z.array(z.string())).optional(),
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
  pricing: z
    .array(
      z.object({
        quantity: z.number({ coerce: true }).int().min(1),
        unit: z
          .string()
          .min(1)
          .or(z.array(z.string().min(1))),
      })
    )
    .min(1),
  image: z.string().or(z.array(z.string())),
  metadata_version: z.number({ coerce: true }).int().min(1).max(1),
});
const deleteMutex = new Sema(1);
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

  const acquiredMutex = await deleteMutex.tryAcquire();
  //if we are already performing an update, we wait for it to finish and return
  if (!acquiredMutex) return await deleteMutex.acquire();

  await Promise.all(
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
              return await blockfrost.assetsById(asset.assetName);
            })
          );

          const burnedAssets = assetsToProcess.filter((a) => a.quantity == '0');

          await Promise.all(
            burnedAssets.map(async (asset) => {
              const assetName = asset.asset.replace(source.policyId, '');
              await prisma.registryEntry.update({
                where: {
                  assetName_registrySourceId: {
                    assetName: assetName,
                    registrySourceId: source.id,
                  },
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
}

const updateMutex = new Sema(1);
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

  let acquiredMutex = await updateMutex.tryAcquire();
  //if we are already performing an update, we wait for it to finish and return
  if (!acquiredMutex) {
    acquiredMutex = await updateMutex.acquire();
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
      updateMutex.release();
      return;
    }
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

    logger.debug('updating entries from sources', { count: sources.length });
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
            { page: pageOffset, count: 100 }
          );
          pageOffset = pageOffset + 1;
          while (latestAssets.length != 0) {
            let assetsToProcess = latestAssets;
            if (latestIdentifier != null) {
              logger.debug('Latest identifier', {
                latestIdentifier: latestIdentifier,
              });
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
              logger.debug('No more assets to process', {
                latestIdentifier: latestIdentifier,
              });
              break;
            }

            latestAssets = await blockfrost.assetsPolicyById(source.policyId!, {
              page: pageOffset,
              count: 100,
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

          latestAssets = await blockfrost.assetsPolicyById(source.policyId!, {
            page: pageOffset,
            count: 100,
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
    //library is strange as we can release from any non-acquired semaphore
    updateMutex.release();
  }

  //sort by sources creation date and entries creation date
  //probably unnecessary to return the entries and does not work nicely with mutex
  /*return latestEntries.sort((a, b) => {
        if (a.registrySourcesId == b.registrySourcesId)
            return a.createdAt.getTime() - b.createdAt.getTime()
        const sourceA = sources.find(s => s.id == a.registrySourcesId)
        const sourceB = sources.find(s => s.id == b.registrySourcesId)
        if (sourceA && sourceB)
            return sourceA.createdAt.getTime() - sourceB.createdAt.getTime()
        return 0
    })*/
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

      logger.debug('updating asset', {
        asset: asset.asset,
        quantity: asset.quantity,
      });
      const assetName = asset.asset.replace(source.policyId, '');
      //we will allow only unique tokens (integer quantities) via smart contract, therefore we do not care about large numbers
      const quantity = parseInt(asset.quantity);
      if (quantity == 0) {
        //TOKEN is deregistered we will update the status and return null
        await prisma.registryEntry.upsert({
          where: {
            assetName_registrySourceId: {
              assetName: assetName,
              registrySourceId: source.id,
            },
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
            assetName: assetName,
            RegistrySource: { connect: { id: source.id } },
            name: '?',
            description: '?',
            apiUrl: '?_' + cuid2.createId(),
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

      //check endpoint
      const endpoint = metadataStringConvert(parsedMetadata.data.api_url)!;
      const isAvailable = await healthCheckService.checkAndVerifyEndpoint({
        api_url: endpoint,
        assetName: asset.asset,
        registry: {
          identifier: source.policyId!,
          type: $Enums.RegistryEntryType.Web3CardanoV1,
        },
      });

      return await prisma.$transaction(
        async (tx) => {
          /*We do not need to ensure uniqueness of the api url as we require each agent to send its registry identifier, when requesting a payment 
            
            const duplicateEntry = await tx.registryEntry.findFirst({
                where: {
                    registrySourcesId: source.id,
                    api_url: metadataStringConvert(parsedMetadata.data.api_url)!,
                    identifier: { not: asset.asset }
                }
            })
            if (duplicateEntry) {
                //TODO this can be removed if we want to allow re registration of the same agent (url)
                //WARNING this also only works if the api url does not accept any query parameters or similar
                logger.info("Someone tried to duplicate an entry for the same api url", { duplicateEntry: duplicateEntry })
                return null;
            }*/

          const existingEntry = await tx.registryEntry.findUnique({
            where: {
              assetName_registrySourceId: {
                assetName: assetName,
                registrySourceId: source.id,
              },
            },
          });

          let newEntry;
          if (existingEntry) {
            //TODO this can be ignored unless we allow updates to the registry entry
            const capability_name = metadataStringConvert(
              parsedMetadata.data.capability.name
            )!;
            const capability_version = metadataStringConvert(
              parsedMetadata.data.capability.version
            )!;
            const requests_per_hour_string = metadataStringConvert(
              parsedMetadata.data.requests_per_hour
            );
            let requests_per_hour = undefined;
            try {
              if (requests_per_hour_string)
                requests_per_hour = parseFloat(requests_per_hour_string);
            } catch {
              /* ignore */
            }
            newEntry = await tx.registryEntry.update({
              include: {
                RegistrySource: true,
                PaymentIdentifier: true,
                Capability: true,
                Prices: true,
              },

              where: {
                assetName_registrySourceId: {
                  assetName: assetName,
                  registrySourceId: source.id,
                },
              },
              data: {
                lastUptimeCheck: new Date(),
                uptimeCount: {
                  increment: isAvailable == $Enums.Status.Online ? 1 : 0,
                },
                uptimeCheckCount: { increment: 1 },
                status: isAvailable,
                name: metadataStringConvert(parsedMetadata.data.name)!,
                description: metadataStringConvert(
                  parsedMetadata.data.description
                ),
                apiUrl: metadataStringConvert(parsedMetadata.data.api_url)!,
                authorName: metadataStringConvert(
                  parsedMetadata.data.author?.name
                ),
                authorOrganization: metadataStringConvert(
                  parsedMetadata.data.author?.organization
                ),
                authorContact: metadataStringConvert(
                  parsedMetadata.data.author?.contact
                ),
                image: metadataStringConvert(parsedMetadata.data.image),
                privacyPolicy: metadataStringConvert(
                  parsedMetadata.data.legal?.privacy_policy
                ),
                termsAndCondition: metadataStringConvert(
                  parsedMetadata.data.legal?.terms
                ),
                otherLegal: metadataStringConvert(
                  parsedMetadata.data.legal?.other
                ),
                requestsPerHour: requests_per_hour,
                tags: parsedMetadata.data.tags
                  ? {
                      push: parsedMetadata.data.tags.map(
                        (tag) => metadataStringConvert(tag)!
                      ),
                    }
                  : undefined,
                Prices: {
                  connectOrCreate: parsedMetadata.data.pricing.map((price) => ({
                    create: {
                      quantity: price.quantity,
                      unit: metadataStringConvert(price.unit)!,
                    },
                    where: {
                      quantity_unit_registryEntryId: {
                        quantity: price.quantity,
                        unit: metadataStringConvert(price.unit)!,
                        registryEntryId: existingEntry.id,
                      },
                    },
                  })),
                },
                PaymentIdentifier: {
                  upsert: {
                    create: {
                      paymentIdentifier: holderData[0].address,
                      sellerVKey: resolvePaymentKeyHash(holderData[0].address),
                      paymentType: $Enums.PaymentType.Web3CardanoV1,
                    },
                    update: {
                      sellerVKey: resolvePaymentKeyHash(holderData[0].address),
                      paymentIdentifier: holderData[0].address,
                      paymentType: $Enums.PaymentType.Web3CardanoV1,
                    },
                    where: {
                      registryEntryId_paymentType: {
                        registryEntryId: existingEntry.id,
                        paymentType: $Enums.PaymentType.Web3CardanoV1,
                      },
                    },
                  },
                },
                assetName: assetName,
                RegistrySource: { connect: { id: source.id } },
                Capability: {
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
          } else {
            const capability_name = metadataStringConvert(
              parsedMetadata.data.capability.name
            )!;
            const capability_version = metadataStringConvert(
              parsedMetadata.data.capability.version
            )!;
            const requests_per_hour_string = metadataStringConvert(
              parsedMetadata.data.requests_per_hour
            );
            let requests_per_hour = undefined;
            try {
              if (requests_per_hour_string)
                requests_per_hour = parseFloat(requests_per_hour_string);
            } catch {
              /* ignore */
            }
            newEntry = await tx.registryEntry.create({
              include: {
                RegistrySource: true,
                PaymentIdentifier: true,
                Capability: true,
                Prices: true,
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
                apiUrl: metadataStringConvert(parsedMetadata.data.api_url)!,
                authorName: metadataStringConvert(
                  parsedMetadata.data.author?.name
                ),
                authorOrganization: metadataStringConvert(
                  parsedMetadata.data.author?.organization
                ),
                authorContact: metadataStringConvert(
                  parsedMetadata.data.author?.contact
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
                requestsPerHour: requests_per_hour,
                tags: parsedMetadata.data.tags,
                Prices: {
                  create: parsedMetadata.data.pricing.map((price) => ({
                    quantity: price.quantity,
                    unit: metadataStringConvert(price.unit)!,
                  })),
                },
                assetName: assetName,
                PaymentIdentifier: {
                  create: {
                    paymentIdentifier: holderData[0].address,
                    paymentType: $Enums.PaymentType.Web3CardanoV1,
                    sellerVKey: resolvePaymentKeyHash(holderData[0].address),
                  },
                },
                RegistrySource: { connect: { id: source.id } },
                Capability: {
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
