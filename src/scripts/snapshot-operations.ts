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

export async function exportSnapshot(options: ExportOptions): Promise<void> {
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
        RegistrySource: {
          select: {
            type: true,
            network: true,
            policyId: true,
          },
        },
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
          type: entry.RegistrySource.type,
          network: entry.RegistrySource.network,
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
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

    logger.info(
      `✅ Exported ${snapshot.totalEntries} entries to ${outputPath}`
    );
    console.log(
      `✅ Exported ${snapshot.totalEntries} entries to ${outputPath}`
    );
  } catch (error) {
    logger.error('Error exporting snapshot', { error });
    console.error('❌ Error exporting snapshot:', error);
    throw error;
  }
}

export async function importSnapshot(options: ImportOptions): Promise<void> {
  try {
    logger.info('Starting snapshot import', { options });

    // Read snapshot file
    const fileContent = fs.readFileSync(options.input, 'utf8');
    const snapshot: Snapshot = JSON.parse(fileContent);

    // Validate snapshot format
    validateSnapshot(snapshot);

    console.log(
      `📦 Importing ${snapshot.totalEntries} entries from ${options.input}`
    );
    logger.info(`Importing ${snapshot.totalEntries} entries`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Process each entry
    for (const entry of snapshot.entries) {
      try {
        // Check if entry already exists
        const existing = await prisma.registryEntry.findUnique({
          where: { assetIdentifier: entry.assetIdentifier },
        });

        if (existing) {
          if (options.skipExisting) {
            console.log(`⏭️  Skipping existing: ${entry.assetIdentifier}`);
            skipped++;
            continue;
          } else {
            console.log(`❌ Duplicate found: ${entry.assetIdentifier}`);
            errors++;
            continue;
          }
        }

        // Find RegistrySource
        const registrySource = await prisma.registrySource.findUnique({
          where: {
            type_policyId: {
              type: entry.registrySource.type,
              policyId: entry.registrySource.policyId,
            },
          },
        });

        if (!registrySource) {
          console.log(
            `❌ RegistrySource not found for ${entry.assetIdentifier}`
          );
          console.log(
            `   Type: ${entry.registrySource.type}, PolicyId: ${entry.registrySource.policyId}`
          );
          console.log(
            `   Please create this RegistrySource first using: npm run prisma:seed`
          );
          errors++;
          continue;
        }

        // Dry run mode - just preview
        if (options.dryRun) {
          console.log(`✓ Would import: ${entry.assetIdentifier}`);
          imported++;
          continue;
        }

        // Import in transaction
        await importEntry(entry, registrySource.id);

        console.log(`✅ Imported: ${entry.assetIdentifier}`);
        imported++;
      } catch (error) {
        console.error(`❌ Error importing ${entry.assetIdentifier}:`, error);
        logger.error('Error importing entry', {
          assetIdentifier: entry.assetIdentifier,
          error,
        });
        errors++;
      }
    }

    // Print summary
    console.log(`\n📊 Import Summary:`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📦 Total: ${snapshot.totalEntries}`);

    logger.info('Import completed', {
      imported,
      skipped,
      errors,
      total: snapshot.totalEntries,
    });
  } catch (error) {
    logger.error('Error importing snapshot', { error });
    console.error('❌ Error importing snapshot:', error);
    throw error;
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
