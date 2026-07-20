import * as fs from 'fs/promises';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import { validateSnapshot, validatePaymentSources } from './schema';
import {
  SNAPSHOT_VERSION,
  type Snapshot,
  type PaymentSourcesSnapshot,
  type ImportResult,
} from './types';
import { validateSnapshotPricingLayout } from './pricing-layout';

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024; // 100 MB

// Rows per createMany statement. Keeps each INSERT well under Postgres' 65535
// bound-parameter limit (the widest table, RegistryEntry, has ~24 columns) while
// still collapsing thousands of inserts into a handful of round-trips.
const INSERT_CHUNK_SIZE = 1000;

// Unambiguous composite key for a capability's unique [name, version] pair.
const capabilityKey = (name: string, version: string) =>
  `${name}\u0000${version}`;

async function createManyChunked<T>(
  create: (data: T[]) => Promise<unknown>,
  rows: T[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    await create(rows.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

// The companion payment-sources file lives next to the entries snapshot with a
// `.payment-sources.json` suffix, e.g. `preprod_<policy>.payment-sources.json`.
function paymentSourcesPathFor(snapshotPath: string): string {
  return snapshotPath.replace(/\.json$/, '.payment-sources.json');
}

// Loads and validates the optional companion payment-sources file. Returns null
// when it is absent (a snapshot without V2 payment sources); throws when present
// but invalid.
async function loadPaymentSourcesFile(
  snapshotPath: string
): Promise<PaymentSourcesSnapshot | null> {
  const filePath = paymentSourcesPathFor(snapshotPath);

  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  const { size } = await fs.stat(filePath);
  if (size > MAX_SNAPSHOT_BYTES) {
    throw new Error(
      `Payment-sources file too large: ${size} bytes (max ${MAX_SNAPSHOT_BYTES})`
    );
  }

  const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  const validation = validatePaymentSources(parsed);
  if (!validation.success) {
    const errorMessages = validation.errors?.issues
      .map((e) => `${e.path.map(String).join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`Invalid payment-sources file: ${errorMessages}`);
  }

  return validation.data as PaymentSourcesSnapshot;
}

async function importSnapshotForSource(
  sourceId: string,
  snapshot: Snapshot,
  options: { dryRun?: boolean; paymentSources?: PaymentSourcesSnapshot } = {}
): Promise<ImportResult> {
  const source = await prisma.registrySource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  const paymentSources = options.paymentSources;

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

  if (
    paymentSources &&
    (paymentSources.network !== source.network ||
      paymentSources.policyId !== source.policyId)
  ) {
    throw new Error(
      `Payment-sources file mismatch: ${paymentSources.network} ${paymentSources.policyId} ` +
        `does not match source ${source.network} ${source.policyId}`
    );
  }

  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  if (snapshot.entries.length !== snapshot.entryCount) {
    throw new Error(
      `Entry count mismatch: array has ${snapshot.entries.length}, metadata says ${snapshot.entryCount}`
    );
  }

  validateSnapshotPricingLayout(snapshot, paymentSources ?? null);

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

      // Bulk-insert instead of one nested create() per entry: a per-entry loop
      // issues ~5 sequential round-trips each, so a few thousand entries blow
      // past the transaction timeout over a high-latency (e.g. serverless) DB
      // connection. We generate the FK ids client-side (cuid) and fan the data
      // out into a handful of createMany calls, ordered so every FK target is
      // written before the row that references it.

      // 1. Capabilities are shared and deduped on [name, version]. Insert the
      // distinct set (skipping any that already exist from another source), then
      // read them back to map each [name, version] to its id for the entries.
      const distinctCapabilities = new Map<
        string,
        { name: string; version: string; description: string | null }
      >();
      for (const entry of snapshot.entries) {
        if (entry.capability) {
          distinctCapabilities.set(
            capabilityKey(entry.capability.name, entry.capability.version),
            entry.capability
          );
        }
      }

      const capabilityIdByKey = new Map<string, string>();
      if (distinctCapabilities.size > 0) {
        await createManyChunked(
          (data) => tx.capability.createMany({ data, skipDuplicates: true }),
          [...distinctCapabilities.values()]
        );

        const capabilityRows = await tx.capability.findMany({
          where: {
            name: { in: [...distinctCapabilities.values()].map((c) => c.name) },
          },
          select: { id: true, name: true, version: true },
        });
        for (const cap of capabilityRows) {
          const key = capabilityKey(cap.name, cap.version);
          if (distinctCapabilities.has(key)) {
            capabilityIdByKey.set(key, cap.id);
          }
        }
      }

      // 2. Build the flat row sets, wiring FKs via client-generated ids.
      const fixedPricingRows: Prisma.AgentFixedPricingCreateManyInput[] = [];
      const amountRows: {
        agentFixedPricingId: string;
        amount: bigint;
        unit: string;
      }[] = [];
      const agentPricingRows: Prisma.AgentPricingCreateManyInput[] = [];
      const entryRows: Prisma.RegistryEntryCreateManyInput[] = [];
      const exampleOutputRows: Prisma.ExampleOutputCreateManyInput[] = [];
      const supportedPaymentSourceRows: Prisma.SupportedPaymentSourceCreateManyInput[] =
        [];

      // assetIdentifier -> generated entry id, used to attach the companion
      // payment-sources file back to its entries.
      const entryIdByAsset = new Map<string, string>();

      const addPricingRows = (params: {
        pricingType: 'Fixed' | 'Free' | 'Dynamic';
        amounts?: { amount: string; unit: string }[];
        registryEntryId?: string;
        supportedPaymentSourceId?: string;
      }) => {
        const agentPricingId = createId();
        agentPricingRows.push({
          id: agentPricingId,
          pricingType: params.pricingType,
          registryEntryId: params.registryEntryId,
          supportedPaymentSourceId: params.supportedPaymentSourceId,
        });
        if (params.pricingType !== 'Fixed') return;

        const agentFixedPricingId = createId();
        fixedPricingRows.push({
          id: agentFixedPricingId,
          agentPricingId,
        });
        for (const amount of params.amounts ?? []) {
          amountRows.push({
            agentFixedPricingId,
            amount: BigInt(amount.amount),
            unit: amount.unit,
          });
        }
      };

      for (const entry of snapshot.entries) {
        const entryId = createId();
        entryIdByAsset.set(entry.assetIdentifier, entryId);
        entryRows.push({
          id: entryId,
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
          registrySourceId: source.id,
          capabilitiesId: entry.capability
            ? capabilityIdByKey.get(
                capabilityKey(entry.capability.name, entry.capability.version)
              )
            : null,
        });
        if (entry.agentPricing != null) {
          addPricingRows({
            pricingType: entry.agentPricing.pricingType,
            amounts: entry.agentPricing.fixedPricing?.amounts,
            registryEntryId: entryId,
          });
        }

        for (const output of entry.exampleOutputs) {
          exampleOutputRows.push({ registryEntryId: entryId, ...output });
        }
      }

      // Optional companion file: V2 payment sources, matched back to entries by
      // assetIdentifier. Unknown identifiers indicate incompatible or corrupted
      // snapshot files and must fail instead of silently dropping payment rails.
      for (const paymentEntry of paymentSources?.entries ?? []) {
        const registryEntryId = entryIdByAsset.get(
          paymentEntry.assetIdentifier
        );
        if (registryEntryId == null) {
          throw new Error(
            `Payment-sources entry ${paymentEntry.assetIdentifier} has no matching registry entry`
          );
        }
        for (const paymentSource of paymentEntry.sources) {
          const supportedPaymentSourceId = createId();
          const fixedPrice =
            paymentSource.pricing.pricingType === 'Fixed'
              ? paymentSource.pricing.fixed
              : undefined;
          const dynamicAsset =
            paymentSource.pricing.pricingType === 'Dynamic'
              ? paymentSource.pricing.dynamic?.[0]
              : undefined;
          supportedPaymentSourceRows.push({
            id: supportedPaymentSourceId,
            registryEntryId,
            chain: paymentSource.chain,
            network: paymentSource.network,
            sourceIndex: paymentSource.sourceIndex,
            paymentSourceType: paymentSource.paymentSourceType,
            address: paymentSource.address,
            scheme: paymentSource.scheme,
            dynamicAsset: dynamicAsset?.asset ?? null,
            dynamicDecimals: dynamicAsset?.decimals ?? null,
            fixedDecimals: fixedPrice?.[0]?.decimals ?? null,
            payTo: paymentSource.payTo,
            resource: paymentSource.resource,
            ...(paymentSource.extra != null
              ? { extra: paymentSource.extra as Prisma.InputJsonValue }
              : {}),
          });
          addPricingRows({
            pricingType: paymentSource.pricing.pricingType,
            amounts: fixedPrice?.map((price) => ({
              amount: price.amount,
              unit: price.asset,
            })),
            supportedPaymentSourceId,
          });
        }
      }
      // 3. Insert in FK-dependency order.
      await createManyChunked(
        (data) => tx.registryEntry.createMany({ data }),
        entryRows
      );
      await createManyChunked(
        (data) => tx.exampleOutput.createMany({ data }),
        exampleOutputRows
      );
      await createManyChunked(
        (data) => tx.supportedPaymentSource.createMany({ data }),
        supportedPaymentSourceRows
      );
      await createManyChunked(
        (data) => tx.agentPricing.createMany({ data }),
        agentPricingRows
      );
      await createManyChunked(
        (data) => tx.agentFixedPricing.createMany({ data }),
        fixedPricingRows
      );
      await createManyChunked(
        (data) => tx.unitValue.createMany({ data }),
        amountRows
      );
      if (supportedPaymentSourceRows.length > 0) {
        logger.info(
          `Imported ${supportedPaymentSourceRows.length} payment source(s) for ${source.network} ${source.policyId}`
        );
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

      const { size } = await fs.stat(filePath);
      if (size > MAX_SNAPSHOT_BYTES) {
        throw new Error(
          `Snapshot file too large: ${size} bytes (max ${MAX_SNAPSHOT_BYTES})`
        );
      }

      // Read and parse
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate schema
      const validation = validateSnapshot(parsed);
      if (!validation.success) {
        const errorMessages = validation.errors?.issues
          .map((e) => `${e.path.map(String).join('.')}: ${e.message}`)
          .join('; ');
        throw new Error(`Invalid snapshot: ${errorMessages}`);
      }

      const snapshot = validation.data as Snapshot;

      // Optional companion payment-sources file (V2).
      const paymentSources = await loadPaymentSourcesFile(filePath);

      // Import
      const result = await importSnapshotForSource(source.id, snapshot, {
        ...options,
        paymentSources: paymentSources ?? undefined,
      });

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
    const { size } = await fs.stat(filePath);
    if (size > MAX_SNAPSHOT_BYTES) {
      return {
        success: false,
        reason: `Snapshot file too large: ${size} bytes (max ${MAX_SNAPSHOT_BYTES})`,
      };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    const validation = validateSnapshot(parsed);
    if (!validation.success) {
      const errorMessages = validation.errors?.issues
        .map((e) => `${e.path.map(String).join('.')}: ${e.message}`)
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

    // Optional companion payment-sources file (V2).
    const paymentSources = await loadPaymentSourcesFile(filePath);

    return await importSnapshotForSource(source.id, snapshot, {
      ...options,
      paymentSources: paymentSources ?? undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to import ${filePath}: ${errorMessage}`);
    return {
      success: false,
      reason: errorMessage,
    };
  }
}
