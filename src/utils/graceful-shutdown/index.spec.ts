import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  createConfig,
  createServer,
  defaultEndpointsFactory,
} from 'express-zod-api';
import { z } from '@/utils/zod-openapi';
import { createBeforeExit } from './index';

// A private event instead of SIGTERM keeps the framework's listeners away from
// anything else in the Jest worker; the framework treats it like any signal.
const TEST_SIGNAL = 'graceful-shutdown-spec';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function get(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { agent: false }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      })
      .on('error', reject);
  });
}

describe('createBeforeExit', () => {
  const initialExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = initialExitCode;
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.removeAllListeners(TEST_SIGNAL);
  });

  it('disconnects the database when jobs outlast the drain timeout', async () => {
    jest.useFakeTimers();
    const disconnectDatabase = jest.fn(() => Promise.resolve());
    const beforeExit = createBeforeExit({
      drainJobs: () => new Promise<void>(() => {}),
      disconnectDatabase,
    });

    const exiting = beforeExit();
    await jest.advanceTimersByTimeAsync(2_999);
    expect(disconnectDatabase).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await exiting;
    expect(disconnectDatabase).toHaveBeenCalledTimes(1);
  });

  it('resolves and sets exit code 1 when disconnecting fails', async () => {
    const beforeExit = createBeforeExit({
      drainJobs: () => Promise.resolve(),
      disconnectDatabase: () => Promise.reject(new Error('pool gone')),
    });

    await expect(beforeExit()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(1);
  });

  it('drains the request, then jobs, then disconnects once before exit on repeated signals', async () => {
    const events: string[] = [];
    const requestStarted = deferred();
    const releaseRequest = deferred();
    const drainStarted = deferred();
    const releaseJobs = deferred();
    const exited = deferred();
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      events.push('exit');
      exited.resolve();
    }) as typeof process.exit);

    const slow = defaultEndpointsFactory.build({
      method: 'get',
      output: z.object({}),
      handler: async () => {
        requestStarted.resolve();
        await releaseRequest.promise;
        return {};
      },
    });
    const drainJobs = jest.fn(async () => {
      drainStarted.resolve();
      await releaseJobs.promise;
      events.push('jobs_drained');
    });
    const disconnectDatabase = jest.fn(async () => {
      events.push('db_disconnected');
    });

    const { servers } = await createServer(
      createConfig({
        http: { listen: { port: 0, host: '127.0.0.1' } },
        cors: false,
        logger: { level: 'silent' },
        startupLogo: false,
        gracefulShutdown: {
          events: [TEST_SIGNAL],
          timeout: 2_000,
          beforeExit: createBeforeExit({ drainJobs, disconnectDatabase }),
        },
      }),
      { slow }
    );
    const [server] = servers;
    if (!server.listening) await once(server, 'listening');
    const { port } = server.address() as AddressInfo;

    const request = get(`http://127.0.0.1:${port}/slow`).then((status) => {
      events.push('request_finished');
      return status;
    });
    await requestStarted.promise;

    const emitter = process as EventEmitter;
    emitter.emit(TEST_SIGNAL);
    emitter.emit(TEST_SIGNAL);
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainJobs).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();

    releaseRequest.resolve();
    expect(await request).toBe(200);
    await drainStarted.promise;
    expect(disconnectDatabase).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();

    releaseJobs.resolve();
    await exited.promise;
    expect(events.slice(0, 4)).toEqual([
      'request_finished',
      'jobs_drained',
      'db_disconnected',
      'exit',
    ]);
    expect(drainJobs).toHaveBeenCalledTimes(1);
    expect(disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
  });
});
