import {
  parseOpenApiDocument,
  type SpecValidationOutcome,
} from '@/services/spec-validation';

// The YAML parser is synchronous and super-linear in the size of an untrusted
// body, so YAML is only parsed when it is small, looks like an OpenAPI document
// and the origin has not already cost a parse. JSON has no such limit.
// ponytail: larger YAML documents are reported Invalid; parse them in a worker
// thread if real agents publish them.
export const MAX_YAML_BYTES = 64 * 1024;
const OPENAPI_KEY_WINDOW = 4096;

/** How many YAML bodies one origin may still make the registry parse. */
export interface YamlBudget {
  yamlParsesLeft: number;
}

const invalid = (reason: string): SpecValidationOutcome => ({
  outcome: 'invalid',
  reason,
});

/** Validate a body fetched from an untrusted origin, bounding what it can cost. */
export function parseDiscoveredDocument(
  body: string,
  budget: YamlBudget
): SpecValidationOutcome {
  if (body.trimStart().startsWith('{')) {
    return parseOpenApiDocument(body, { allowYaml: false });
  }
  if (Buffer.byteLength(body) > MAX_YAML_BYTES) {
    return invalid(
      `not JSON and over ${MAX_YAML_BYTES} bytes: YAML not parsed`
    );
  }
  if (!/^openapi\s*:/m.test(body.slice(0, OPENAPI_KEY_WINDOW))) {
    return invalid('not JSON and no top-level openapi key');
  }
  if (budget.yamlParsesLeft <= 0) {
    return invalid('another YAML body of this origin was already parsed');
  }
  budget.yamlParsesLeft -= 1;
  return parseOpenApiDocument(body, { allowYaml: true, maxAliasCount: 0 });
}
