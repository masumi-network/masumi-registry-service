import {
  updateLatestCardanoRegistryEntries,
  updateHealthCheck,
} from '@/services/cardano-registry/cardano-registry.service';
import { uptimeTracking } from '@/services/health-check';
import { updateSuccessfulPurchaseIndex } from '@/services/purchase-indexer/purchase-indexer.service';
import { CONFIG } from '@/utils/config';
import { logger } from '@/utils/logger';
import { AsyncInterval } from '@/utils/async-interval';

const HEALTH_CHECK_EVENT_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function init() {
  logger.log({
    level: 'info',
    message: 'Initialized event scheduler',
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  AsyncInterval.start(async () => {
    logger.info('Updating cardano registry entries');
    await updateLatestCardanoRegistryEntries();
    logger.info('Finished updating cardano registry entries');
  }, CONFIG.UPDATE_CARDANO_REGISTRY_INTERVAL * 1000);

  await new Promise((resolve) => setTimeout(resolve, 15000));
  AsyncInterval.start(async () => {
    logger.info('Updating health check');
    const start = new Date();
    await updateHealthCheck();
    logger.info(
      'Finished updating health check in ' +
        (new Date().getTime() - start.getTime()) / 1000 +
        's'
    );
  }, CONFIG.UPDATE_HEALTH_CHECK_INTERVAL * 1000);

  AsyncInterval.start(async () => {
    logger.info('Updating successful purchase index');
    await updateSuccessfulPurchaseIndex();
    logger.info('Finished updating successful purchase index');
  }, CONFIG.UPDATE_PURCHASE_INDEX_INTERVAL * 1000);

  AsyncInterval.start(async () => {
    const { count } = await uptimeTracking.pruneHealthCheckEvents(new Date());
    logger.info('Pruned old health check events', { count });
  }, HEALTH_CHECK_EVENT_PRUNE_INTERVAL_MS);
}
export default init;
