import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import { PricingType } from '@prisma/client';
import fs from 'fs';
import type {
  ExportOptions,
  ImportOptions,
  Snapshot,
  SnapshotEntry,
} from '../utils/snapshot/snapshot-types';
import { SNAPSHOT_VERSION } from '../utils/snapshot/snapshot-types';
import { validateSnapshot } from '../utils/snapshot/snapshot-validator';

export interface ExportResult {
  success: boolean;
  outputPath?: string;
  totalEntries?: number;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  stats?: {
    imported: number;
    skipped: number;
    errors: number;
    total: number;
  };
  errorDetails?: Array<{
    assetIdentifier: string;
    error: string;
  }>;
  error?: string;
}

export async function exportSnapshot(
  options: ExportOptions
): Promise<ExportResult> {
  try {
    logger.info('Starting snapshot export', { options });

    // Fetch all registry entries with relations
    const entries = await prisma.registryEntry.findMany({
      where: {
        status: options.includeInvalid
          ? undefined
          : { in: ['Online', 'Offline'] },
        RegistrySource: options.network
          ? { network: options.network }
          : undefined,
      },
      include: {
        AgentPricing: {
          include: {
            FixedPricing: {
              include: { Amounts: true },
            },
          },
        },
        Capability: true,
        ExampleOutput: true,
        RegistrySource: true,
      },
    });

    logger.info(`Found ${entries.length} entries to export`);

    // Transform to snapshot format
    const snapshot: Snapshot = {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      network: options.network || null,
      totalEntries: entries.length,
      entries: entries.map((entry) => ({
        // Core data
        name: entry.name,
        apiBaseUrl: entry.apiBaseUrl,
        description: entry.description,
        authorName: entry.authorName,
        authorContactEmail: entry.authorContactEmail,
        authorContactOther: entry.authorContactOther,
        authorOrganization: entry.authorOrganization,
        privacyPolicy: entry.privacyPolicy,
        termsAndCondition: entry.termsAndCondition,
        otherLegal: entry.otherLegal,
        image: entry.image,
        tags: entry.tags,
        assetIdentifier: entry.assetIdentifier,
        paymentType: entry.paymentType,
        metadataVersion: entry.metadataVersion,

        // Registry source (for matching during import)
        registrySource: {
          lastCheckedPage: entry.RegistrySource.lastCheckedPage,
          policyId: entry.RegistrySource.policyId,
        },

        capability: entry.Capability
          ? {
              name: entry.Capability.name,
              version: entry.Capability.version,
              description: entry.Capability.description,
            }
          : null,

        pricing: {
          type: entry.AgentPricing.pricingType,
          amounts:
            entry.AgentPricing.FixedPricing?.Amounts.map((a) => ({
              amount: a.amount.toString(),
              unit: a.unit,
            })) || [],
        },

        agentOutputs: entry.ExampleOutput.map((ex) => ({
          name: ex.name,
          mimeType: ex.mimeType,
          url: ex.url,
        })),
      })),
    };

    const outputPath = options.output || 'snapshots/registry-snapshot.json';

    // Ensure directory exists
    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

    logger.info(`Exported ${snapshot.totalEntries} entries to ${outputPath}`);

    return {
      success: true,
      outputPath,
      totalEntries: snapshot.totalEntries,
    };
  } catch (error) {
    logger.error('Error exporting snapshot', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function importSnapshot(
  options: ImportOptions
): Promise<ImportResult> {
  try {
    logger.info('Starting snapshot import', { options });

    // Read snapshot file
    const fileContent = fs.readFileSync(options.input, 'utf8');
    const snapshot: Snapshot = JSON.parse(fileContent);

    // Validate snapshot format
    validateSnapshot(snapshot);

    logger.info(`Importing ${snapshot.totalEntries} entries`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ assetIdentifier: string; error: string }> = [];

    // Process each entry
    for (const entry of snapshot.entries) {
      try {
        // Check if entry already exists
        const existing = await prisma.registryEntry.findUnique({
          where: { assetIdentifier: entry.assetIdentifier },
        });

        if (existing) {
          if (options.skipExisting) {
            logger.debug(`Skipping existing: ${entry.assetIdentifier}`);
            skipped++;
            continue;
          } else {
            const error = `Duplicate found: ${entry.assetIdentifier}`;
            logger.warn(error);
            errors++;
            errorDetails.push({
              assetIdentifier: entry.assetIdentifier,
              error,
            });
            continue;
          }
        }

        // Find RegistrySource by policyId
        const registrySource = await prisma.registrySource.findFirst({
          where: { policyId: entry.registrySource.policyId },
        });

        if (!registrySource) {
          const error = `RegistrySource not found for policyId: ${entry.registrySource.policyId}`;
          logger.error(error, { assetIdentifier: entry.assetIdentifier });
          errors++;
          errorDetails.push({
            assetIdentifier: entry.assetIdentifier,
            error,
          });
          continue;
        }

        // Dry run mode - just preview
        if (options.dryRun) {
          logger.debug(`Would import: ${entry.assetIdentifier}`);
          imported++;
          continue;
        }

        // Import in transaction
        await importEntry(entry, registrySource.id);

        logger.debug(`Imported: ${entry.assetIdentifier}`);
        imported++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Error importing entry', {
          assetIdentifier: entry.assetIdentifier,
          error: errorMsg,
        });
        errors++;
        errorDetails.push({
          assetIdentifier: entry.assetIdentifier,
          error: errorMsg,
        });
      }
    }

    logger.info('Import completed', {
      imported,
      skipped,
      errors,
      total: snapshot.totalEntries,
    });

    return {
      success: true,
      stats: {
        imported,
        skipped,
        errors,
        total: snapshot.totalEntries,
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error importing snapshot', { error: errorMsg });
    return {
      success: false,
      error: errorMsg,
    };
  }
}

async function importEntry(
  entry: SnapshotEntry,
  registrySourceId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Upsert Capability if present
    let capabilityId: string | null = null;
    if (entry.capability) {
      const capability = await tx.capability.upsert({
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
        update: {},
      });
      capabilityId = capability.id;
    }

    // Create AgentPricing
    const agentPricing = await tx.agentPricing.create({
      data: {
        pricingType: entry.pricing.type,
        FixedPricing:
          entry.pricing.type === PricingType.Fixed &&
          entry.pricing.amounts.length > 0
            ? {
                create: {
                  Amounts: {
                    createMany: {
                      data: entry.pricing.amounts.map((a) => ({
                        amount: BigInt(a.amount),
                        unit: a.unit,
                      })),
                    },
                  },
                },
              }
            : undefined,
      },
    });

    // Create RegistryEntry
    await tx.registryEntry.create({
      data: {
        name: entry.name,
        apiBaseUrl: entry.apiBaseUrl,
        description: entry.description,
        authorName: entry.authorName,
        authorContactEmail: entry.authorContactEmail,
        authorContactOther: entry.authorContactOther,
        authorOrganization: entry.authorOrganization,
        privacyPolicy: entry.privacyPolicy,
        termsAndCondition: entry.termsAndCondition,
        otherLegal: entry.otherLegal,
        image: entry.image,
        tags: entry.tags,
        assetIdentifier: entry.assetIdentifier,
        paymentType: entry.paymentType,
        metadataVersion: entry.metadataVersion,

        // Reset health data
        status: 'Offline',
        lastUptimeCheck: new Date(),
        uptimeCount: 0,
        uptimeCheckCount: 0,

        // Relations
        registrySourceId: registrySourceId,
        capabilitiesId: capabilityId,
        agentPricingId: agentPricing.id,

        // Agent output samples
        ExampleOutput:
          entry.agentOutputs.length > 0
            ? {
                createMany: {
                  data: entry.agentOutputs,
                },
              }
            : undefined,
      },
    });
  });
}
