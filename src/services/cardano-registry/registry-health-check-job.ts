import { $Enums, InboxAgentRegistrationStatus } from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { prisma } from '@/utils/db';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';

const healthMutex = new Mutex();

export async function updateHealthCheck(onlyEntriesAfter?: Date | undefined) {
  logger.info('Updating cardano registry entries health check: ', {
    onlyEntriesAfter: onlyEntriesAfter,
  });
  if (onlyEntriesAfter == undefined) {
    onlyEntriesAfter = new Date();
  }

  //we do not need any isolation level here as worst case we have a few duplicate checks in the next run but no data loss. Advantage we do not need to lock the table
  const sourcesCount = await prisma.registrySource.aggregate({
    _count: true,
  });

  if (sourcesCount._count == 0) return;

  let release: MutexInterface.Releaser | null;
  try {
    release = await tryAcquire(healthMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }
  //if we are already performing an update, we wait for it to finish and return

  // Everything after acquisition stays inside try so a failed query cannot
  // leave the mutex held and block all later runs.
  try {
    const sources = await prisma.registrySource.findMany({
      include: {
        RegistrySourceConfig: true,
      },
    });
    if (sources.length == 0) {
      logger.info('No registry sources found, skipping health check');
      return;
    }

    logger.info('updating entries from sources', { count: sources.length });
    await Promise.allSettled(
      sources.map(async (source) => {
        const entries = await prisma.registryEntry.findMany({
          where: {
            registrySourceId: source.id,
            status: {
              in: [$Enums.Status.Online, $Enums.Status.Offline],
            },
            lastUptimeCheck: {
              lte: onlyEntriesAfter,
            },
          },
          orderBy: { lastUptimeCheck: 'asc' },
          take: 50,
          include: {
            RegistrySource: true,
            Capability: true,
            AgentPricing: {
              include: {
                FixedPricing: {
                  include: { Amounts: true },
                },
              },
            },
            ExampleOutput: true,
            SupportedPaymentSources: {
              include: {
                Pricing: {
                  include: {
                    FixedPricing: { include: { Amounts: true } },
                  },
                },
              },
              orderBy: { sourceIndex: 'asc' },
            },
            Verifications: true,
            A2A: true,
          },
        });
        logger.info(
          `Found ${entries.length} registry entries in status online or offline`
        );
        const invalidEntries = await prisma.registryEntry.findMany({
          where: {
            registrySourceId: source.id,
            status: {
              in: [$Enums.Status.Invalid],
            },
            lastUptimeCheck: {
              lte: onlyEntriesAfter,
            },
            uptimeCheckCount: {
              lte: 20,
            },
          },
          orderBy: { updatedAt: 'asc' },
          take: 50,
          include: {
            RegistrySource: true,
            Capability: true,
            AgentPricing: {
              include: {
                FixedPricing: {
                  include: { Amounts: true },
                },
              },
            },
            ExampleOutput: true,
            SupportedPaymentSources: {
              include: {
                Pricing: {
                  include: {
                    FixedPricing: { include: { Amounts: true } },
                  },
                },
              },
              orderBy: { sourceIndex: 'asc' },
            },
            Verifications: true,
            A2A: true,
          },
        });
        logger.info(
          `Found ${invalidEntries.length} registry entries in status invalid`
        );
        const filteredOutInvalidStaggeredEntries = invalidEntries.filter(
          (e) => {
            const retries = Math.max(0.2, e.uptimeCheckCount - e.uptimeCount);
            const staggeredWaitTime = Math.min(
              1000 * 60 * 10 * retries,
              1000 * 60 * 60 * 48
            );
            return (
              e.lastUptimeCheck.getTime() + staggeredWaitTime <
              onlyEntriesAfter.getTime()
            );
          }
        );
        const excludedEntries = invalidEntries.filter(
          (e) =>
            filteredOutInvalidStaggeredEntries.find((e2) => e2.id === e.id) !=
            null
        );
        logger.info(
          `Filtered out ${filteredOutInvalidStaggeredEntries.length} invalid staggered entries`
        );
        await Promise.allSettled(
          excludedEntries.map(async (e) => {
            await prisma.registryEntry.update({
              where: { id: e.id },
              data: {
                updatedAt: new Date(),
              },
            });
          })
        );
        const invalidBatch = filteredOutInvalidStaggeredEntries.slice(
          0,
          Math.min(10, filteredOutInvalidStaggeredEntries.length)
        );
        const combinedEntries = [...entries, ...invalidBatch];
        logger.info(
          `Checking and updating ${combinedEntries.length} registry entries`
        );
        await healthCheckService.checkVerifyAndUpdateRegistryEntries({
          registryEntries: combinedEntries,
          minHealthCheckDate: onlyEntriesAfter,
        });

        const inboxAgentRegistrations =
          await prisma.inboxAgentRegistration.findMany({
            where: {
              registrySourceId: source.id,
              status: {
                in: [
                  InboxAgentRegistrationStatus.Pending,
                  InboxAgentRegistrationStatus.Verified,
                  InboxAgentRegistrationStatus.Invalid,
                ],
              },
              updatedAt: {
                lte: onlyEntriesAfter,
              },
            },
            orderBy: { updatedAt: 'asc' },
            take: 50,
            include: {
              RegistrySource: true,
            },
          });
        logger.info(
          `Found ${inboxAgentRegistrations.length} inbox agent registrations eligible for verification`
        );
        await healthCheckService.checkVerifyAndUpdateInboxAgentRegistrations({
          inboxAgentRegistrations,
        });
      })
    );
  } finally {
    release();
  }
}
