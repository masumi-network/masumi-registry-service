import { lookup } from 'node:dns/promises';
import {
  validateAgentCard,
  validateOpenApiSpec,
  validateSpecUrl,
  validateX402Manifest,
} from './index';

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

  describe('validateAgentCard', () => {
    const CARD_URL = 'https://agent.example/.well-known/agent-card.json';

    function agentCard(overrides: Record<string, unknown> = {}) {
      return JSON.stringify({
        protocolVersions: ['1.0'],
        name: 'Test A2A Agent',
        description: 'Does A2A things',
        version: '1.2.3',
        supportedInterfaces: [
          {
            url: 'https://agent.example/a2a',
            protocolBinding: 'JSONRPC',
            protocolVersion: '1.0',
          },
        ],
        capabilities: { streaming: true },
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills: [
          {
            id: 'summarize',
            name: 'Summarize',
            description: 'Summarizes text',
            tags: ['nlp'],
            inputModes: ['text/plain'],
            outputModes: ['text/plain'],
          },
        ],
        ...overrides,
      });
    }

    it('accepts a valid agent card', async () => {
      mockFetchOnce({ body: agentCard() });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('valid');
      if (result.outcome === 'valid') {
        expect((result.spec as { name: string }).name).toBe('Test A2A Agent');
      }
    });

    it('accepts unknown/newer card fields (passthrough forward-compat)', async () => {
      mockFetchOnce({ body: agentCard({ someFutureField: { a: 1 } }) });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('valid');
    });

    it('rejects an interface protocolVersion absent from protocolVersions', async () => {
      mockFetchOnce({
        body: agentCard({
          protocolVersions: ['1.0'],
          supportedInterfaces: [
            {
              url: 'https://agent.example/a2a',
              protocolBinding: 'JSONRPC',
              protocolVersion: '2.0',
            },
          ],
        }),
      });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('invalid');
    });

    it('rejects a declared on-chain version the card does not publish', async () => {
      // The on-chain <-> card integrity check: the entry claims 9.9, the card
      // only backs 1.0, so the on-chain claim is false.
      mockFetchOnce({ body: agentCard({ protocolVersions: ['1.0'] }) });
      const result = await validateAgentCard(CARD_URL, ['1.0', '9.9']);
      expect(result.outcome).toBe('invalid');
      if (result.outcome === 'invalid') {
        expect(result.reason).toContain('9.9');
      }
    });

    it('accepts when every declared version is published by the card', async () => {
      mockFetchOnce({ body: agentCard({ protocolVersions: ['1.0', '1.1'] }) });
      const result = await validateAgentCard(CARD_URL, ['1.0', '1.1']);
      expect(result.outcome).toBe('valid');
    });

    it('rejects a non-https card url before fetching (MIP-002 requires https)', async () => {
      const result = await validateAgentCard(
        'http://agent.example/.well-known/agent-card.json',
        ['1.0']
      );
      expect(result.outcome).toBe('invalid');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects a card with no skills as invalid', async () => {
      mockFetchOnce({ body: agentCard({ skills: [] }) });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('invalid');
    });

    it('rejects an http supportedInterfaces url as invalid', async () => {
      mockFetchOnce({
        body: agentCard({
          supportedInterfaces: [
            {
              url: 'http://agent.example/a2a',
              protocolBinding: 'JSONRPC',
              protocolVersion: '1.0',
            },
          ],
        }),
      });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('invalid');
    });

    it('rejects an unknown protocolBinding as invalid', async () => {
      mockFetchOnce({
        body: agentCard({
          supportedInterfaces: [
            {
              url: 'https://agent.example/a2a',
              protocolBinding: 'SOAP',
              protocolVersion: '1.0',
            },
          ],
        }),
      });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('invalid');
    });

    it('rejects a non-JSON body as invalid', async () => {
      mockFetchOnce({ body: 'not json at all' });
      const result = await validateAgentCard(CARD_URL, ['1.0']);
      expect(result.outcome).toBe('invalid');
    });

    it('reports a private/SSRF target as unreachable without fetching', async () => {
      (lookup as jest.Mock).mockResolvedValue([
        { address: '169.254.169.254', family: 4 },
      ]);
      const result = await validateAgentCard(
        'https://metadata.internal/.well-known/agent-card.json',
        ['1.0']
      );
      expect(result.outcome).toBe('unreachable');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('validateSpecUrl dispatch', () => {
    it('routes a2a to the agent-card validator, not the x402 one', async () => {
      // Regression guard: the dispatcher was a two-way ternary, so a third kind
      // would silently be validated against the x402 manifest schema.
      mockFetchOnce({
        body: JSON.stringify({
          protocolVersions: ['1.0'],
          name: 'A',
          description: 'd',
          version: '1',
          supportedInterfaces: [
            {
              url: 'https://agent.example/a2a',
              protocolBinding: 'GRPC',
              protocolVersion: '1.0',
            },
          ],
          capabilities: {},
          defaultInputModes: [],
          defaultOutputModes: [],
          skills: [
            {
              id: 's',
              name: 'S',
              description: 'd',
              tags: [],
              inputModes: [],
              outputModes: [],
            },
          ],
        }),
      });
      const result = await validateSpecUrl(
        'a2a',
        'https://agent.example/.well-known/agent-card.json',
        { declaredProtocolVersions: ['1.0'] }
      );
      // An x402 validator would have rejected this body (no `resources`).
      expect(result.outcome).toBe('valid');
    });
  });
});
