// Reads the cached agent spec served by GET /registry-entry-spec into what the spec viewer
// renders. The spec is untrusted JSON written by the agent's owner: every field is checked
// before use, and only local `#/...` references are followed, never fetched.

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

// A chain of references longer than this is treated as unresolvable.
const MAX_REF_HOPS = 10;
// Long enums and oneOf/anyOf lists are cut short in a type label.
const MAX_ENUM_VALUES = 8;
// The most schemas one type label may visit before it ends in "…". A hostile spec can nest
// thousands of levels (stack overflow) or fan out oneOf at every level (exponential work).
const LABEL_BUDGET = 32;
// An enum or const can hold any JSON, of any size.
const MAX_LABEL_LENGTH = 200;

type Budget = { left: number };

// JSON Pointer escapes: "~1" is "/", "~0" is "~".
function unescape(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function lookup(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('#/')) return undefined;
  let node = root;
  for (const raw of pointer.slice(2).split('/')) {
    let key: string;
    try {
      key = unescape(decodeURIComponent(raw));
    } catch {
      return undefined;
    }
    // Own keys only, so a "__proto__" segment cannot reach Object.prototype.
    if (!isObject(node) && !Array.isArray(node)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(node, key)) return undefined;
    node = (node as JsonObject)[key];
  }
  return node;
}

/** Follows `$ref`s inside `root`. `ref` is the last one followed, `schema` is undefined when it leads nowhere. */
function resolveRef(root: unknown, value: unknown): { schema?: JsonObject; ref?: string } {
  let current = value;
  let ref: string | undefined;
  for (let hop = 0; hop < MAX_REF_HOPS; hop++) {
    if (!isObject(current)) return { ref };
    const next = text(current.$ref);
    if (!next) return { schema: current, ref };
    ref = next;
    current = lookup(root, next);
  }
  return { ref };
}

function refName(ref: string): string {
  const name = ref.split('/').pop();
  return name ? unescape(name) : ref;
}

// --- JSON Schema ---------------------------------------------------------------------

interface SchemaField {
  name: string;
  required: boolean;
  schema: unknown;
}

export interface SchemaSummary {
  /** "string (email)", "array of Pet", "Pet · object" */
  label: string;
  description?: string;
  /** Local references this schema resolves through; a viewer stops when it meets one again. */
  refs: string[];
  /** Properties of the object, or of the array's items. */
  fields: SchemaField[];
}

// JSON.stringify throws on very deep values; a label is not worth a crash.
function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '…';
  }
}

function nameOrType(root: unknown, value: unknown, budget: Budget): string {
  const { schema, ref } = resolveRef(root, value);
  // Name a referenced schema rather than describe it: references can be cyclic.
  if (ref) return refName(ref);
  return schema ? typeLabel(root, schema, budget) : 'any';
}

function typeLabel(root: unknown, schema: JsonObject, budget: Budget): string {
  budget.left -= 1;
  if (budget.left < 0) return '…';
  if (schema.const !== undefined) return `constant ${json(schema.const)}`;
  if (Array.isArray(schema.enum)) {
    const values = schema.enum.slice(0, MAX_ENUM_VALUES).map(json);
    return `one of ${values.join(', ')}${schema.enum.length > MAX_ENUM_VALUES ? ', …' : ''}`;
  }
  const variants = [schema.oneOf, schema.anyOf].find(Array.isArray);
  if (variants) {
    const names = variants
      .slice(0, MAX_ENUM_VALUES)
      .map((variant) => nameOrType(root, variant, budget));
    return `${names.join(' | ')}${variants.length > MAX_ENUM_VALUES ? ' | …' : ''}`;
  }
  const type = Array.isArray(schema.type) ? strings(schema.type).join(' | ') : text(schema.type);
  if (type === 'array' || schema.items !== undefined) {
    return `array of ${nameOrType(root, schema.items, budget)}`;
  }
  const format = text(schema.format);
  if (type) return format ? `${type} (${format})` : type;
  return isObject(schema.properties) || Array.isArray(schema.allOf) ? 'object' : 'any';
}

