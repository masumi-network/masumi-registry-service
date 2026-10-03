import { request, type RequestOptions } from 'node:https';
import createHttpError from 'http-errors';
import {
  PublicUrlValidationError,
  resolvePublicUrl,
  type ResolvedPublicUrl,
} from '@/utils/public-url';

export const AGENT_CARD_FETCH_TIMEOUT_MS = 20_000;
export const AGENT_CARD_MAX_BYTES = 5 * 1024 * 1024;

type FetchResult =
  | { ok: true; body: string }
  | { ok: false; reason: string; unreachable: boolean };

function fetchBodyAtAddress(
  destination: ResolvedPublicUrl,
  address: ResolvedPublicUrl['addresses'][number],
  signal: AbortSignal
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      destination.url,
      {
        agent: false,
        signal,
        family: address.family,
        autoSelectFamily: false,
        // Use the checked address, while the URL retains the TLS hostname and SNI.
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
      } as RequestOptions & { autoSelectFamily: boolean },
      (response) => {
        void (async () => {
          try {
            const status = response.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              throw createHttpError(
                502,
                `Agent Card fetch failed with status ${status}`
              );
            }
            const contentType = response.headers['content-type'] ?? '';
            if (
              contentType.split(';')[0].trim().toLowerCase() !==
              'application/json'
            ) {
              throw createHttpError(
                400,
                'Agent Card response was not application/json'
              );
            }
            const contentLength = response.headers['content-length'];
            if (
              contentLength != null &&
              Number(contentLength) > AGENT_CARD_MAX_BYTES
            ) {
              throw createHttpError(
                400,
                'Agent Card response exceeds the maximum allowed size'
              );
            }
            let bytes = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of response) {
              const buffer: Buffer = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);
              bytes += buffer.length;
              if (bytes > AGENT_CARD_MAX_BYTES) {
                throw createHttpError(
                  400,
                  'Agent Card response exceeds the maximum allowed size'
                );
              }
              chunks.push(buffer);
            }
            resolve({
              ok: true,
              body: Buffer.concat(chunks, bytes).toString('utf8'),
            });
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : createHttpError(400, String(error))
            );
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

async function fetchBody(
  destination: ResolvedPublicUrl,
  signal: AbortSignal
): Promise<FetchResult> {
  for (const [index, address] of destination.addresses.entries()) {
    try {
      return await fetchBodyAtAddress(destination, address, signal);
    } catch (error) {
      if (
        signal.aborted ||
        createHttpError.isHttpError(error) ||
        index === destination.addresses.length - 1
      ) {
        throw error;
      }
    }
  }
  throw createHttpError(400, 'Agent Card hostname resolved to no addresses');
}

export async function fetchAgentCardBody(rawUrl: string): Promise<FetchResult> {
  const controller = new AbortController();
  let rejectDeadline: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timeout = setTimeout(() => {
    rejectDeadline(createHttpError(408, 'Agent Card fetch timed out'));
    controller.abort();
  }, AGENT_CARD_FETCH_TIMEOUT_MS);
  timeout.unref();
  try {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return {
        ok: false,
        reason: 'Agent Card URL is invalid',
        unreachable: false,
      };
    }
    if (url.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'Agent Card URL must use https',
        unreachable: false,
      };
    }
    if (url.username || url.password) {
      return {
        ok: false,
        reason: 'Agent Card URL must not contain userinfo',
        unreachable: false,
      };
    }
    const destination = await Promise.race([
      resolvePublicUrl(rawUrl, { allowQuery: true, trimTrailingSlash: false }),
      deadline,
    ]);
    return await Promise.race([
      fetchBody(destination, controller.signal),
      deadline,
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const unreachable =
      error instanceof PublicUrlValidationError
        ? error.code === 'unresolvable_hostname'
        : !createHttpError.isHttpError(error) || error.status >= 408;
    return { ok: false, reason, unreachable };
  } finally {
    clearTimeout(timeout);
  }
}
