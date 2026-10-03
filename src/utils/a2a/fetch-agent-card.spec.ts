import { request, type RequestOptions } from 'node:https';
import { lookup } from 'node:dns/promises';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ClientRequest } from 'node:http';
import {
  fetchAgentCardBody,
  AGENT_CARD_MAX_BYTES,
  AGENT_CARD_FETCH_TIMEOUT_MS,
} from './fetch-agent-card';

jest.mock('node:https', () => ({ request: jest.fn() }));
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

let lastResponse: PassThrough;
let lastRequest: ClientRequest;
function mockResponse(
  body: string,
  status = 200,
  contentType = 'application/json',
  contentLength?: string
) {
  (request as jest.Mock).mockImplementation(
    (_url, options: RequestOptions, callback) => {
      const response = new PassThrough() as PassThrough & IncomingMessage;
      response.statusCode = status;
      response.headers = { 'content-type': contentType };
      if (contentLength) response.headers['content-length'] = contentLength;
      const req = new EventEmitter() as ClientRequest;
      req.destroy = jest.fn(() => req);
      req.end = jest.fn(() => {
        callback(response);
        response.end(body);
        return req;
      }) as ClientRequest['end'];
      options.signal?.addEventListener('abort', () => {
        response.destroy(new Error('aborted'));
        req.emit('error', new Error('aborted'));
      });
      lastRequest = req;
      lastResponse = response;
      return req;
    }
  );
}

describe('pinned Agent Card fetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    mockResponse('{"name":"Agent"}');
  });
  afterEach(() => jest.useRealTimers());

  it('tries the next checked address after a connection failure', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '2606:4700::1111', family: 6 },
      { address: '93.184.216.34', family: 4 },
    ]);
    (request as jest.Mock).mockImplementationOnce(() => {
      const req = new EventEmitter() as ClientRequest;
      req.end = jest.fn(() => {
        req.emit('error', new Error('ENETUNREACH'));
        return req;
      }) as ClientRequest['end'];
      return req;
    });
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    const options = (request as jest.Mock).mock.calls[1][1];
    const callback = jest.fn();
    options.lookup('agent.example', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('pins the checked address and retains the TLS hostname, path, and query', async () => {
    const url = 'https://agent.example/card.json?version=1';
    await expect(fetchAgentCardBody(url)).resolves.toEqual({
      ok: true,
      body: '{"name":"Agent"}',
    });
    const [target, options] = (request as jest.Mock).mock.calls[0];
    expect(target.href).toBe(url);
    expect(options.agent).toBe(false);
    expect(options.autoSelectFamily).toBe(false);
    const callback = jest.fn();
    options.lookup('agent.example', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it.each([
    'http://agent.example/card',
    'https://user:pass@agent.example/card',
    'https://127.0.0.1/card',
    'https://agent.example/card#fragment',
  ])('rejects invalid or blocked destination %s', async (url) => {
    await expect(fetchAgentCardBody(url)).resolves.toMatchObject({
      ok: false,
      unreachable: false,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects mixed public and private DNS answers', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({ ok: false, unreachable: false });
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects redirects without following them', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]);
    mockResponse('', 302);
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('302'),
      unreachable: true,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(lastResponse.destroyed).toBe(true);
  });
  it('rejects non-JSON content', async () => {
    mockResponse('{}', 200, 'text/html');
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({ ok: false, unreachable: false });
  });
  it('rejects oversized declared content length', async () => {
    mockResponse(
      '{}',
      200,
      'application/json',
      String(AGENT_CARD_MAX_BYTES + 1)
    );
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({ ok: false, unreachable: false });
    expect(lastResponse.destroyed).toBe(true);
  });
  it('counts UTF-8 bytes and destroys an oversized stream', async () => {
    mockResponse('€'.repeat(Math.ceil(AGENT_CARD_MAX_BYTES / 3)));
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('maximum allowed size'),
      unreachable: false,
    });
    expect(lastResponse.destroyed).toBe(true);
    expect(lastRequest.destroy).toHaveBeenCalled();
  });
  it('times out DNS before any connection opens', async () => {
    jest.useFakeTimers();
    (lookup as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const result = fetchAgentCardBody('https://agent.example/card');
    await jest.advanceTimersByTimeAsync(AGENT_CARD_FETCH_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('timed out'),
      unreachable: true,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('times out a stalled body and closes its connection', async () => {
    jest.useFakeTimers();
    mockResponse('');

    (request as jest.Mock).mockImplementation((...args) => {
      const req = new EventEmitter() as ClientRequest;
      req.destroy = jest.fn(() => req);
      args[1].signal.addEventListener('abort', () =>
        req.emit('error', new Error('aborted'))
      );
      req.end = jest.fn(() => {
        const response = new PassThrough() as PassThrough & IncomingMessage;
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        args[2](response);
        args[1].signal.addEventListener('abort', () =>
          response.destroy(new Error('aborted'))
        );
        lastResponse = response;
        return req;
      }) as ClientRequest['end'];
      return req;
    });
    const result = fetchAgentCardBody('https://agent.example/card');
    await jest.advanceTimersByTimeAsync(AGENT_CARD_FETCH_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({
      ok: false,
      unreachable: true,
    });
    expect(lastResponse.destroyed).toBe(true);
  });
  it('returns network failures as unreachable', async () => {
    (request as jest.Mock).mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      fetchAgentCardBody('https://agent.example/card')
    ).resolves.toMatchObject({
      ok: false,
      reason: 'ECONNREFUSED',
      unreachable: true,
    });
  });
});
