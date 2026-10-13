import * as fs from 'fs/promises';
import * as path from 'path';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import type {
  Snapshot,
  SnapshotEntry,
  SnapshotAgentPricing,
  PaymentSourcesSnapshot,
  SnapshotEntryPaymentSources,
  ExportResult,
} from './types';
import { SNAPSHOT_VERSION } from './types';

function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function mapEntryToSnapshot(
  entry: Awaited<ReturnType<typeof prisma.registryEntry.findMany>>[number] & {
    Capability: {
      name: string;
      version: string;
      description: string | null;
    } | null;
    AgentPricing: {
      pricingType: string;
      FixedPricing: {
        Amounts: { amount: bigint; unit: string }[];
      } | null;
    } | null;
    ExampleOutput: { name: string; mimeType: string; url: string }[];
    A2A: { agentCardUrl: string; protocolVersions: string[] } | null;
  }
): SnapshotEntry {
  // Build pricing object
  const agentPricing: SnapshotAgentPricing | null =
    entry.AgentPricing == null
      ? null
      : entry.AgentPricing.pricingType === 'Free' ||
          entry.AgentPricing.pricingType === 'Dynamic'
        ? {
            pricingType: entry.AgentPricing.pricingType,
            fixedPricing: null,
          }
        : {
            pricingType: 'Fixed',
            fixedPricing: {
              amounts:
                entry.AgentPricing.FixedPricing?.Amounts.map((a) => ({
                  amount: a.amount.toString(), // BigInt -> string
                  unit: a.unit,
                })) ?? [],
            },
          };

  return {
    assetIdentifier: entry.assetIdentifier,
    name: entry.name,
    type: entry.type,
    apiBaseUrl: entry.apiBaseUrl,
    openApiSpecUrl: entry.openApiSpecUrl,
    x402ResourcesUrl: entry.x402ResourcesUrl,
    a2a:
      entry.A2A == null
        ? null
        : {
            agentCardUrl: entry.A2A.agentCardUrl,
            protocolVersions: entry.A2A.protocolVersions,
          },
    description: entry.description,
    image: entry.image,
    tags: entry.tags,
    authorName: entry.authorName,
    authorContactEmail: entry.authorContactEmail,
    authorContactOther: entry.authorContactOther,
    authorOrganization: entry.authorOrganization,
    privacyPolicy: entry.privacyPolicy,
    termsAndCondition: entry.termsAndCondition,
    otherLegal: entry.otherLegal,
    lastUptimeCheck: entry.lastUptimeCheck.toISOString(),
    uptimeCount: entry.uptimeCount,
    uptimeCheckCount: entry.uptimeCheckCount,
    status: entry.status,
    statusUpdatedAt: entry.statusUpdatedAt.toISOString(),
    paymentType: entry.paymentType,
    metadataVersion: entry.metadataVersion,
    capability: entry.Capability
      ? {
          name: entry.Capability.name,
          version: entry.Capability.version,
          description: entry.Capability.description,
        }
      : null,
    agentPricing,
    exampleOutputs: entry.ExampleOutput.map((e) => ({
      name: e.name,
      mimeType: e.mimeType,
      url: e.url,
    })),
  };
}

async function exportSnapshotForSource(sourceId: string): Promise<{
  snapshot: Snapshot;
  paymentSources: PaymentSourcesSnapshot | null;
}> {
  const source = await prisma.registrySource.findUniqueOrThrow({
    where: { id: sourceId },
  });

  const entries = await prisma.registryEntry.findMany({
    where: { registrySourceId: source.id },
    include: {
      Capability: true,
      AgentPricing: {
        include: {
          FixedPricing: {
            include: { Amounts: true },
          },
        },
      },
      ExampleOutput: true,

      A2A: true,
      SupportedPaymentSources: {
        include: {
          Pricing: {
            include: {
              FixedPricing: { include: { Amounts: true } },
            },
          },
        },
        orderBy: { sourceIndex: 'asc' },
      },
    },
    orderBy: { assetIdentifier: 'asc' },
  });

  const snapshotEntries = entries.map(mapEntryToSnapshot);
  const exportedAt = new Date().toISOString();

  const snapshot: Snapshot = {
    version: SNAPSHOT_VERSION,
    exportedAt,
    network: source.network,
    policyId: source.policyId,
    lastTxId: source.lastTxId,
    lastCheckedPage: source.lastCheckedPage,
    entryCount: snapshotEntries.length,
    entries: snapshotEntries,
  };

  // V2 payment sources go in a companion file, keyed by assetIdentifier. Only
  // build it when at least one entry actually carries payment sources.
  const paymentSourceEntries: SnapshotEntryPaymentSources[] = entries
    .filter((entry) => entry.SupportedPaymentSources.length > 0)
    .map((entry) => ({
      assetIdentifier: entry.assetIdentifier,
      sources: entry.SupportedPaymentSources.map((s) => {
        if (s.Pricing == null) {
          throw new Error(
            `Registry entry ${entry.assetIdentifier} payment source ${s.sourceIndex} is missing pricing`
          );
        }
        const amounts = s.Pricing.FixedPricing?.Amounts ?? [];
        const pricing =
          s.Pricing.pricingType === 'Fixed'
            ? {
                pricingType: 'Fixed' as const,
                fixed: amounts.map((amount) => ({
                  asset: amount.unit,
                  amount: amount.amount.toString(),
                  ...(s.fixedDecimals != null
                    ? { decimals: s.fixedDecimals }
                    : {}),
                })),
              }
            : s.Pricing.pricingType === 'Dynamic'
              ? {
                  pricingType: 'Dynamic' as const,
                  ...(s.dynamicAsset != null && s.dynamicDecimals != null
                    ? {
                        dynamic: [
                          {
                            asset: s.dynamicAsset,
                            decimals: s.dynamicDecimals,
                          },
                        ],
                      }
                    : {}),
                }
              : { pricingType: 'Free' as const };
        return {
          chain: s.chain,
          network: s.network,
          sourceIndex: s.sourceIndex,
          paymentSourceType: s.paymentSourceType,
          address: s.address,
          scheme: s.scheme,
          pricing,
          payTo: s.payTo,
          resource: s.resource,
          ...(s.extra != null ? { extra: s.extra } : {}),
        };
      }),
    }));

  const paymentSources: PaymentSourcesSnapshot | null =
    paymentSourceEntries.length > 0
      ? {
          version: SNAPSHOT_VERSION,
          exportedAt,
          network: source.network,
          policyId: source.policyId,
          entryCount: paymentSourceEntries.length,
          sourceCount: paymentSourceEntries.reduce(
            (sum, e) => sum + e.sources.length,
            0
          ),
          entries: paymentSourceEntries,
        }
      : null;

  return { snapshot, paymentSources };
}

