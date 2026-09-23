import { AsyncInterval } from './index';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('AsyncInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stop waits for the in-flight run and schedules no further runs', async () => {
    const run = deferred();
    const callback = jest.fn(() => run.promise);
    const stop = AsyncInterval.start(callback, 1000);

    let isStopped = false;
    const stopping = stop().then(() => {
      isStopped = true;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(isStopped).toBe(false);

    run.resolve();
    await stopping;
    await jest.advanceTimersByTimeAsync(5000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stop during the wait between runs resolves without waiting for the interval', async () => {
    const callback = jest.fn(() => Promise.resolve());
    const stop = AsyncInterval.start(callback, 60_000);
    await jest.advanceTimersByTimeAsync(0);

    await stop();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
