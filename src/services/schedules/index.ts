import {
  updateLatestCardanoRegistryEntries,
  updateHealthCheck,
} from '@/services/cardano-registry/cardano-registry.service';
import { healthCheckService } from '@/services/health-check';
import { CONFIG } from '@/utils/config';
import { logger } from '@/utils/logger';
import { AsyncInterval } from '@/utils/async-interval';
import { Network } from '@prisma/client';

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

  // Simple API listing health-check runs on the same interval, staggered 5 s
  // to avoid bursting outbound requests alongside the Cardano health-check.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  AsyncInterval.start(async () => {
    logger.info('Updating Simple API listing health checks');
    const start = new Date();
    const beforeLastActiveAt = new Date(
      Date.now() - CONFIG.UPDATE_HEALTH_CHECK_INTERVAL * 1000
    );
    await Promise.allSettled([
      healthCheckService.checkVerifyAndUpdateSimpleApiListings({
        network: Network.Preprod,
        beforeLastActiveAt,
      }),
      healthCheckService.checkVerifyAndUpdateSimpleApiListings({
        network: Network.Mainnet,
        beforeLastActiveAt,
      }),
    ]);
    logger.info(
      'Finished Simple API listing health checks in ' +
        (new Date().getTime() - start.getTime()) / 1000 +
        's'
    );
  }, CONFIG.UPDATE_HEALTH_CHECK_INTERVAL * 1000);
}
export default init;