// Writes both a timestamped archive file and a stable "latest" file (the one
// import reads). `suffix` lets the companion payment-sources file share the same
// naming scheme, e.g. `preprod_<policy>.payment-sources.json`.
async function writeJsonFiles(
  data: unknown,
  network: string,
  policyId: string,
  outputDir: string,
  suffix: string = ''
): Promise<{ timestampedPath: string; latestPath: string }> {
  const json = JSON.stringify(data, bigIntReplacer, 2);
  const base = `${network.toLowerCase()}_${policyId}`;

  const dateStr = new Date().toISOString().split('T')[0];
  const timestampedPath = path.join(
    outputDir,
    `${base}_${dateStr}${suffix}.json`
  );
  await fs.writeFile(timestampedPath, json, 'utf-8');

  const latestPath = path.join(outputDir, `${base}${suffix}.json`);
  await fs.writeFile(latestPath, json, 'utf-8');

  return { timestampedPath, latestPath };
}

export async function exportAllSnapshots(
  outputDir: string = './snapshots'
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  await fs.mkdir(outputDir, { recursive: true });

  const sources = await prisma.registrySource.findMany({});

  if (sources.length === 0) {
    logger.info('No registry sources configured, nothing to export');
    return results;
  }

  for (const source of sources) {
    try {
      logger.info(
        `Exporting snapshot for ${source.network} ${source.policyId}`
      );

      const { snapshot, paymentSources } = await exportSnapshotForSource(
        source.id
      );

      const { timestampedPath, latestPath } = await writeJsonFiles(
        snapshot,
        source.network,
        source.policyId,
        outputDir
      );

      logger.info(
        `Exported ${snapshot.entryCount} entries to ${timestampedPath} and ${latestPath}`
      );

      if (paymentSources) {
        const paymentPaths = await writeJsonFiles(
          paymentSources,
          source.network,
          source.policyId,
          outputDir,
          '.payment-sources'
        );
        logger.info(
          `Exported ${paymentSources.sourceCount} payment sources for ` +
            `${paymentSources.entryCount} entries to ${paymentPaths.latestPath}`
        );
      }

      results.push({
        success: true,
        filePath: latestPath,
        entryCount: snapshot.entryCount,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to export source ${source.id}: ${errorMessage}`);
      results.push({
        success: false,
        error: errorMessage,
      });
    }
  }

  return results;
}

export async function exportSnapshotByPolicyId(
  policyId: string,
  outputDir: string = './snapshots'
): Promise<ExportResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const source = await prisma.registrySource.findFirst({
    where: { policyId },
  });

  if (!source) {
    return {
      success: false,
      error: `No registry source found for policyId: ${policyId}`,
    };
  }

  try {
    const { snapshot, paymentSources } = await exportSnapshotForSource(
      source.id
    );

    const { timestampedPath, latestPath } = await writeJsonFiles(
      snapshot,
      source.network,
      policyId,
      outputDir
    );

    logger.info(
      `Exported ${snapshot.entryCount} entries to ${timestampedPath} and ${latestPath}`
    );

    if (paymentSources) {
      const paymentPaths = await writeJsonFiles(
        paymentSources,
        source.network,
        policyId,
        outputDir,
        '.payment-sources'
      );
      logger.info(
        `Exported ${paymentSources.sourceCount} payment sources for ` +
          `${paymentSources.entryCount} entries to ${paymentPaths.latestPath}`
      );
    }

    return {
      success: true,
      filePath: latestPath,
      entryCount: snapshot.entryCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to export policyId ${policyId}: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