// The schema plus its allOf members: the usual way OpenAPI composes models.
function partsOf(root: unknown, schema: JsonObject): { schema: JsonObject; ref?: string }[] {
  const members = (Array.isArray(schema.allOf) ? schema.allOf : []).map((part) =>
    resolveRef(root, part),
  );
  return [
    { schema },
    ...members.flatMap((member) =>
      member.schema ? [{ schema: member.schema, ref: member.ref }] : [],
    ),
  ];
}

function fieldsOf(parts: JsonObject[]): SchemaField[] {
  const required = new Set(parts.flatMap((part) => strings(part.required)));
  // A property repeated across allOf members is one field; the later definition wins.
  const fields = new Map<string, unknown>();
  for (const part of parts) {
    if (!isObject(part.properties)) continue;
    for (const [name, value] of Object.entries(part.properties)) fields.set(name, value);
  }
  return [...fields].map(([name, value]) => ({
    name,
    required: required.has(name),
    schema: value,
  }));
}

export function describeSchema(root: unknown, value: unknown): SchemaSummary {
  const { schema, ref } = resolveRef(root, value);
  if (!schema) {
    return {
      label: ref ? `${ref} (unresolved)` : 'any',
      refs: ref ? [ref] : [],
      fields: [],
    };
  }

  const fullType = typeLabel(root, schema, { left: LABEL_BUDGET });
  const type =
    fullType.length > MAX_LABEL_LENGTH ? `${fullType.slice(0, MAX_LABEL_LENGTH)}…` : fullType;
  const items = schema.items !== undefined ? resolveRef(root, schema.items) : undefined;
  const parts = partsOf(root, items?.schema ?? schema);
  // Every reference the fields come through, so a cycle through allOf stops too.
  const refs = [ref, items?.ref, ...parts.map((part) => part.ref)].filter(
    (item): item is string => item !== undefined,
  );
  return {
    label: ref ? `${refName(ref)} · ${type}` : type,
    description: text(schema.description),
    refs,
    fields: fieldsOf(parts.map((part) => part.schema)),
  };
}

// --- OpenAPI ---------------------------------------------------------------------------

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

interface OpenApiParameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema: unknown;
}

export interface OpenApiContent {
  mediaType: string;
  schema: unknown;
}

export interface OpenApiOperation {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  parameters: OpenApiParameter[];
  requestBody: { required: boolean; description?: string; content: OpenApiContent[] } | null;
  responses: { status: string; description?: string; content: OpenApiContent[] }[];
}

export interface OpenApiView {
  root: JsonObject;
  title: string;
  version: string;
  openapi: string;
  description?: string;
  servers: string[];
  operations: OpenApiOperation[];
}

function readParameters(root: JsonObject, value: unknown): OpenApiParameter[] {
  return (Array.isArray(value) ? value : []).flatMap((raw) => {
    const parameter = resolveRef(root, raw).schema;
    const name = text(parameter?.name);
    const location = text(parameter?.in);
    if (!parameter || !name || !location) return [];
    return [
      {
        name,
        in: location,
        required: parameter.required === true,
        description: text(parameter.description),
        schema: parameter.schema,
      },
    ];
  });
}

function readContent(value: unknown): OpenApiContent[] {
  if (!isObject(value)) return [];
  return Object.entries(value).map(([mediaType, media]) => ({
    mediaType,
    schema: isObject(media) ? media.schema : undefined,
  }));
}

function readOperation(
  root: JsonObject,
  path: string,
  method: string,
  operation: JsonObject,
  shared: OpenApiParameter[],
): OpenApiOperation {
  const own = readParameters(root, operation.parameters);
  const body = resolveRef(root, operation.requestBody).schema;
  return {
    method,
    path,
    summary: text(operation.summary),
    description: text(operation.description),
    deprecated: operation.deprecated === true,
    // An operation's parameter overrides the path's one with the same name and location.
    parameters: [
      ...shared.filter((item) => !own.some((o) => o.name === item.name && o.in === item.in)),
      ...own,
    ],
    requestBody: body
      ? {
          required: body.required === true,
          description: text(body.description),
          content: readContent(body.content),
        }
      : null,
    responses: Object.entries(isObject(operation.responses) ? operation.responses : {}).map(
      ([status, raw]) => {
        const response = resolveRef(root, raw).schema;
        return {
          status,
          description: text(response?.description),
          content: readContent(response?.content),
        };
      },
    ),
  };
}

