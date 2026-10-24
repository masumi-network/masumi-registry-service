import { MAX_YAML_BYTES, parseDiscoveredDocument } from './parse-document';

const DOC = {
  openapi: '3.1.0',
  info: { title: 'T', version: '1' },
  paths: {},
};
const YAML_DOC =
  'openapi: 3.1.0\ninfo:\n  title: T\n  version: "1"\npaths: {}\n';

const budget = () => ({ yamlParsesLeft: 1 });

describe('parseDiscoveredDocument', () => {
  it('accepts a JSON document', () => {
    expect(parseDiscoveredDocument(JSON.stringify(DOC), budget())).toEqual({
      outcome: 'valid',
      spec: DOC,
    });
  });

  it('accepts a JSON document much larger than the YAML limit', () => {
    const big = { ...DOC, components: { d: 'x'.repeat(MAX_YAML_BYTES * 4) } };

    expect(
      parseDiscoveredDocument(JSON.stringify(big), budget())
    ).toMatchObject({ outcome: 'valid' });
  });

  it('accepts a small YAML document and spends the origin its one parse', () => {
    const yamlBudget = budget();

    expect(parseDiscoveredDocument(YAML_DOC, yamlBudget)).toMatchObject({
      outcome: 'valid',
    });
    expect(yamlBudget.yamlParsesLeft).toBe(0);
  });

  it('does not parse a second YAML body for the same origin', () => {
    const yamlBudget = { yamlParsesLeft: 0 };

    expect(parseDiscoveredDocument(YAML_DOC, yamlBudget)).toMatchObject({
      outcome: 'invalid',
      reason: expect.stringContaining('YAML'),
    });
  });

  it('never hands malformed JSON to the YAML parser', () => {
    const yamlBudget = budget();
    const hostile = '{' + '1,'.repeat(100_000);

    const started = Date.now();
    const result = parseDiscoveredDocument(hostile, yamlBudget);

    expect(result).toMatchObject({ outcome: 'invalid' });
    expect(yamlBudget.yamlParsesLeft).toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('refuses a YAML body over the limit without parsing it', () => {
    const yamlBudget = budget();
    const body = 'openapi: 3.1.0\n' + 'k: v\n'.repeat(MAX_YAML_BYTES);

    expect(parseDiscoveredDocument(body, yamlBudget)).toMatchObject({
      outcome: 'invalid',
      reason: expect.stringContaining(String(MAX_YAML_BYTES)),
    });
    expect(yamlBudget.yamlParsesLeft).toBe(1);
  });

  it('does not parse YAML that has no top-level openapi key', () => {
    const yamlBudget = budget();

    expect(
      parseDiscoveredDocument('<!doctype html><html></html>', yamlBudget)
    ).toMatchObject({ outcome: 'invalid' });
    expect(yamlBudget.yamlParsesLeft).toBe(1);
  });

  it('rejects YAML aliases rather than expanding them', () => {
    const body =
      'openapi: 3.1.0\ninfo: &i\n  title: T\n  version: "1"\nalso: *i\npaths: {}\n';

    expect(parseDiscoveredDocument(body, budget())).toMatchObject({
      outcome: 'invalid',
    });
  });

  it('rejects a JSON document that is not OpenAPI', () => {
    expect(
      parseDiscoveredDocument('{"hello":"world"}', budget())
    ).toMatchObject({
      outcome: 'invalid',
      reason: expect.stringContaining('not a valid OpenAPI document'),
    });
  });
});
