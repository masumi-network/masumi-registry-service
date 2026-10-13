jest.mock('@/services/cardano-registry/cardano-registry.service', () => ({
  updateLatestCardanoRegistryEntries: jest.fn(),
  updateHealthCheck: jest.fn(),
}));

type Schedules = typeof import('./index');
type RegistryService =
  typeof import('@/services/cardano-registry/cardano-registry.service');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('schedules', () => {
  let schedules: Schedules;
  let registrySync: jest.Mock;
  let healthCheck: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    // The scheduler keeps module state, so every test gets a fresh copy.
    jest.resetModules();
    schedules = jest.requireActual<Schedules>('./index');
    const service = jest.requireMock<RegistryService>(
      '@/services/cardano-registry/cardano-registry.service'
    );
    registrySync = service.updateLatestCardanoRegistryEntries as jest.Mock;
    healthCheck = service.updateHealthCheck as jest.Mock;
    registrySync.mockResolvedValue(undefined);
    healthCheck.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts no job when stopped during the startup delay', async () => {
    void schedules.default();

    await schedules.stopSchedules();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(registrySync).not.toHaveBeenCalled();
    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('waits for the running job, then schedules nothing else', async () => {
    const sync = deferred();
    registrySync.mockReturnValueOnce(sync.promise);
    void schedules.default();
    await jest.advanceTimersByTimeAsync(1500);
    expect(registrySync).toHaveBeenCalledTimes(1);

    let isStopped = false;
    const stopping = schedules.stopSchedules().then(() => {
      isStopped = true;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(isStopped).toBe(false);

    sync.resolve();
    await stopping;
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(registrySync).toHaveBeenCalledTimes(1);
    expect(healthCheck).not.toHaveBeenCalled();
  });
});
