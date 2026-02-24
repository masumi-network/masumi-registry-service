import { $Enums, Prisma, PricingType } from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { prisma } from '@/utils/db';
import { z } from '@/utils/zod-openapi';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import { agentCardSchema, AgentCard } from '@/utils/a2a-schemas';

// ─── MIP-001 on-chain schema (metadata_version: 1) ───────────────────────────
export const mip001Schema = z.object({
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

// ─── MIP-002 on-chain schema (metadata_version: 2) ───────────────────────────
export const mip002Schema = z.object({
  name: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  description: z.string().or(z.array(z.string())).optional(),
  api_url: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  agent_card_url: z
    .string()
    .min(1)
    .or(z.array(z.string().min(1))),
  a2a_protocol_versions: z.string().or(z.array(z.string())),
  tags: z.array(z.string().min(1)).optional(),
  image: z.string().or(z.array(z.string())).optional(),
  metadata_version: z.number({ coerce: true }).int().min(2).max(2),
});

// ─── Shared fetch helper with AbortController timeout ────────────────────────
async function timedFetch(url: string, timeoutMs = 7500): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    try {
      controller.abort();
    } catch {
      // no-op on a completed request
    }
  }
}

// ─── Fetch & validate agent card (used during indexing only) ─────────────────
async function fetchAndValidateAgentCard(agentCardUrl: string): Promise<{
  status: $Enums.Status;
  agentCard: AgentCard | null;
}> {
  try {
    const url = new URL(agentCardUrl);
    if (['localhost', '127.0.0.1'].includes(url.hostname)) {
      return { status: $Enums.Status.Invalid, agentCard: null };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { status: $Enums.Status.Invalid, agentCard: null };
    }

    const response = await timedFetch(agentCardUrl);
    if (!response.ok) {
      try {
        await response.text();
      } catch {
        // drain body
      }
      return { status: $Enums.Status.Offline, agentCard: null };
    }
    const json = await response.json();
    const parsed = agentCardSchema.safeParse(json);
    if (!parsed.success) {
      return { status: $Enums.Status.Invalid, agentCard: null };
    }
    return { status: $Enums.Status.Online, agentCard: parsed.data };
  } catch {
    return { status: $Enums.Status.Offline, agentCard: null };
  }
}

