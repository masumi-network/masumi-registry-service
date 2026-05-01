import {
  $Enums,
  InboxAgentRegistrationStatus,
  Prisma,
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
import { agentCardSchema, AgentCard } from '@/utils/a2a-schemas';
import { timedFetch } from '@/utils/timed-fetch';
import {
  validatePublicUrl,
  PublicUrlValidationError,
} from '@/utils/public-url';
import {
  getInboxAgentRegistrationVerificationDataReset,
  INBOX_REGISTRY_METADATA_TYPE,
  hasInboxAgentRegistrationContentChanged,
  nextInboxAgentRegistrationStatus,
  parseInboxAgentRegistrationMetadata,
} from './inbox-agent-registration';

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
    )
    .or(
      z.object({
        pricingType: z.enum([PricingType.Dynamic]),
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

// ─── Fetch & validate agent card (used during indexing only) ─────────────────
async function fetchAndValidateAgentCard(agentCardUrl: string): Promise<{
  status: $Enums.Status;
  agentCard: AgentCard | null;
}> {
  try {
    const { normalizedUrl } = await validatePublicUrl(agentCardUrl);

    const response = await timedFetch(normalizedUrl);
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
  } catch (e) {
    if (e instanceof PublicUrlValidationError) {
      return { status: $Enums.Status.Invalid, agentCard: null };
    }
    return { status: $Enums.Status.Offline, agentCard: null };
  }
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
      inputModes: s.inputModes ?? [],
      outputModes: s.outputModes ?? [],
    })) ?? [];

  const interfacesData =
    agentCard?.supportedInterfaces.map((i) => ({
      url: i.url,
      protocolBinding: i.protocolBinding,
      protocolVersion: i.protocolVersion,
      tenant: i.tenant ?? null,
    })) ?? [];

  const capabilitiesData = agentCard
    ? {
        streaming: agentCard.capabilities.streaming ?? null,
        pushNotifications: agentCard.capabilities.pushNotifications ?? null,
        extendedAgentCard: agentCard.capabilities.extendedAgentCard ?? null,
        // Prisma requires Prisma.JsonNull (not JS null) for nullable JSONB fields.
        // Cast needed because Prisma's InputJsonValue has no index signature on arrays.
        extensions: agentCard.capabilities.extensions
          ? (agentCard.capabilities.extensions as Prisma.InputJsonValue)
          : Prisma.JsonNull,
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

type SyncableRegistrySource = {
  id: string;
  policyId: string;
  network: $Enums.Network;
  lastTxId: string | null;
  lastCheckedPage: number;
  RegistrySourceConfig: {
    rpcProviderApiKey: string;
  };
};

function getCapabilityRelationWrite(params: {
  capabilityName: string | null;
  capabilityVersion: string | null;
}) {
  if (params.capabilityName == null || params.capabilityVersion == null) {
    return undefined;
  }

  return {
    connectOrCreate: {
      create: {
        name: params.capabilityName,
        version: params.capabilityVersion,
      },
      where: {
        name_version: {
          name: params.capabilityName,
          version: params.capabilityVersion,
        },
      },
    },
  };
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
  const sourcesCount = await prisma.registrySource.aggregate({
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
            ExampleOutput: true,
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
            ExampleOutput: true,
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
            filteredOutInvalidStaggeredEntries.find((e2) => e2.id === e.id) ==
            null
        );
        logger.info(
          `Stagger-deferring ${excludedEntries.length} invalid entries, retrying ${filteredOutInvalidStaggeredEntries.length}`
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

        const inboxAgentRegistrations =
          await prisma.inboxAgentRegistration.findMany({
            where: {
              registrySourceId: source.id,
              status: {
                in: [
                  InboxAgentRegistrationStatus.Pending,
                  InboxAgentRegistrationStatus.Verified,
                  InboxAgentRegistrationStatus.Invalid,
                ],
              },
              updatedAt: {
                lte: onlyEntriesAfter,
              },
            },
            orderBy: { updatedAt: 'asc' },
            take: 50,
            include: {
              RegistrySource: true,
            },
          });
        logger.info(
          `Found ${inboxAgentRegistrations.length} inbox agent registrations eligible for verification`
        );
        await healthCheckService.checkVerifyAndUpdateInboxAgentRegistrations({
          inboxAgentRegistrations,
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
  const parsedMetadata = mip001Schema.safeParse(params.onchainMetadata);

  if (!parsedMetadata.success) {
    return false;
  }

  const paymentType =
    parsedMetadata.data.agentPricing.pricingType == 'Free'
      ? $Enums.PaymentType.None
      : $Enums.PaymentType.Web3CardanoV1;

  const name = metadataStringConvert(parsedMetadata.data.name)!;
  const description = metadataStringConvert(parsedMetadata.data.description);
  const apiBaseUrl = metadataStringConvert(parsedMetadata.data.api_base_url)!;
  const authorName = metadataStringConvert(parsedMetadata.data.author?.name);
  const authorOrganization = metadataStringConvert(
    parsedMetadata.data.author?.organization
  );
  const authorContactEmail = metadataStringConvert(
    parsedMetadata.data.author?.contact_email
  );
  const authorContactOther = metadataStringConvert(
    parsedMetadata.data.author?.contact_other
  );
  const image = metadataStringConvert(parsedMetadata.data.image)!;
  const privacyPolicy = metadataStringConvert(
    parsedMetadata.data.legal?.privacy_policy
  );
  const termsAndCondition = metadataStringConvert(
    parsedMetadata.data.legal?.terms
  );
  const otherLegal = metadataStringConvert(parsedMetadata.data.legal?.other);
  const tags = parsedMetadata.data.tags;
  const isAvailable = await healthCheckService.checkAndVerifyEndpoint({
    api_url: apiBaseUrl,
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
  const capabilityRelationWrite = getCapabilityRelationWrite({
    capabilityName: capability_name,
    capabilityVersion: capability_version,
  });
  const sharedQuery = {
    status: status,
    name,
    description,
    apiBaseUrl,
    authorName,
    authorOrganization,
    authorContactEmail,
    authorContactOther,
    image,
    privacyPolicy,
    termsAndCondition,
    otherLegal,
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
    tags,
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
  };

  const updateData = {
    ...sharedQuery,
    Capability: capabilityRelationWrite ?? { disconnect: true },
    lastUptimeCheck: new Date(),
    uptimeCount: {
      increment: status == $Enums.Status.Online ? 1 : 0,
    },
    uptimeCheckCount: { increment: 1 },
  };

  const createData = {
    ...sharedQuery,
    Capability: capabilityRelationWrite,
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
    providerUrl: normalizedMetadata.providerUrl,
    metadataVersion: normalizedMetadata.metadataVersion,
    registrySourceId: params.source.id,
  };

  await prisma.inboxAgentRegistration.upsert({
    where: { assetIdentifier: params.asset },
    update: {
      ...sharedQuery,
      status,
      ...getInboxAgentRegistrationVerificationDataReset({
        changed,
        nextStatus: status,
      }),
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

  if (metadataType === INBOX_REGISTRY_METADATA_TYPE) {
    await syncInboxAgentRegistration(params);
    return;
  }

  // Try MIP-001 first, then MIP-002 — either standard is valid
  const synced = await syncWeb3CardanoRegistryEntry(params);
  if (!synced) {
    const v2Result = mip002Schema.safeParse(params.onchainMetadata);
    if (v2Result.success) {
      await processMip002Entry(v2Result.data, params.asset, params.source);
    }
    // else: neither version valid → skip
  }
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

  sources = await getSyncableRegistrySources();
  if (sources.length == 0) {
    release();
    return;
  }

  try {
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
