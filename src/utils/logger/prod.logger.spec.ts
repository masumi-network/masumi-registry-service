import createHttpError from 'http-errors';
import { PassThrough } from 'stream';
import { transports } from 'winston';
import { buildProdLogger } from '@/utils/logger/prod.logger';

const RPC_KEY = 'mainnetSecretBlockfrostKey';
const API_TOKEN = 'masumi-secret-api-token';

function captureProdLogger() {
  const logger = buildProdLogger();
  const stream = new PassThrough();
  const lines: string[] = [];
  stream.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
  logger.clear().add(new transports.Stream({ stream }));
  return { logger, lines };
}

describe('prod logger secret redaction', () => {
  it('redacts secrets from the payload express-zod-api logs on a 5xx', () => {
    const { logger, lines } = captureProdLogger();
    const input = {
      name: 'source',
      rpcProviderApiKey: RPC_KEY,
      nested: [{ token: API_TOKEN }],
    };

    // Same call shape as express-zod-api's default result handler.
    logger.error('Server side error', {
      error: new Error('boom'),
      url: '/api/v1/registry-source',
      payload: input,
    });

    const output = lines.join('');
    expect(output).toContain('Server side error');
    expect(output).toContain('"name":"source"');
    expect(output).not.toContain(RPC_KEY);
    expect(output).not.toContain(API_TOKEN);
    // The live request input must not be mutated.
    expect(input.rpcProviderApiKey).toBe(RPC_KEY);
    expect(input.nested[0].token).toBe(API_TOKEN);
  });

  it('redacts secrets in error text, error properties and causes', () => {
    const { logger, lines } = captureProdLogger();
    // Prisma validation errors print their call arguments in the message.
    const prismaError = Object.assign(
      new Error(`Invalid create() call:\n  rpcProviderApiKey: "${RPC_KEY}",`),
      { meta: { Token: API_TOKEN } }
    );
    // express-zod-api wraps unknown errors like this before logging them.
    const httpError = createHttpError(500, prismaError.message, {
      cause: prismaError,
    });

    logger.error('Server side error', {
      error: httpError,
      payload: { inner: prismaError },
    });

    const output = lines.join('');
    expect(output).toContain('Server side error');
    expect(output).toContain('Invalid create() call');
    expect(output).not.toContain(RPC_KEY);
    expect(output).not.toContain(API_TOKEN);
  });

  it.each([
    ['Prisma style', `rpcProviderApiKey: "${RPC_KEY}",`],
    ['JSON', JSON.stringify({ token: API_TOKEN, n: 1 })],
    [
      'JSON stringified twice',
      JSON.stringify(JSON.stringify({ token: API_TOKEN, n: 1 })),
    ],
    ['escaped quote in value', `token: "a\\"${API_TOKEN}" tail`],
    ['single quotes, mixed case', `Token='${API_TOKEN}' tail`],
    ['unterminated quote', `token: "${API_TOKEN}`],
    ['truncated on a backslash', `token: "${API_TOKEN}\\`],
    ['backslash before a newline', `token: "${API_TOKEN}\\\nmore"`],
    [
      'JSON stringified three times',
      JSON.stringify(JSON.stringify(JSON.stringify({ token: API_TOKEN }))),
    ],
    ['backtick quotes', `token: \`${API_TOKEN}\` tail`],
    [
      'quote inside a value stringified twice',
      JSON.stringify(JSON.stringify({ token: `ab"${API_TOKEN}` })),
    ],
    [
      'earlier value ending in a backslash',
      `token: "a\\\\" rpcProviderApiKey: "${RPC_KEY}"`,
    ],
    ['key right after an escape', JSON.stringify(`{\ntoken: "${API_TOKEN}"}`)],
  ])('redacts a secret embedded in text (%s)', (_case, text) => {
    const { logger, lines } = captureProdLogger();

    logger.error(text);

    const output = lines.join('');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain(RPC_KEY);
    expect(output).not.toContain(API_TOKEN);
  });

  it('keeps text after a redacted value and ignores similar words', () => {
    const { logger, lines } = captureProdLogger();

    logger.error('token: "a" and "b", tokens: "c", tokenHash: "d"');

    expect(lines.join('')).toContain(
      'token: \\"[REDACTED]\\" and \\"b\\", tokens: \\"c\\", tokenHash: \\"d\\"'
    );
  });

  it('scrubs a long run of backslashes in linear time', () => {
    const { logger, lines } = captureProdLogger();
    // About 5.7s with a quadratic pattern; a few ms when linear.
    const text = `token: "${'\\'.repeat(200_000)}x`;

    const started = performance.now();
    logger.error(text);

    expect(performance.now() - started).toBeLessThan(1000);
    // The regex matched; the fail-safe catch would print only [REDACTED].
    expect(lines.join('')).toContain('token: \\"[REDACTED]');
  });

  it('redacts the whole string when the scrubber throws', () => {
    const { logger, lines } = captureProdLogger();
    const marker = 'huge-input-marker';
    const original = String.prototype.replace;
    const replace = jest.spyOn(String.prototype, 'replace');
    replace.mockImplementation(function (this: string, ...args) {
      // Stands in for a regex stack overflow on a string of tens of MB.
      if (this.includes(marker)) throw new RangeError('stack overflow');
      return Reflect.apply(original, this, args) as string;
    });

    try {
      logger.error(`${marker} token: "${API_TOKEN}"`);
    } finally {
      replace.mockRestore();
    }

    const output = lines.join('');
    expect(output).toContain('"message":"[REDACTED]"');
    expect(output).not.toContain(API_TOKEN);
  });

  it('logs a self-referencing object without recursing forever', () => {
    const { logger, lines } = captureProdLogger();
    const meta: Record<string, unknown> = { token: API_TOKEN };
    meta.self = meta;

    logger.info('cyclic', { meta });

    const output = lines.join('');
    expect(output).toContain('"message":"cyclic"');
    expect(output).not.toContain(API_TOKEN);
  });
});
