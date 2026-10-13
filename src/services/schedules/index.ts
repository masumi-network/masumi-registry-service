import {
  updateLatestCardanoRegistryEntries,
  updateHealthCheck,
} from '@/services/cardano-registry/cardano-registry.service';
import { CONFIG } from '@/utils/config';
import { logger } from '@/utils/logger';
import { AsyncInterval } from '@/utils/async-interval';

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
