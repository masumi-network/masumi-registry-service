import * as dotenv from 'dotenv';
dotenv.config();

import { parseArgs } from 'util';
import { exportAllSnapshots, exportSnapshotByPolicyId } from '@/utils/snapshot';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';

async function main() {
  const { values } = parseArgs({
    options: {
      'policy-id': { type: 'string' },
      'output-dir': { type: 'string', default: './snapshots' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    logger.info(`
Registry Snapshot Export

Usage:
  npm run snapshot:export [-- options]

Options:
  --policy-id <hex>     Export only this policy ID
  --output-dir <path>   Output directory (default: ./snapshots)
  --help                Show this help message

Examples:
  npm run snapshot:export
  npm run snapshot:export -- --policy-id 7e8bdaf2b2b919a3a4b94002cafb50086c0c845fe535d07a77ab7f77
  npm run snapshot:export -- --output-dir ./backup
`);
    process.exit(0);
  }

  const outputDir = values['output-dir'] ?? './snapshots';
  const policyId = values['policy-id'];

  logger.info('Starting snapshot export...');
  logger.info(`Output directory: ${outputDir}`);

  try {
    if (policyId) {
      logger.info(`Exporting policy ID: ${policyId}`);
      const result = await exportSnapshotByPolicyId(policyId, outputDir);

      if (result.success) {
        logger.info(
          `✓ Exported ${result.entryCount} entries to ${result.filePath}`
        );
      } else {
        logger.error(`✗ Export failed: ${result.error}`);
        process.exit(1);
      }
    } else {
      const results = await exportAllSnapshots(outputDir);

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      logger.info(`\nExport complete:`);
      logger.info(`  ✓ ${successful.length} successful`);
      if (failed.length > 0) {
        logger.info(`  ✗ ${failed.length} failed`);
        for (const f of failed) {
          logger.info(`    - ${f.error}`);
        }
      }

      const totalEntries = successful.reduce(
        (sum, r) => sum + (r.entryCount ?? 0),
        0
      );
      logger.info(`  Total entries exported: ${totalEntries}`);

      if (failed.length > 0) {
        process.exit(1);
      }
    }
  } catch (error) {
    logger.error('Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
