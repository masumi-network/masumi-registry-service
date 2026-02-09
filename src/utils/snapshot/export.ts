import * as fs from 'fs/promises';
import * as path from 'path';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import type {
  Snapshot,
  SnapshotEntry,
  SnapshotAgentPricing,
  ExportResult,
} from './types';

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
    };
    ExampleOutput: { name: string; mimeType: string; url: string }[];
  }
): SnapshotEntry {
  // Build pricing object
  const agentPricing: SnapshotAgentPricing =
    entry.AgentPricing.pricingType === 'Free'
      ? { pricingType: 'Free', fixedPricing: null }
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
    apiBaseUrl: entry.apiBaseUrl,
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

async function exportSnapshotForSource(sourceId: string): Promise<Snapshot> {
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
    },
    orderBy: { assetIdentifier: 'asc' },
  });

  const snapshotEntries = entries.map(mapEntryToSnapshot);

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    network: source.network,
    policyId: source.policyId,
    lastTxId: source.lastTxId,
    lastCheckedPage: source.lastCheckedPage,
    entryCount: snapshotEntries.length,
    entries: snapshotEntries,
  };
}

async function writeSnapshotFiles(
  snapshot: Snapshot,
  network: string,
  policyId: string,
  outputDir: string
): Promise<{ timestampedPath: string; latestPath: string }> {
  const json = JSON.stringify(snapshot, bigIntReplacer, 2);

  const dateStr = new Date().toISOString().split('T')[0];
  const timestampedFilename = `${network.toLowerCase()}_${policyId}_${dateStr}.json`;
  const timestampedPath = path.join(outputDir, timestampedFilename);
  await fs.writeFile(timestampedPath, json, 'utf-8');

  const latestFilename = `${network.toLowerCase()}_${policyId}.json`;
  const latestPath = path.join(outputDir, latestFilename);
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

      const snapshot = await exportSnapshotForSource(source.id);

      const { timestampedPath, latestPath } = await writeSnapshotFiles(
        snapshot,
        source.network,
        source.policyId,
        outputDir
      );

      logger.info(
        `Exported ${snapshot.entryCount} entries to ${timestampedPath} and ${latestPath}`
      );

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
    const snapshot = await exportSnapshotForSource(source.id);

    const { timestampedPath, latestPath } = await writeSnapshotFiles(
      snapshot,
      source.network,
      policyId,
      outputDir
    );

    logger.info(
      `Exported ${snapshot.entryCount} entries to ${timestampedPath} and ${latestPath}`
    );

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