/** Null when the document is not the OpenAPI shape the registry validated. */
export function readOpenApi(spec: unknown): OpenApiView | null {
  if (!isObject(spec) || !isObject(spec.info)) return null;
  const title = text(spec.info.title);
  const version = text(spec.info.version);
  const openapi = text(spec.openapi);
  if (!title || !version || !openapi) return null;

  const paths = isObject(spec.paths) ? spec.paths : {};
  const operations = Object.entries(paths).flatMap(([path, raw]) => {
    const item = resolveRef(spec, raw).schema;
    if (!item) return [];
    const shared = readParameters(spec, item.parameters);
    return HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      return isObject(operation) ? [readOperation(spec, path, method, operation, shared)] : [];
    });
  });

  return {
    root: spec,
    title,
    version,
    openapi,
    description: text(spec.info.description),
    servers: (Array.isArray(spec.servers) ? spec.servers : []).flatMap((server) => {
      const url = isObject(server) ? text(server.url) : undefined;
      return url ? [url] : [];
    }),
    operations,
  };
}

// --- x402 ------------------------------------------------------------------------------

interface X402Resource {
  resource: string;
  type?: string;
  description?: string;
  mimeType?: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
}

export interface X402View {
  x402Version?: number;
  resources: X402Resource[];
}

/** Null when the manifest is not the shape the registry validated (docs/x402-agent-manifest.md). */
export function readX402(spec: unknown): X402View | null {
  if (!isObject(spec) || !Array.isArray(spec.resources)) return null;
  const resources = spec.resources.flatMap((raw) => {
    const resource = isObject(raw) ? text(raw.resource) : undefined;
    if (!isObject(raw) || !resource) return [];
    return [
      {
        resource,
        type: text(raw.type),
        description: text(raw.description),
        mimeType: text(raw.mimeType),
        inputSchema: isObject(raw.inputSchema) ? raw.inputSchema : undefined,
        outputSchema: isObject(raw.outputSchema) ? raw.outputSchema : undefined,
      },
    ];
  });
  if (resources.length === 0) return null;
  return {
    x402Version: typeof spec.x402Version === 'number' ? spec.x402Version : undefined,
    resources,
  };
}

// --- A2A -------------------------------------------------------------------------------

interface A2ASkill {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
  examples: string[];
}

export interface A2AView {
  name: string;
  description?: string;
  version?: string;
  provider?: string;
  protocolVersions: string[];
  interfaces: { url: string; protocolBinding: string; protocolVersion: string }[];
  skills: A2ASkill[];
}

/** Null when the agent card is not the MIP-002 shape the registry validated. */
export function readAgentCard(spec: unknown): A2AView | null {
  if (!isObject(spec)) return null;
  const name = text(spec.name);
  if (!name) return null;
  return {
    name,
    description: text(spec.description),
    version: text(spec.version),
    provider: isObject(spec.provider) ? text(spec.provider.organization) : undefined,
    protocolVersions: strings(spec.protocolVersions),
    interfaces: (Array.isArray(spec.supportedInterfaces) ? spec.supportedInterfaces : []).flatMap(
      (raw) => {
        const url = isObject(raw) ? text(raw.url) : undefined;
        if (!isObject(raw) || !url) return [];
        return [
          {
            url,
            protocolBinding: text(raw.protocolBinding) ?? '—',
            protocolVersion: text(raw.protocolVersion) ?? '—',
          },
        ];
      },
    ),
    skills: (Array.isArray(spec.skills) ? spec.skills : []).flatMap((raw) => {
      const id = isObject(raw) ? text(raw.id) : undefined;
      if (!isObject(raw) || !id) return [];
      return [
        {
          id,
          name: text(raw.name) ?? id,
          description: text(raw.description),
          tags: strings(raw.tags),
          inputModes: strings(raw.inputModes),
          outputModes: strings(raw.outputModes),
          examples: strings(raw.examples),
        },
      ];
    }),
  };
}
