import { lookup } from 'node:dns/promises';
import { validateOpenApiSpec, validateX402Manifest } from './index';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

function mockFetchOnce(options: {
  ok?: boolean;
  status?: number;
  body?: string | string[];
}) {
  const { ok = true, status = 200, body = '' } = options;
  const chunks = Array.isArray(body) ? body : [body];
  const encoder = new TextEncoder();
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    headers: { get: () => 'application/json' },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  });
}

const VALID_OPENAPI = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
});

const VALID_X402_MANIFEST = JSON.stringify({
  x402Version: 2,
  resources: [
    { resource: 'https://agent.example/x/summarize', type: 'http' },
    { resource: 'https://agent.example/x/tool', type: 'mcp' },
  ],
});

describe('spec-validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    // Public IP -> passes the SSRF guard.
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  describe('validateOpenApiSpec', () => {
    it('accepts a valid OpenAPI 3.1 document', async () => {
      mockFetchOnce({ body: VALID_OPENAPI });
      const result = await validateOpenApiSpec(
        'https://agent.example/openapi.json'
      );
      expect(result.outcome).toBe('valid');
      if (result.outcome === 'valid') {
        expect((result.spec as { openapi: string }).openapi).toBe('3.1.0');
      }
    });

    it('rejects a document missing info.version as invalid', async () => {
      mockFetchOnce({
        body: JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'T' },
          paths: {},
        }),
      });
      const result = await validateOpenApiSpec(
        'https://agent.example/openapi.json'
      );
      expect(result.outcome).toBe('invalid');
    });

    it('rejects a document with none of paths/components/webhooks as invalid', async () => {
      mockFetchOnce({
        body: JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'T', version: '1.0.0' },
        }),
      });
      const result = await validateOpenApiSpec(
        'https://agent.example/openapi.json'
      );
      expect(result.outcome).toBe('invalid');
    });

    it('treats a non-2xx response as unreachable', async () => {
      mockFetchOnce({ ok: false, status: 502 });
      const result = await validateOpenApiSpec(
        'https://agent.example/openapi.json'
      );
      expect(result.outcome).toBe('unreachable');
    });

    it('rejects a private/SSRF target as unreachable (guard throws)', async () => {
      (lookup as jest.Mock).mockResolvedValue([
        { address: '10.0.0.5', family: 4 },
      ]);
      const result = await validateOpenApiSpec(
        'https://internal.local/openapi.json'
      );
      expect(result.outcome).toBe('unreachable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects a body over the size cap as invalid', async () => {
      mockFetchOnce({ body: 'x'.repeat(5 * 1024 * 1024 + 1) });
      const result = await validateOpenApiSpec(
        'https://agent.example/openapi.json'
      );
      expect(result.outcome).toBe('invalid');
    });

    it('accepts a YAML OpenAPI document', async () => {
      mockFetchOnce({
        body: 'openapi: 3.1.0\ninfo:\n  title: Test API\n  version: 1.0.0\npaths: {}\n',
      });
      const result = await validateOpenApiSpec(
        'https://agent.example/openapi.yaml'
      );
      expect(result.outcome).toBe('valid');
    });
  });

  describe('validateX402Manifest', () => {
    it('accepts a valid x402 resource manifest', async () => {
      mockFetchOnce({ body: VALID_X402_MANIFEST });
      const result = await validateX402Manifest(
        'https://agent.example/.well-known/x402.json'
      );
      expect(result.outcome).toBe('valid');
    });

    it('rejects a manifest with no resources as invalid', async () => {
      mockFetchOnce({ body: JSON.stringify({ resources: [] }) });
      const result = await validateX402Manifest(
        'https://agent.example/.well-known/x402.json'
      );
      expect(result.outcome).toBe('invalid');
    });

    it('rejects a resource with a non-URL resource field as invalid', async () => {
      mockFetchOnce({
        body: JSON.stringify({ resources: [{ resource: 'not-a-url' }] }),
      });
      const result = await validateX402Manifest(
        'https://agent.example/.well-known/x402.json'
      );
      expect(result.outcome).toBe('invalid');
    });

    it('rejects a non-JSON body as invalid', async () => {
      mockFetchOnce({ body: 'not json at all' });
      const result = await validateX402Manifest(
        'https://agent.example/.well-known/x402.json'
      );
      expect(result.outcome).toBe('invalid');
    });

    it('accepts a resource with a valid embedded JSON Schema', async () => {
      mockFetchOnce({
        body: JSON.stringify({
          resources: [
            {
              resource: 'https://agent.example/x/summarize',
              inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
              },
            },
          ],
        }),
      });
      const result = await validateX402Manifest(
        'https://agent.example/.well-known/x402.json'
      );
      expect(result.outcome).toBe('valid');
    });

    it('rejects a resource whose embedded schema violates JSON Schema 2020-12', async () => {
      mockFetchOnce({
        body: JSON.stringify({
          resources: [
            {
              resource: 'https://agent.example/x/summarize',
              // `type` must be a known JSON Schema type, not an arbitrary string.
              outputSchema: { type: 'definitely-not-a-type' },
            },
          ],
        }),
      });
      const result = await validateX402Manifest(
        'https://agent.example/.well-known/x402.json'
      );
      expect(result.outcome).toBe('invalid');
    });
  });
});
