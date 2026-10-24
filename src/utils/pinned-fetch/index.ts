import type { IncomingHttpHeaders } from 'node:http';
import { request, type RequestOptions } from 'node:https';
import {
  PublicUrlValidationError,
  resolvePublicUrl,
  type ResolvedPublicUrl,
} from '@/utils/public-url';

const PINNED_GET_TIMEOUT_MS = 10_000;
const PINNED_GET_MAX_BODY_BYTES = 64 * 1024;
// A hostname can resolve to thousands of addresses: one probe must not become
// a connection attempt to each of them.
const MAX_ADDRESSES_TRIED = 2;

export type PinnedGetResult =
  | {
      ok: true;
      status: number;
      headers: Record<string, string | undefined>;
      body: string;
    }
  // `unreachable`: a network-level failure worth retrying (DNS, timeout,
  // connection). Otherwise the target itself is unacceptable.
  | { ok: false; reason: string; unreachable: boolean };

class PinnedGetError extends Error {
  constructor(
    message: string,
    readonly unreachable: boolean
  ) {
    super(message);
  }
}

type Address = ResolvedPublicUrl['addresses'][number];

function flattenHeaders(raw: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value == null) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

function getAtAddress(
  destination: ResolvedPublicUrl,
  address: Address,
  signal: AbortSignal,
  maxBodyBytes: number,
  readBodyFor: (status: number) => boolean
): Promise<Extract<PinnedGetResult, { ok: true }>> {
  return new Promise((resolve, reject) => {
    const req = request(
      destination.url,
      {
        method: 'GET',
        agent: false,
        signal,
        family: address.family,
        autoSelectFamily: false,
        // Connect to the address that passed the public-address check, while
        // the URL keeps the TLS hostname and SNI.
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          'User-Agent': 'masumi-registry-probe',
        },
      } as RequestOptions & { autoSelectFamily: boolean },
      (response) => {
        void (async () => {
          const status = response.statusCode ?? 0;
          const headers = flattenHeaders(response.headers);
          // Bodies are only read for statuses the caller wants (a 402
          // challenge by default). Anything else, including a redirect which is
          // never followed, is just a status.
          let wantBody: boolean;
          try {
            wantBody = readBodyFor(status);
          } catch (error) {
            reject(error);
            response.destroy();
            req.destroy();
            return;
          }
          if (!wantBody) {
            response.destroy();
            resolve({ ok: true, status, headers, body: '' });
            return;
          }
          try {
            let bytes = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of response) {
              const buffer: Buffer = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);
              bytes += buffer.length;
              if (bytes > maxBodyBytes) {
                throw new PinnedGetError(
                  `response exceeds ${maxBodyBytes} bytes`,
                  false
                );
              }
              chunks.push(buffer);
            }
            resolve({
              ok: true,
              status,
              headers,
              body: Buffer.concat(chunks, bytes).toString('utf8'),
            });
          } catch (error) {
            reject(error);
            response.destroy();
            req.destroy();
          }
        })();
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function getFromAnyAddress(
  destination: ResolvedPublicUrl,
  signal: AbortSignal,
  maxBodyBytes: number,
  readBodyFor: (status: number) => boolean
) {
  const addresses = destination.addresses.slice(0, MAX_ADDRESSES_TRIED);
  for (const [index, address] of addresses.entries()) {
    try {
      return await getAtAddress(
        destination,
        address,
        signal,
        maxBodyBytes,
        readBodyFor
      );
    } catch (error) {
      // Only a connection failure moves on to the next checked address.
      if (
        signal.aborted ||
        error instanceof PinnedGetError ||
        index === addresses.length - 1
      ) {
        throw error;
      }
    }
  }
  throw new PinnedGetError('hostname resolved to no addresses', true);
}

/**
 * One bounded, unauthenticated GET to an untrusted https URL: the destination is
 * resolved and checked once and the connection is pinned to the checked
 * address (no DNS rebinding), redirects are never followed, and the body is only
 * read for the statuses asked for (a 402 challenge by default). Never sends credentials or payment headers.
 */
export async function pinnedGet(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBodyBytes?: number;
    readBodyFor?: (status: number) => boolean;
  } = {}
): Promise<PinnedGetResult> {
  const timeoutMs = options.timeoutMs ?? PINNED_GET_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes ?? PINNED_GET_MAX_BODY_BYTES;
  const readBodyFor = options.readBodyFor ?? ((status) => status === 402);
  const controller = new AbortController();
  let rejectDeadline: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timeout = setTimeout(() => {
    rejectDeadline(new PinnedGetError('request timed out', true));
    controller.abort();
  }, timeoutMs);
  timeout.unref();
  try {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { ok: false, reason: 'URL is invalid', unreachable: false };
    }
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'URL must use https', unreachable: false };
    }
    if (url.username || url.password) {
      return {
        ok: false,
        reason: 'URL must not contain userinfo',
        unreachable: false,
      };
    }
    // The registry's egress address must not be usable to poke arbitrary
    // services; an explicit :443 normalizes to the empty string.
    if (url.port !== '') {
      return {
        ok: false,
        reason: 'URL must use the default https port',
        unreachable: false,
      };
    }
    const destination = await Promise.race([
      resolvePublicUrl(rawUrl, {
        allowQuery: true,
        allowHash: true,
        trimTrailingSlash: false,
      }),
      deadline,
    ]);
    return await Promise.race([
      getFromAnyAddress(
        destination,
        controller.signal,
        maxBodyBytes,
        readBodyFor
      ),
      deadline,
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const unreachable =
      error instanceof PublicUrlValidationError
        ? error.code === 'unresolvable_hostname'
        : !(error instanceof PinnedGetError) || error.unreachable;
    return { ok: false, reason, unreachable };
  } finally {
    clearTimeout(timeout);
  }
}
