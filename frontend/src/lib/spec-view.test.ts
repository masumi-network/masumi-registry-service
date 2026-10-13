import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeSchema, readAgentCard, readOpenApi, readX402 } from './spec-view';

describe('describeSchema', () => {
  it('names a referenced schema and lists its fields', () => {
    const root = {
      components: {
        schemas: {
          Pet: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' }, tag: { type: 'string', format: 'uuid' } },
          },
        },
      },
    };
    const summary = describeSchema(root, { $ref: '#/components/schemas/Pet' });
    assert.equal(summary.label, 'Pet · object');
    assert.deepEqual(summary.refs, ['#/components/schemas/Pet']);
    assert.deepEqual(
      summary.fields.map((field) => [field.name, field.required]),
      [
        ['name', true],
        ['tag', false],
      ],
    );
  });

  it('never resolves a reference through the prototype', () => {
    const summary = describeSchema({}, { $ref: '#/__proto__/constructor' });
    assert.equal(summary.label, '#/__proto__/constructor (unresolved)');
  });

  it('gives up on a reference cycle instead of looping', () => {
    const root = { a: { $ref: '#/b' }, b: { $ref: '#/a' } };
    assert.match(describeSchema(root, { $ref: '#/a' }).label, /unresolved/);
  });

  it('does not follow references outside the document', () => {
    assert.match(describeSchema({}, { $ref: 'https://evil.example/s.json' }).label, /unresolved/);
  });

  it('bounds the work a deeply nested schema can cause', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let depth = 0; depth < 10_000; depth += 1) schema = { type: 'array', items: schema };
    const summary = describeSchema({}, schema);
    assert.ok(summary.label.endsWith('…'));
    assert.ok(summary.label.length <= 201);
  });
});

describe('readOpenApi', () => {
  it('reads the operations of a valid document', () => {
    const view = readOpenApi({
      openapi: '3.1.0',
      info: { title: 'Agent', version: '1.0' },
      servers: [{ url: 'https://agent.example' }, { url: 42 }],
      paths: { '/run': { post: { summary: 'Run' }, notAMethod: {} } },
    });
    assert.ok(view);
    assert.deepEqual(view.servers, ['https://agent.example']);
    assert.deepEqual(
      view.operations.map((operation) => [operation.method, operation.path]),
      [['post', '/run']],
    );
  });

  it('rejects a document without a title, version or openapi field', () => {
    assert.equal(readOpenApi({ info: { title: 'x' } }), null);
    assert.equal(readOpenApi('not an object'), null);
  });
});

describe('readX402', () => {
  it('keeps only resources with a URL', () => {
    const view = readX402({
      x402Version: 1,
      resources: [{ resource: 'https://a/r' }, { type: 'x' }],
    });
    assert.equal(view?.resources.length, 1);
    assert.equal(readX402({ resources: [] }), null);
  });
});

describe('readAgentCard', () => {
  it('needs a name and ignores non-string protocol versions', () => {
    assert.equal(readAgentCard({}), null);
    const view = readAgentCard({ name: 'Agent', protocolVersions: ['1.0', 2] });
    assert.deepEqual(view?.protocolVersions, ['1.0']);
  });
});
