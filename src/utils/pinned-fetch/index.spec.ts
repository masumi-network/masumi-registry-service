import { request, type RequestOptions } from 'node:https';
import { lookup } from 'node:dns/promises';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { pinnedGet } from './index';

jest.mock('node:https', () => ({ request: jest.fn() }));
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

let lastResponse: PassThrough;
function mockResponse(
  body: string,
  status = 402,
  headers: Record<string, string> = {}
) {
  (request as jest.Mock).mockImplementation(
    (_url, options: RequestOptions, callback) => {
      const response = new PassThrough() as PassThrough & IncomingMessage;
      response.statusCode = status;
      response.headers = headers;
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
      lastResponse = response;
      return req;
    }
  );
}

describe('pinnedGet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    mockResponse('{"x402Version":1}', 402, {
      'payment-required': 'abc',
      'content-type': 'application/json',
    });
  });
  afterEach(() => jest.useRealTimers());

  it('returns the status, headers and body of a 402', async () => {
    const result = await pinnedGet('https://api.example.com/x?y=1');

    expect(result).toEqual({
      ok: true,
      status: 402,
      headers: {
        'payment-required': 'abc',
        'content-type': 'application/json',
      },
      body: '{"x402Version":1}',
    });
    const [url, options] = (request as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('https://api.example.com/x?y=1');
    expect(options.method).toBe('GET');
  });

  it('connects to the address it checked instead of resolving again', async () => {
    await pinnedGet('https://api.example.com/x');

    const options = (request as jest.Mock).mock.calls[0][1];
    const callback = jest.fn();
    options.lookup('api.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('does not read the body of a non-402 response', async () => {
    mockResponse('x'.repeat(1_000_000), 200);

    const result = await pinnedGet('https://api.example.com/x');

    expect(result).toEqual({ ok: true, status: 200, headers: {}, body: '' });
    expect(lastResponse.destroyed).toBe(true);
  });

  it('does not follow redirects', async () => {
    mockResponse('', 301, { location: 'http://169.254.169.254/' });

    const result = await pinnedGet('https://api.example.com/x');

    expect(result).toMatchObject({ ok: true, status: 301 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects a 402 body over the size limit as invalid', async () => {
    mockResponse('x'.repeat(100), 402);

    const result = await pinnedGet('https://api.example.com/x', {
      maxBodyBytes: 50,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'response exceeds 50 bytes',
      unreachable: false,
    });
  });

  it('rejects a non-public destination without connecting', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '10.0.0.5', family: 4 },
    ]);

    const result = await pinnedGet('https://internal.example/x');

    expect(result).toMatchObject({ ok: false, unreachable: false });
    expect(request).not.toHaveBeenCalled();
  });

  it('treats an unresolvable host as unreachable', async () => {
    (lookup as jest.Mock).mockRejectedValue(new Error('ENOTFOUND'));

    const result = await pinnedGet('https://gone.example/x');

    expect(result).toMatchObject({ ok: false, unreachable: true });
  });

  it.each([
    ['http://api.example.com/x', 'must use https'],
    ['https://user:pw@api.example.com/x', 'userinfo'],
    ['not a url', 'invalid'],
  ])('rejects %s before any lookup', async (url, fragment) => {
    const result = await pinnedGet(url);

    expect(result).toMatchObject({ ok: false, unreachable: false });
    expect(result.ok === false && result.reason).toContain(fragment);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('only talks to the default https port', async () => {
    const result = await pinnedGet('https://api.example.com:6379/x');

    expect(result).toMatchObject({ ok: false, unreachable: false });
    expect(result.ok === false && result.reason).toContain('port');
    expect(lookup).not.toHaveBeenCalled();

    mockResponse('', 402);
    await expect(
      pinnedGet('https://api.example.com:443/x')
    ).resolves.toMatchObject({ ok: true, status: 402 });
  });

  it('tries at most two of the checked addresses', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.35', family: 4 },
      { address: '93.184.216.36', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]);
    (request as jest.Mock).mockImplementation(() => {
      const req = new EventEmitter() as ClientRequest;
      req.end = jest.fn(() => {
        req.emit('error', new Error('ECONNREFUSED'));
        return req;
      }) as ClientRequest['end'];
      return req;
    });

    const result = await pinnedGet('https://api.example.com/x');

    expect(request).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: false, unreachable: true });
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    (request as jest.Mock).mockImplementation(
      (_url, options: RequestOptions) => {
        const req = new EventEmitter() as ClientRequest;
        req.destroy = jest.fn(() => req);
        req.end = jest.fn(() => req) as ClientRequest['end'];
        options.signal?.addEventListener('abort', () =>
          req.emit('error', new Error('aborted'))
        );
        return req;
      }
    );

    const pending = pinnedGet('https://api.example.com/x', {
      timeoutMs: 1_000,
    });
    await jest.advanceTimersByTimeAsync(1_001);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      unreachable: true,
    });
  });
});
