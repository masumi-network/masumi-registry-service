import * as dotenv from 'dotenv';
dotenv.config();

import { parseArgs } from 'util';
import {
  importSnapshotsForConfiguredSources,
  importSnapshotFile,
} from '@/utils/snapshot';
import { prisma } from '@/utils/db';

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      'snapshot-dir': { type: 'string', default: './snapshots' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(`
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
    process.exit(0);
  }

  const snapshotDir = values['snapshot-dir'] ?? './snapshots';
  const filePath = values.file;
  const dryRun = values['dry-run'] ?? false;

  console.log('Starting snapshot import...');
  if (dryRun) {
    console.log('DRY RUN MODE - no database changes will be made');
  }

  try {
    if (filePath) {
      console.log(`Importing from: ${filePath}`);
      const result = await importSnapshotFile(filePath, { dryRun });

      if (result.success) {
        if (result.dryRun) {
          console.log(`✓ Would import ${result.wouldImport} entries`);
        } else {
          console.log(`✓ Imported ${result.imported} entries`);
          if (result.syncProgress) {
            console.log(`  Sync progress updated:`);
            console.log(
              `    lastTxId: ${result.syncProgress.lastTxId ?? '(none)'}`
            );
            console.log(
              `    lastCheckedPage: ${result.syncProgress.lastCheckedPage}`
            );
          }
        }
      } else if (result.skipped) {
        console.log(`⚠ Skipped: ${result.reason}`);
      } else {
        console.error(`✗ Import failed: ${result.reason}`);
        process.exit(1);
      }
    } else {
      console.log(`Snapshot directory: ${snapshotDir}`);
      const results = await importSnapshotsForConfiguredSources(snapshotDir, {
        dryRun,
      });

      const successful = results.filter((r) => r.success && !r.skipped);
      const skipped = results.filter((r) => r.skipped);
      const failed = results.filter((r) => !r.success && !r.skipped);

      console.log(`\nImport complete:`);

      if (dryRun) {
        const totalWouldImport = successful.reduce(
          (sum, r) => sum + (r.wouldImport ?? 0),
          0
        );
        console.log(
          `  ✓ Would import ${totalWouldImport} entries in ${successful.length} sources`
        );
      } else {
        const totalImported = successful.reduce(
          (sum, r) => sum + (r.imported ?? 0),
          0
        );
        console.log(
          `  ✓ ${successful.length} successful (${totalImported} entries)`
        );
      }

      if (skipped.length > 0) {
        console.log(`  ⚠ ${skipped.length} skipped:`);
        for (const s of skipped) {
          console.log(`    - ${s.reason}`);
        }
      }

      if (failed.length > 0) {
        console.log(`  ✗ ${failed.length} failed:`);
        for (const f of failed) {
          console.log(`    - ${f.reason}`);
        }
      }
    }
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
