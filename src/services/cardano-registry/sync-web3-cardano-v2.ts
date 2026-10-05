import { $Enums } from '@prisma/client';
import { prisma } from '@/utils/db';
import { metadataStringConvert } from '@/utils/metadata-string-convert';
import { healthCheckService } from '@/services/health-check';
import {
  checkSpecEntry,
  specCachePatch,
} from '@/services/health-check/spec-entry-check';
import { logger } from '@/utils/logger';
import { DEFAULTS } from '@/utils/config';
import {
  markRegistryMetadataInvalid,
  registryEntryTypeFromOnChain,
  type SyncableRegistrySource,
} from './registry-sync-metadata';
import {
  buildV2SupportedPaymentSourceRows,
  buildV2VerificationRows,
  resolveV2PaymentType,
  web3CardanoV2MetadataSchema,
} from './web3-cardano-v2-metadata';

// Sync a Web3CardanoV2 registry entry. V2 metadata groups payment sources (with
// per-source pricing) and adds verifications, and drops the top-level
// agentPricing — so pricing is resolved from the Cardano source. Re-synced via
// the same upsert-by-assetIdentifier path, so on-chain metadata updates are
// picked up; the relational read models are fully replaced each sync.
export async function syncWeb3CardanoV2RegistryEntry(params: {
  source: SyncableRegistrySource;
  asset: string;
  onchainMetadata: unknown;
}): Promise<boolean> {
  const parsedMetadata = web3CardanoV2MetadataSchema.safeParse(
    params.onchainMetadata
  );
  if (!parsedMetadata.success) {
    logger.warn('Rejected invalid V2 registry metadata', {
      assetIdentifier: params.asset,
      validationIssues: parsedMetadata.error.issues,
    });
    await markRegistryMetadataInvalid({
      sourceId: params.source.id,
      assetIdentifier: params.asset,
    });
    return false;
  }
  const metadata = parsedMetadata.data;
  const entryType = registryEntryTypeFromOnChain(metadata.type);

  const agentCardUrl = metadataStringConvert(metadata.agent_card_url);
  const a2aDescriptor =
    entryType === $Enums.RegistryEntryType.A2A && agentCardUrl != null
      ? { agentCardUrl, protocolVersions: metadata.a2a_protocol_versions ?? [] }
      : null;
  const cardCheck =
    entryType === $Enums.RegistryEntryType.A2A
      ? await checkSpecEntry({
          type: entryType,
          openApiSpecUrl: null,
          x402ResourcesUrl: null,
          A2A: a2aDescriptor,
        })
      : null;
  const endpoint =
    metadataStringConvert(
      metadata.api_base_url ??
        metadata.openapi_spec_url ??
        metadata.x402_resources_url
    ) ?? null;
  const isAvailable =
    cardCheck ??
    (endpoint == null
      ? { returnedAgentIdentifier: null, status: $Enums.Status.Invalid }
      : await healthCheckService.checkAndVerifyEndpoint({ api_url: endpoint }));
  const returnedAgentIdentifier =
    'returnedAgentIdentifier' in isAvailable
      ? isAvailable.returnedAgentIdentifier
      : null;
  const status =
    returnedAgentIdentifier != null && returnedAgentIdentifier !== params.asset
      ? $Enums.Status.Invalid
      : isAvailable.status;

  const capabilityName = metadataStringConvert(metadata.capability?.name);
  const capabilityVersion = metadataStringConvert(metadata.capability?.version);

  const exampleOutputCreate =
    metadata.example_output && metadata.example_output.length > 0
      ? {
          createMany: {
            data: metadata.example_output.map((example) => ({
              name: metadataStringConvert(example.name)!,
              mimeType: metadataStringConvert(example.mime_type)!,
              url: metadataStringConvert(example.url)!,
            })),
          },
        }
      : undefined;

  let supportedPaymentSourceRows: ReturnType<
    typeof buildV2SupportedPaymentSourceRows
  >;
  try {
    supportedPaymentSourceRows = buildV2SupportedPaymentSourceRows(metadata);
  } catch (error) {
    logger.warn('Rejected invalid V2 registry payment sources', {
      assetIdentifier: params.asset,
      validationError: error instanceof Error ? error.message : String(error),
    });
    await markRegistryMetadataInvalid({
      sourceId: params.source.id,
      assetIdentifier: params.asset,
    });
    return false;
  }
  const verificationRows = buildV2VerificationRows(metadata);

  const sharedQuery = {
    status,
    ...specCachePatch(cardCheck ?? {}),
    name: metadataStringConvert(metadata.name)!,
    description: metadataStringConvert(metadata.description),
    type: entryType,
    apiBaseUrl:
      metadataStringConvert(
        entryType === $Enums.RegistryEntryType.A2A
          ? (metadata.api_url ?? metadata.api_base_url)
          : metadata.api_base_url
      ) ?? null,
    openApiSpecUrl: metadataStringConvert(metadata.openapi_spec_url) ?? null,
    x402ResourcesUrl:
      metadataStringConvert(metadata.x402_resources_url) ?? null,
    authorName: metadataStringConvert(metadata.author.name),
    authorOrganization: metadataStringConvert(metadata.author.organization),
    authorContactEmail: metadataStringConvert(metadata.author.contact_email),
    authorContactOther: metadataStringConvert(metadata.author.contact_other),
    image: metadataStringConvert(metadata.image)!,
    privacyPolicy: metadataStringConvert(metadata.legal?.privacy_policy),
    termsAndCondition: metadataStringConvert(metadata.legal?.terms),
    otherLegal: metadataStringConvert(metadata.legal?.other),
    tags: metadata.tags,
    metadataVersion: DEFAULTS.METADATA_VERSION_V2,
    assetIdentifier: params.asset,
    paymentType: resolveV2PaymentType(metadata),
    RegistrySource: { connect: { id: params.source.id } },
    Capability:
      capabilityName == null || capabilityVersion == null
        ? undefined
        : {
            connectOrCreate: {
              create: { name: capabilityName, version: capabilityVersion },
              where: {
                name_version: {
                  name: capabilityName,
                  version: capabilityVersion,
                },
              },
            },
          },
  };

  await prisma.$transaction(async (tx) => {
    const entry = await tx.registryEntry.upsert({
      where: { assetIdentifier: params.asset },
      update: {
        ...sharedQuery,
        lastUptimeCheck: new Date(),
        uptimeCount: { increment: status == $Enums.Status.Online ? 1 : 0 },
        uptimeCheckCount: { increment: 1 },
        ExampleOutput: { deleteMany: {}, ...(exampleOutputCreate ?? {}) },
        SupportedPaymentSources: {
          deleteMany: {},
          ...(supportedPaymentSourceRows.length > 0
            ? { create: supportedPaymentSourceRows }
            : {}),
        },
        Verifications: {
          deleteMany: {},
          ...(verificationRows.length > 0
            ? { createMany: { data: verificationRows } }
            : {}),
        },
      },
      create: {
        ...sharedQuery,
        lastUptimeCheck: new Date(),
        uptimeCount: status == $Enums.Status.Online ? 1 : 0,
        uptimeCheckCount: 1,
        ExampleOutput: exampleOutputCreate,
        SupportedPaymentSources:
          supportedPaymentSourceRows.length > 0
            ? { create: supportedPaymentSourceRows }
            : undefined,
        Verifications:
          verificationRows.length > 0
            ? { createMany: { data: verificationRows } }
            : undefined,
      },
      select: { id: true },
    });

    if (a2aDescriptor != null) {
      await tx.a2ARegistryEntry.upsert({
        where: { registryEntryId: entry.id },
        create: { ...a2aDescriptor, registryEntryId: entry.id },
        update: a2aDescriptor,
      });
    } else {
      await tx.a2ARegistryEntry.deleteMany({
        where: { registryEntryId: entry.id },
      });
    }
  });

  return true;
}
