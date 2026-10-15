import {
  updateLatestCardanoRegistryEntries,
  updateHealthCheck,
} from '@/services/cardano-registry/cardano-registry.service';
import { uptimeTracking } from '@/services/health-check';
import { updateX402Probes } from '@/services/x402-probe';
import { updateX402OpenApiDiscoveries } from '@/services/x402-openapi-discovery';
import { updateSuccessfulPurchaseIndex } from '@/services/purchase-indexer/purchase-indexer.service';
import { CONFIG } from '@/utils/config';
import { logger } from '@/utils/logger';
import { AsyncInterval } from '@/utils/async-interval';

const HEALTH_CHECK_EVENT_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let stopHandles: ReadonlyArray<() => Promise<void>> = [];
let isStopping = false;

async function init() {
  logger.log({
    level: 'info',
    message: 'Initialized event scheduler',
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // Check and register with no await in between, so stopSchedules() never
  // misses a job that has started.
  if (isStopping) return;
  stopHandles = [
    ...stopHandles,
    AsyncInterval.start(async () => {
      logger.info('Updating cardano registry entries');
      await updateLatestCardanoRegistryEntries();
      logger.info('Finished updating cardano registry entries');
    }, CONFIG.UPDATE_CARDANO_REGISTRY_INTERVAL * 1000),
  ];

  await new Promise((resolve) => setTimeout(resolve, 15000));
  if (isStopping) return;
  stopHandles = [
    ...stopHandles,
    AsyncInterval.start(async () => {
      logger.info('Updating health check');
      const start = new Date();
      await updateHealthCheck();
      logger.info(
        'Finished updating health check in ' +
          (new Date().getTime() - start.getTime()) / 1000 +
          's'
      );
    }, CONFIG.UPDATE_HEALTH_CHECK_INTERVAL * 1000),
    AsyncInterval.start(async () => {
      logger.info('Updating successful purchase index');
      await updateSuccessfulPurchaseIndex();
      logger.info('Finished updating successful purchase index');
    }, CONFIG.UPDATE_PURCHASE_INDEX_INTERVAL * 1000),
    AsyncInterval.start(async () => {
      logger.info('Probing x402 resources');
      await updateX402Probes({ shouldStop: () => isStopping });
    }, CONFIG.UPDATE_X402_PROBE_INTERVAL * 1000),
    AsyncInterval.start(async () => {
      logger.info('Discovering x402 OpenAPI documents');
      await updateX402OpenApiDiscoveries({ shouldStop: () => isStopping });
    }, CONFIG.UPDATE_X402_OPENAPI_DISCOVERY_INTERVAL * 1000),
    AsyncInterval.start(async () => {
      const { count } = await uptimeTracking.pruneHealthCheckEvents(new Date());
      logger.info('Pruned old health check events', { count });
    }, HEALTH_CHECK_EVENT_PRUNE_INTERVAL_MS),
  ];
}

/**
 * Stops scheduling job runs, including jobs still in their startup delay, and
 * resolves once in-flight runs finish. Safe to call repeatedly.
 */
export async function stopSchedules(): Promise<void> {
  isStopping = true;
  await Promise.all(stopHandles.map((stop) => stop()));
}

export default init;
