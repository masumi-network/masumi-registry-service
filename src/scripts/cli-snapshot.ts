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
          const error = {
            error: 'Invalid network. Must be "preprod" or "mainnet"',
          };
          console.error(JSON.stringify(error, null, 2));
          await cleanupDB();
          process.exit(1);
        }
        options.network = network as Network;
      }

      const result = await exportSnapshot({
        network: options.network,
        output: options.output,
        includeInvalid: options.includeInvalid,
      });

      await cleanupDB();

      if (result.success) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      console.error(JSON.stringify(errorResponse, null, 2));
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

      const result = await importSnapshot({
        input: options.input,
        skipExisting: options.skipExisting,
        dryRun: options.dryRun,
      });

      await cleanupDB();

      if (result.success) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      console.error(JSON.stringify(errorResponse, null, 2));
      await cleanupDB();
      process.exit(1);
    }
  });

program.parse();
