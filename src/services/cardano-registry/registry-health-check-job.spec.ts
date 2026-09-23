import { prisma } from '@/utils/db';
import { healthCheckService } from '@/services/health-check';
import { logger } from '@/utils/logger';
import { updateHealthCheck } from './registry-health-check-job';

jest.mock('@/utils/db', () => ({
  prisma: {
    registrySource: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    registryEntry: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    inboxAgentRegistration: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/services/health-check', () => ({
  healthCheckService: {
    checkVerifyAndUpdateRegistryEntries: jest.fn(),
    checkVerifyAndUpdateInboxAgentRegistrations: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('updateHealthCheck mutex', () => {
  const source = { id: 'source-1', RegistrySourceConfig: {} };
  const checkEntries =
    healthCheckService.checkVerifyAndUpdateRegistryEntries as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.registrySource.aggregate as jest.Mock).mockResolvedValue({
      _count: 1,
    });
    (prisma.registrySource.findMany as jest.Mock).mockResolvedValue([source]);
    (prisma.registryEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.inboxAgentRegistration.findMany as jest.Mock).mockResolvedValue([]);
    checkEntries.mockResolvedValue(undefined);
  });

  it('releases the mutex when the source query after acquisition fails', async () => {
    (prisma.registrySource.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(updateHealthCheck()).rejects.toThrow('db down');
    expect(checkEntries).not.toHaveBeenCalled();

    await updateHealthCheck();

    expect(checkEntries).toHaveBeenCalledTimes(1);
  });

  it('skips a concurrent invocation while a health check is running', async () => {
    let finishCheck: () => void = () => {};
    checkEntries.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishCheck = resolve))
    );

    const running = updateHealthCheck();
    await new Promise((resolve) => setImmediate(resolve));
    await updateHealthCheck();

    expect(checkEntries).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'Mutex timeout when locking',
      expect.anything()
    );

    finishCheck();
    await running;
  });
});
