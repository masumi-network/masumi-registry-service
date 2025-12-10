import {
  updateLatestCardanoRegistryEntries,
  updateHealthCheck,
} from '@/services/cardano-registry/cardano-registry.service';
import { CONFIG } from '@/utils/config';
import { logger } from '@/utils/logger';
import { AsyncInterval } from '@/utils/async-interval';

async function init() {
  logger.log({
    level: 'info',
    message: 'initialized cron events',
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
}
export default init;
