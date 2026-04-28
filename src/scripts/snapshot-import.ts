import * as dotenv from 'dotenv';
dotenv.config();

import { parseArgs } from 'util';
import {
  importSnapshotsForConfiguredSources,
  importSnapshotFile,
} from '@/utils/snapshot';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';

function printHelp() {
  logger.info(`
Registry Snapshot Import

Usage:
  npm run snapshot:import [-- options]

Options:
  --file <path>         Import specific snapshot file
  --snapshot-dir <path> Snapshot directory (default: ./snapshots)
  --dry-run             Validate without importing
  --help                Show this help message

Examples:
  npm run snapshot:import
  npm run snapshot:import -- --dry-run
  npm run snapshot:import -- --file ./snapshots/preprod_7e8bdaf2.json
`);
}

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      'snapshot-dir': { type: 'string', default: './snapshots' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  return {
    filePath: values.file,
    snapshotDir: values['snapshot-dir'] ?? './snapshots',
    dryRun: values['dry-run'] ?? false,
    help: values.help ?? false,
  };
}

async function importSingleFile(filePath: string, dryRun: boolean) {
  logger.info(`Importing from: ${filePath}`);
  const result = await importSnapshotFile(filePath, { dryRun });

  if (result.success) {
    if (result.dryRun) {
      logger.info(`✓ Would import ${result.wouldImport} entries`);
    } else {
      logger.info(`✓ Imported ${result.imported} entries`);
      if (result.syncProgress) {
        logger.info(`  Sync progress updated:`);
        logger.info(
          `    lastTxId: ${result.syncProgress.lastTxId ?? '(none)'}`
        );
        logger.info(
          `    lastCheckedPage: ${result.syncProgress.lastCheckedPage}`
        );
      }
    }
  } else if (result.skipped) {
    logger.info(`⚠ Skipped: ${result.reason}`);
  } else {
    logger.error(`✗ Import failed: ${result.reason}`);
    process.exit(1);
  }
}

async function importFromDirectory(snapshotDir: string, dryRun: boolean) {
  logger.info(`Snapshot directory: ${snapshotDir}`);
  const results = await importSnapshotsForConfiguredSources(snapshotDir, {
    dryRun,
  });

  const successful = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success && !r.skipped);

  logger.info(`\nImport complete:`);
  logSuccessSummary(successful, dryRun);
  logSkippedSummary(skipped);
  logFailedSummary(failed);
}

function logSuccessSummary(
  successful: { wouldImport?: number; imported?: number }[],
  dryRun: boolean
) {
  if (dryRun) {
    const totalWouldImport = successful.reduce(
      (sum, r) => sum + (r.wouldImport ?? 0),
      0
    );
    logger.info(
      `  ✓ Would import ${totalWouldImport} entries in ${successful.length} sources`
    );
  } else {
    const totalImported = successful.reduce(
      (sum, r) => sum + (r.imported ?? 0),
      0
    );
    logger.info(
      `  ✓ ${successful.length} successful (${totalImported} entries)`
    );
  }
}

function logSkippedSummary(skipped: { reason?: string }[]) {
  if (skipped.length > 0) {
    logger.info(`  ⚠ ${skipped.length} skipped:`);
    for (const s of skipped) {
      logger.info(`    - ${s.reason}`);
    }
  }
}

function logFailedSummary(failed: { reason?: string }[]) {
  if (failed.length > 0) {
    logger.info(`  ✗ ${failed.length} failed:`);
    for (const f of failed) {
      logger.info(`    - ${f.reason}`);
    }
    process.exit(1);
  }
}

async function main() {
  const { filePath, snapshotDir, dryRun, help } = parseCliArgs();

  if (help) {
    printHelp();
    process.exit(0);
  }

  logger.info('Starting snapshot import...');
  if (dryRun) {
    logger.info('DRY RUN MODE - no database changes will be made');
  }

  try {
    if (filePath) {
      await importSingleFile(filePath, dryRun);
    } else {
      await importFromDirectory(snapshotDir, dryRun);
    }
  } catch (error) {
    logger.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