// ─── Process a MIP-001 mint ───────────────────────────────────────────────────
async function processMip001Entry(
  data: z.infer<typeof mip001Schema>,
  asset: string,
  source: { id: string }
) {
  const paymentType =
    data.agentPricing.pricingType == 'Free'
      ? $Enums.PaymentType.None
      : $Enums.PaymentType.Web3CardanoV1;

  const endpoint = metadataStringConvert(data.api_base_url)!;
  const isAvailable = await healthCheckService.checkAndVerifyEndpoint({
    api_url: endpoint,
  });
  const status =
    isAvailable.returnedAgentIdentifier != null
      ? isAvailable.returnedAgentIdentifier == asset
        ? isAvailable.status
        : $Enums.Status.Invalid
      : isAvailable.status;

  const capability_name = metadataStringConvert(data.capability?.name)!;
  const capability_version = metadataStringConvert(data.capability?.version)!;

  const sharedFields = {
    status,
    name: metadataStringConvert(data.name)!,
    description: metadataStringConvert(data.description),
    apiBaseUrl: endpoint,
    authorName: metadataStringConvert(data.author?.name),
    authorOrganization: metadataStringConvert(data.author?.organization),
    authorContactEmail: metadataStringConvert(data.author?.contact_email),
    authorContactOther: metadataStringConvert(data.author?.contact_other),
    image: metadataStringConvert(data.image)!, // required in MIP-001
    privacyPolicy: metadataStringConvert(data.legal?.privacy_policy),
    termsAndCondition: metadataStringConvert(data.legal?.terms),
    otherLegal: metadataStringConvert(data.legal?.other),
    tags: data.tags,
    metadataVersion: data.metadata_version,
    agentCardUrl: null,
    a2aProtocolVersions: [],
    assetIdentifier: asset,
    paymentType,
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

  const agentPricingCreatePayload =
    data.agentPricing.pricingType == 'Free'
      ? { pricingType: PricingType.Free }
      : {
          pricingType: PricingType.Fixed,
          FixedPricing: {
            create: {
              Amounts: {
                createMany: {
                  data: data.agentPricing.fixedPricing.map((price) => ({
                    amount: price.amount,
                    unit: metadataStringConvert(price.unit)!,
                  })),
                },
              },
            },
          },
        };

  const exampleOutputRows =
    data.example_output && data.example_output.length > 0
      ? data.example_output.map((example) => ({
          name: metadataStringConvert(example.name)!,
          mimeType: metadataStringConvert(example.mime_type)!,
          url: metadataStringConvert(example.url)!,
        }))
      : [];

  await prisma.registryEntry.upsert({
    where: { assetIdentifier: asset },
    create: {
      ...sharedFields,
      lastUptimeCheck: new Date(),
      uptimeCount: status == $Enums.Status.Online ? 1 : 0,
      uptimeCheckCount: 1,
      AgentPricing: { create: agentPricingCreatePayload },
      ExampleOutput:
        exampleOutputRows.length > 0
          ? { createMany: { data: exampleOutputRows } }
          : undefined,
    },
    update: {
      ...sharedFields,
      ExampleOutput:
        exampleOutputRows.length > 0
          ? { deleteMany: {}, createMany: { data: exampleOutputRows } }
          : { deleteMany: {} },
      AgentPricing:
        data.agentPricing.pricingType == 'Free'
          ? { update: { pricingType: PricingType.Free } }
          : {
              update: {
                pricingType: PricingType.Fixed,
                FixedPricing: {
                  upsert: {
                    create: {
                      Amounts: {
                        createMany: {
                          data: data.agentPricing.fixedPricing.map((price) => ({
                            amount: price.amount,
                            unit: metadataStringConvert(price.unit)!,
                          })),
                        },
                      },
                    },
                    update: {
                      Amounts: {
                        deleteMany: {},
                        createMany: {
                          data: data.agentPricing.fixedPricing.map((price) => ({
                            amount: price.amount,
                            unit: metadataStringConvert(price.unit)!,
                          })),
                        },
                      },
                    },
                  },
                },
              },
            },
      lastUptimeCheck: new Date(),
      uptimeCount: { increment: status == $Enums.Status.Online ? 1 : 0 },
      uptimeCheckCount: { increment: 1 },
    },
  });
}

// ─── Process a MIP-002 mint ───────────────────────────────────────────────────
export async function processMip002Entry(
  data: z.infer<typeof mip002Schema>,
  asset: string,
  source: { id: string }
) {
  const apiUrl = metadataStringConvert(data.api_url)!;
  const agentCardUrl = metadataStringConvert(data.agent_card_url)!;
  // a2a_protocol_versions may be a single string or an array of version strings
  const a2aProtocolVersions = Array.isArray(data.a2a_protocol_versions)
    ? data.a2a_protocol_versions
    : [data.a2a_protocol_versions];

  // Single fetch: status + data to store (avoids double HTTP call)
  const { status, agentCard } = await fetchAndValidateAgentCard(agentCardUrl);

  const skillsData =
    agentCard?.skills.map((s) => ({
      skillId: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags,
      examples: s.examples ?? [],
      inputModes: s.inputModes,
      outputModes: s.outputModes,
    })) ?? [];

  const interfacesData =
    agentCard?.supportedInterfaces.map((i) => ({
      url: i.url,
      protocolBinding: i.protocolBinding,
      protocolVersion: i.protocolVersion,
    })) ?? [];

  const capabilitiesData = agentCard
    ? {
        streaming: agentCard.capabilities.streaming ?? null,
        pushNotifications: agentCard.capabilities.pushNotifications ?? null,
        // Prisma requires Prisma.JsonNull (not JS null) for nullable JSONB fields
        extensions: agentCard.capabilities.extensions ?? Prisma.JsonNull,
      }
    : null;

  const sharedFields = {
    status,
    name: metadataStringConvert(data.name)!,
    description: metadataStringConvert(data.description),
    apiBaseUrl: apiUrl,
    agentCardUrl,
    a2aProtocolVersions,
    image: metadataStringConvert(data.image) ?? null, // optional in MIP-002
    tags: data.tags ?? [], // optional in MIP-002
    metadataVersion: data.metadata_version,
    authorName: null,
    authorOrganization: null,
    authorContactEmail: null,
    authorContactOther: null,
    privacyPolicy: null,
    termsAndCondition: null,
    otherLegal: null,
    assetIdentifier: asset,
    paymentType: $Enums.PaymentType.None,
    RegistrySource: { connect: { id: source.id } },
    Capability: undefined,
  };

  // Top-level agent card fields (populated when fetch succeeds, null otherwise)
  const agentCardFields = agentCard
    ? {
        a2aAgentVersion: agentCard.version,
        a2aDefaultInputModes: agentCard.defaultInputModes,
        a2aDefaultOutputModes: agentCard.defaultOutputModes,
        a2aProviderName: agentCard.provider?.organization ?? null,
        a2aProviderUrl: agentCard.provider?.url ?? null,
        a2aDocumentationUrl: agentCard.documentationUrl ?? null,
        a2aIconUrl: agentCard.iconUrl ?? null,
      }
    : null;

  await prisma.registryEntry.upsert({
    where: { assetIdentifier: asset },
    create: {
      ...sharedFields,
      lastUptimeCheck: new Date(),
      uptimeCount: status == $Enums.Status.Online ? 1 : 0,
      uptimeCheckCount: 1,
      AgentPricing: { create: { pricingType: PricingType.Free } },
      // Agent card detail fields — null/empty if the initial fetch failed
      a2aAgentVersion: agentCardFields?.a2aAgentVersion ?? null,
      a2aDefaultInputModes: agentCardFields?.a2aDefaultInputModes ?? [],
      a2aDefaultOutputModes: agentCardFields?.a2aDefaultOutputModes ?? [],
      a2aProviderName: agentCardFields?.a2aProviderName ?? null,
      a2aProviderUrl: agentCardFields?.a2aProviderUrl ?? null,
      a2aDocumentationUrl: agentCardFields?.a2aDocumentationUrl ?? null,
      a2aIconUrl: agentCardFields?.a2aIconUrl ?? null,
      A2ASkills:
        skillsData.length > 0
          ? { createMany: { data: skillsData } }
          : undefined,
      A2ASupportedInterfaces:
        interfacesData.length > 0
          ? { createMany: { data: interfacesData } }
          : undefined,
      A2ACapabilities: capabilitiesData
        ? { create: capabilitiesData }
        : undefined,
    },
    update: {
      ...sharedFields,
      AgentPricing: { update: { pricingType: PricingType.Free } },
      lastUptimeCheck: new Date(),
      uptimeCount: { increment: status == $Enums.Status.Online ? 1 : 0 },
      uptimeCheckCount: { increment: 1 },
      // Only refresh agent card data when the fetch succeeded — preserve
      // previously indexed values rather than wiping them on a transient failure.
      ...(agentCard !== null
        ? {
            ...agentCardFields,
            A2ASkills: { deleteMany: {}, createMany: { data: skillsData } },
            A2ASupportedInterfaces: {
              deleteMany: {},
              createMany: { data: interfacesData },
            },
            A2ACapabilities: capabilitiesData
              ? {
                  upsert: {
                    create: capabilitiesData,
                    update: capabilitiesData,
                  },
                }
              : undefined,
          }
        : {}),
    },
  });
}

// ─── Health check loop ────────────────────────────────────────────────────────
const healthMutex = new Mutex();
export async function updateHealthCheck(onlyEntriesAfter?: Date | undefined) {
  logger.info('Updating cardano registry entries health check: ', {
    onlyEntriesAfter: onlyEntriesAfter,
  });
  if (onlyEntriesAfter == undefined) {
    onlyEntriesAfter = new Date();
  }

  const sourcesCount = await prisma.registrySource.aggregate({
    where: { type: $Enums.RegistryEntryType.Web3CardanoV1 },
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

  const sources = await prisma.registrySource.findMany({
    where: { type: $Enums.RegistryEntryType.Web3CardanoV1 },
    include: { RegistrySourceConfig: true },
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
            status: { in: [$Enums.Status.Online, $Enums.Status.Offline] },
            lastUptimeCheck: { lte: onlyEntriesAfter },
          },
          orderBy: { lastUptimeCheck: 'asc' },
          take: 50,
          include: {
            RegistrySource: true,
            Capability: true,
            AgentPricing: {
              include: { FixedPricing: { include: { Amounts: true } } },
            },
          },
        });
        logger.info(
          `Found ${entries.length} registry entries in status online or offline`
        );
        const invalidEntries = await prisma.registryEntry.findMany({
          where: {
            registrySourceId: source.id,
            status: { in: [$Enums.Status.Invalid] },
            lastUptimeCheck: { lte: onlyEntriesAfter },
            uptimeCheckCount: { lte: 20 },
          },
          orderBy: { updatedAt: 'asc' },
          take: 50,
          include: {
            RegistrySource: true,
            Capability: true,
            AgentPricing: {
              include: { FixedPricing: { include: { Amounts: true } } },
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
              onlyEntriesAfter!.getTime()
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
              data: { updatedAt: new Date() },
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

// ─── Main indexing loop ───────────────────────────────────────────────────────
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
    { headers: { project_id: blockfrostToken } }
  );
  if (!result.ok) {
    throw new Error('Failed to get scripts redeemers');
  }
  const json = await result.json();
  return json as ScriptRedeemersResponse;
}

const updateMutex = new Mutex();
export async function updateLatestCardanoRegistryEntries() {
  let sources = await prisma.registrySource.findMany({
    where: { type: $Enums.RegistryEntryType.Web3CardanoV1 },
    include: { RegistrySourceConfig: true },
  });
  if (sources.length == 0) return;

  let release: MutexInterface.Releaser | null;
  try {
    release = await tryAcquire(updateMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }

  sources = await prisma.registrySource.findMany({
    where: { type: $Enums.RegistryEntryType.Web3CardanoV1 },
    include: { RegistrySourceConfig: true },
  });
  if (sources.length == 0) {
    release();
    return;
  }

  try {
    const invalidSourcesTypes = sources.filter(
      (s) => s.type !== $Enums.RegistryEntryType.Web3CardanoV1
    );
    if (invalidSourcesTypes.length > 0) throw new Error('Invalid source types');
    const invalidSourceIdentifiers = sources.filter((s) => s.policyId == null);
    if (invalidSourceIdentifiers.length > 0)
      throw new Error('Invalid source identifiers');

    await Promise.all(
      sources.map(async (source) => {
        try {
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
                  // mint — try MIP-001 first, then MIP-002
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

                  const v1Result = mip001Schema.safeParse(onchainMetadata);
                  if (v1Result.success) {
                    await processMip001Entry(v1Result.data, asset, source);
                  } else {
                    const v2Result = mip002Schema.safeParse(onchainMetadata);
                    if (v2Result.success) {
                      await processMip002Entry(v2Result.data, asset, source);
                    }
                    // else: neither version valid → skip (same as before)
                  }
                }

                if (quantity < 0) {
                  // burn
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
