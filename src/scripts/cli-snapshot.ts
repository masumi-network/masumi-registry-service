import 'dotenv/config';
import { Command } from 'commander';
import { Network } from '@prisma/client';
import { exportSnapshot, importSnapshot } from './snapshot-operations';
import { cleanupDB, initDB } from '@/utils/db';

const program = new Command();

program
  .name('snapshot')
  .description('Registry snapshot export and import tool')
  .version('1.0.0');

program
  .command('export')
  .description('Export registry snapshot to JSON file')
  .option('-n, --network <network>', 'Filter by network (preprod|mainnet)')
  .option(
    '-o, --output <file>',
    'Output file path',
    'snapshots/registry-snapshot.json'
  )
  .option('--include-invalid', 'Include invalid/deregistered entries', false)
  .action(async (options) => {
    try {
      await initDB();

      if (options.network) {
        const network =
          options.network.charAt(0).toUpperCase() +
          options.network.slice(1).toLowerCase();
        if (network !== 'Preprod' && network !== 'Mainnet') {
          console.error('❌ Invalid network. Must be "preprod" or "mainnet"');
          process.exit(1);
        }
        options.network = network as Network;
      }

      await exportSnapshot({
        network: options.network,
        output: options.output,
        includeInvalid: options.includeInvalid,
      });

      await cleanupDB();
      process.exit(0);
    } catch (error) {
      console.error('❌ Export failed:', error);
      await cleanupDB();
      process.exit(1);
    }
  });

program
  .command('import')
  .description('Import registry snapshot from JSON file')
  .requiredOption('-i, --input <file>', 'Input snapshot file path')
  .option('--skip-existing', 'Skip entries that already exist', false)
  .option('--dry-run', 'Preview without making changes', false)
  .action(async (options) => {
    try {
      await initDB();

      await importSnapshot({
        input: options.input,
        skipExisting: options.skipExisting,
        dryRun: options.dryRun,
      });

      await cleanupDB();
      process.exit(0);
    } catch (error) {
      console.error('❌ Import failed:', error);
      await cleanupDB();
      process.exit(1);
    }
  });

program.parse();
