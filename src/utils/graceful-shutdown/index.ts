import { logger } from '@/utils/logger';

export const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'];
// HTTP drain + job drain stay under Docker's default 10s stop timeout.
export const HTTP_DRAIN_TIMEOUT_MS = 5_000;
const JOB_DRAIN_TIMEOUT_MS = 3_000;

type BeforeExitOptions = {
  drainJobs: () => Promise<void>;
  disconnectDatabase: () => Promise<void>;
};

/**
 * Builds express-zod-api's `gracefulShutdown.beforeExit` hook. The framework
 * calls it after draining HTTP, and again on every repeated signal, then calls
 * process.exit(). So the work runs once, and the hook never rejects: a
 * rejection would skip the exit.
 */
export function createBeforeExit({
  drainJobs,
  disconnectDatabase,
}: BeforeExitOptions): () => Promise<void> {
  let shutdown: Promise<void> | undefined;

  const run = async () => {
    try {
      // Jobs resume from their saved progress on the next start, so a slow
      // one is abandoned rather than holding up the exit.
      if (!(await settlesWithin(drainJobs(), JOB_DRAIN_TIMEOUT_MS))) {
        logger.warn(
          `Scheduled jobs still running after ${JOB_DRAIN_TIMEOUT_MS}ms, disconnecting database anyway`
        );
      }
      // Not raced: once the pool is ending it hands out no new clients, so
      // this only waits for queries already in flight.
      await disconnectDatabase();
      logger.info('Shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exitCode = 1;
    }
  };

  return () => (shutdown ??= run());
}

async function settlesWithin(
  work: Promise<void>,
  timeoutMs: number
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([work.then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
