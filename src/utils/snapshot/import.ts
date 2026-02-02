import * as fs from 'fs/promises';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import { validateSnapshot } from './schema';
import type { Snapshot, ImportResult } from './types';

export async function importSnapshotForSource(
  sourceId: string,
  snapshot: Snapshot,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const source = await prisma.registrySource.findUniqueOrThrow({
    where: { id: sourceId },
  });

  if (snapshot.network !== source.network) {
    throw new Error(
      `Network mismatch: snapshot=${snapshot.network}, source=${source.network}`
    );
  }

  if (snapshot.policyId !== source.policyId) {
    throw new Error(
      `PolicyId mismatch: snapshot=${snapshot.policyId}, source=${source.policyId}`
    );
  }

  if (snapshot.version !== '1.0.0') {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  if (snapshot.entries.length !== snapshot.entryCount) {
    throw new Error(
      `Entry count mismatch: array has ${snapshot.entries.length}, metadata says ${snapshot.entryCount}`
    );
  }

  if (options.dryRun) {
    const existingCount = await prisma.registryEntry.count({
      where: { registrySourceId: source.id },
    });

    if (existingCount > 0) {
      return {
        success: false,
        skipped: true,
        reason: `Source already has ${existingCount} entries. Import only allowed on empty sources.`,
      };
    }

    return {
      success: true,
      dryRun: true,
      wouldImport: snapshot.entries.length,
    };
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const existingCount = await tx.registryEntry.count({
        where: { registrySourceId: source.id },
      });

      if (existingCount > 0) {
        return {
          success: false,
          skipped: true,
          reason: `Source already has ${existingCount} entries. Import only allowed on empty sources.`,
        } as ImportResult;
      }

      for (const entry of snapshot.entries) {
        const capabilityConnect = entry.capability
          ? {
              connectOrCreate: {
                where: {
                  name_version: {
                    name: entry.capability.name,
                    version: entry.capability.version,
                  },
                },
                create: {
                  name: entry.capability.name,
                  version: entry.capability.version,
                  description: entry.capability.description,
                },
              },
            }
          : undefined;

        const pricingCreate =
          entry.agentPricing.pricingType === 'Free'
            ? { pricingType: 'Free' as const }
            : {
                pricingType: 'Fixed' as const,
                FixedPricing: {
                  create: {
                    Amounts: {
                      createMany: {
                        data: entry.agentPricing.fixedPricing!.amounts.map(
                          (a) => ({
                            amount: BigInt(a.amount),
                            unit: a.unit,
                          })
                        ),
                      },
                    },
                  },
                },
              };

        await tx.registryEntry.create({
          data: {
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
            lastUptimeCheck: new Date(entry.lastUptimeCheck),
            uptimeCount: entry.uptimeCount,
            uptimeCheckCount: entry.uptimeCheckCount,
            status: entry.status,
            statusUpdatedAt: new Date(entry.statusUpdatedAt),
            paymentType: entry.paymentType,
            metadataVersion: entry.metadataVersion,
            RegistrySource: { connect: { id: source.id } },
            Capability: capabilityConnect,
            AgentPricing: { create: pricingCreate },
            ExampleOutput:
              entry.exampleOutputs.length > 0
                ? { createMany: { data: entry.exampleOutputs } }
                : undefined,
          },
        });
      }

      await tx.registrySource.update({
        where: { id: source.id },
        data: {
          lastTxId: snapshot.lastTxId,
          lastCheckedPage: snapshot.lastCheckedPage,
        },
      });

      return {
        success: true,
        imported: snapshot.entries.length,
        syncProgress: {
          lastTxId: snapshot.lastTxId,
          lastCheckedPage: snapshot.lastCheckedPage,
        },
      } as ImportResult;
    },
    {
      maxWait: 30000,
      timeout: 120000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  return result;
}

export async function importSnapshotsForConfiguredSources(
  snapshotDir: string = './snapshots',
  options: { dryRun?: boolean } = {}
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  const sources = await prisma.registrySource.findMany();

  if (sources.length === 0) {
    logger.info('No registry sources configured, nothing to import');
    return results;
  }

  for (const source of sources) {
    const filename = `${source.network.toLowerCase()}_${source.policyId}.json`;
    const filePath = path.join(snapshotDir, filename);

    try {
      await fs.access(filePath);
    } catch {
      logger.info(`No snapshot file found for ${filename}, skipping`);
      results.push({
        success: false,
        skipped: true,
        reason: `Snapshot file not found: ${filename}`,
      });
      continue;
    }

    try {
      logger.info(`Importing snapshot from ${filePath}`);

      // Read and parse
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate schema
      const validation = validateSnapshot(parsed);
      if (!validation.success) {
        const errorMessages = validation.errors?.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        throw new Error(`Invalid snapshot: ${errorMessages}`);
      }

      const snapshot = validation.data as Snapshot;

      // Import
      const result = await importSnapshotForSource(
        source.id,
        snapshot,
        options
      );

      if (result.success) {
        logger.info(
          `Imported ${result.imported ?? result.wouldImport} entries for ${source.network} ${source.policyId}`
        );
      } else if (result.skipped) {
        logger.warn(`Skipped ${source.policyId}: ${result.reason}`);
      }

      results.push(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to import ${filePath}: ${errorMessage}`);
      results.push({
        success: false,
        reason: errorMessage,
      });
    }
  }

  return results;
}

export async function importSnapshotFile(
  filePath: string,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    const validation = validateSnapshot(parsed);
    if (!validation.success) {
      const errorMessages = validation.errors?.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new Error(`Invalid snapshot: ${errorMessages}`);
    }

    const snapshot = validation.data as Snapshot;

    const source = await prisma.registrySource.findFirst({
      where: {
        network: snapshot.network,
        policyId: snapshot.policyId,
      },
    });

    if (!source) {
      return {
        success: false,
        reason: `No registry source configured for ${snapshot.network} ${snapshot.policyId}`,
      };
    }

    return await importSnapshotForSource(source.id, snapshot, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to import ${filePath}: ${errorMessage}`);
    return {
      success: false,
      reason: errorMessage,
    };
  }
}
