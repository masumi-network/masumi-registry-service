import { useState } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RegistryEntry } from '@/lib/api/generated';
import type { Network } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { SPEC_NAMES, specUrl } from '@/lib/health-reason';
import { useAgentSpec } from '@/lib/queries/useAgentSpec';
import {
  describeSchema,
  readAgentCard,
  readOpenApi,
  readX402,
  type A2AView,
  type OpenApiContent,
  type OpenApiOperation,
  type OpenApiView,
  type SchemaSummary,
  type X402View,
} from '@/lib/spec-view';
import { Chips, DetailSection, Field, Mono, Prose, UrlText } from './AgentDetailSection';
import { RelativeTime } from './AgentList';

const METHOD_BADGE: Record<string, BadgeProps['variant']> = {
  get: 'success',
  put: 'warning',
  patch: 'warning',
  delete: 'destructive',
};

/**
 * Native disclosure whose content renders only while open: a spec can hold hundreds of
 * operations and deeply nested schemas, and closed ones should cost nothing.
 */
function Disclosure({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <details onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer rounded-sm py-1 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden">
        {summary}
      </summary>
      {isOpen && <div className="mt-2 space-y-4 pl-4">{children}</div>}
    </details>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </div>
  );
}

// `seen` holds the references already open above, so a cyclic schema stops instead of
// nesting forever.
function SchemaField({
  root,
  name,
  required,
  schema,
  location,
  description,
  seen,
}: {
  root: unknown;
  name: string;
  required: boolean;
  schema: unknown;
  location?: string;
  description?: string;
  seen: readonly string[];
}) {
  const summary = describeSchema(root, schema);
  const isRepeated = summary.refs.some((ref) => seen.includes(ref));
  const text = description ?? summary.description;
  const head = (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <code className="font-mono text-xs font-semibold wrap-break-word">{name}</code>
      {location && <span className="text-xs text-muted-foreground">in {location}</span>}
      {required && <span className="text-xs text-red-700 dark:text-red-400">required</span>}
      <span className="font-mono text-xs wrap-break-word text-muted-foreground">
        {summary.label}
      </span>
    </span>
  );

  return (
    <div className="min-w-0 space-y-1">
      {summary.fields.length > 0 && !isRepeated ? (
        <Disclosure summary={head}>
          <SchemaFields root={root} fields={summary.fields} seen={[...seen, ...summary.refs]} />
        </Disclosure>
      ) : (
        head
      )}
      {text && <Prose>{text}</Prose>}
    </div>
  );
}

function SchemaFields({
  root,
  fields,
  seen,
}: {
  root: unknown;
  fields: SchemaSummary['fields'];
  seen: readonly string[];
}) {
  return (
    <ul className="divide-y rounded-md border">
      {/* allOf parts can repeat a property name. */}
      {fields.map((field, index) => (
        <li key={`${field.name}:${index}`} className="px-3 py-2">
          <SchemaField root={root} {...field} seen={seen} />
        </li>
      ))}
    </ul>
  );
}

/** A schema's type, its description, and its fields one level at a time. */
function SchemaView({ root, schema }: { root: unknown; schema: unknown }) {
  const summary = describeSchema(root, schema);
  return (
    <div className="min-w-0 space-y-2">
      <p className="font-mono text-xs wrap-break-word">{summary.label}</p>
      {summary.description && <Prose>{summary.description}</Prose>}
      {summary.fields.length > 0 && (
        <SchemaFields root={root} fields={summary.fields} seen={summary.refs} />
      )}
    </div>
  );
}

function ContentList({ root, content }: { root: unknown; content: OpenApiContent[] }) {
  return content.map((item) => (
    <div key={item.mediaType} className="space-y-1">
      <p className="text-xs text-muted-foreground">{item.mediaType}</p>
      <SchemaView root={root} schema={item.schema} />
    </div>
  ));
}

function Operation({ root, operation }: { root: unknown; operation: OpenApiOperation }) {
  const { method, path, summary, description, deprecated, parameters, requestBody, responses } =
    operation;
  return (
    <Disclosure
      summary={
        <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <Badge variant={METHOD_BADGE[method]} className="font-mono uppercase">
            {method}
          </Badge>
          <code className="font-mono text-xs wrap-break-word">{path}</code>
          {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
          {deprecated && <Badge>Deprecated</Badge>}
        </span>
      }
    >
      {description && <Prose>{description}</Prose>}
      {parameters.length > 0 && (
        <Block title="Parameters">
          <ul className="divide-y rounded-md border">
            {parameters.map((parameter, index) => (
              <li key={index} className="px-3 py-2">
                <SchemaField
                  root={root}
                  name={parameter.name}
                  location={parameter.in}
                  required={parameter.required}
                  schema={parameter.schema}
                  description={parameter.description}
                  seen={[]}
                />
              </li>
            ))}
          </ul>
        </Block>
      )}
      {requestBody && (
        <Block title={requestBody.required ? 'Request body (required)' : 'Request body'}>
          {requestBody.description && <Prose>{requestBody.description}</Prose>}
          <ContentList root={root} content={requestBody.content} />
        </Block>
      )}
      {responses.length > 0 && (
        <Block title="Responses">
          <ul className="space-y-3">
            {responses.map((response) => (
              <li key={response.status} className="space-y-2">
                <p className="text-sm">
                  <code className="font-mono font-semibold">{response.status}</code>
                  {response.description && (
                    <span className="text-muted-foreground"> {response.description}</span>
                  )}
                </p>
                <ContentList root={root} content={response.content} />
              </li>
            ))}
          </ul>
        </Block>
      )}
    </Disclosure>
  );
}

function OpenApiSpec({ view }: { view: OpenApiView }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium wrap-break-word">
          {view.title} <span className="font-normal text-muted-foreground">v{view.version}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          OpenAPI {view.openapi} · {view.operations.length}{' '}
          {view.operations.length === 1 ? 'operation' : 'operations'}
        </p>
        {view.description && <Prose>{view.description}</Prose>}
      </div>
      {view.servers.length > 0 && (
        <dl>
          <Field label="Servers">
            <ul>
              {view.servers.map((server, index) => (
                <li key={index}>
                  <Mono>{server}</Mono>
                </li>
              ))}
            </ul>
          </Field>
        </dl>
      )}
      {view.operations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The document defines no operations, only components or webhooks.
        </p>
      ) : (
        <ul aria-label="Operations" className="divide-y rounded-md border">
          {view.operations.map((operation) => (
            <li key={`${operation.method} ${operation.path}`} className="px-3 py-2">
              <Operation root={view.root} operation={operation} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function X402Spec({ view }: { view: X402View }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {view.x402Version !== undefined && `x402 version ${view.x402Version} · `}
        {view.resources.length} {view.resources.length === 1 ? 'resource' : 'resources'}
      </p>
      <ul aria-label="Resources" className="divide-y rounded-md border">
        {view.resources.map((resource, index) => (
          <li key={index} className="px-3 py-2">
            <Disclosure
              summary={
                <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  {resource.type && <Badge className="uppercase">{resource.type}</Badge>}
                  <code className="font-mono text-xs wrap-break-word">{resource.resource}</code>
                </span>
              }
            >
              {resource.description && <Prose>{resource.description}</Prose>}
              {resource.mimeType && (
                <p className="text-xs text-muted-foreground">Responds with {resource.mimeType}</p>
              )}
              {/* Each embedded schema is its own JSON Schema document, so it is its own root. */}
              {resource.inputSchema && (
                <Block title="Input">
                  <SchemaView root={resource.inputSchema} schema={resource.inputSchema} />
                </Block>
              )}
              {resource.outputSchema && (
                <Block title="Output">
                  <SchemaView root={resource.outputSchema} schema={resource.outputSchema} />
                </Block>
              )}
            </Disclosure>
          </li>
        ))}
      </ul>
    </div>
  );
}

function List({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <Field label={label}>
      <Chips values={values} />
    </Field>
  );
}

function AgentCardSpec({ view }: { view: A2AView }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium wrap-break-word">
          {view.name}
          {view.version && (
            <span className="font-normal text-muted-foreground"> v{view.version}</span>
          )}
        </p>
        {view.provider && <p className="text-xs text-muted-foreground">By {view.provider}</p>}
        {view.description && <Prose>{view.description}</Prose>}
      </div>
      <dl className="grid gap-4 @xl:grid-cols-2">
        <List label="Protocol versions" values={view.protocolVersions} />
        {view.interfaces.length > 0 && (
          <Field label="Interfaces">
            <ul className="space-y-1">
              {view.interfaces.map((item, index) => (
                <li key={index}>
                  <span className="text-xs">
                    {item.protocolBinding} {item.protocolVersion}
                  </span>
                  <span className="block">
                    <Mono>{item.url}</Mono>
                  </span>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </dl>
      <ul aria-label="Skills" className="divide-y rounded-md border">
        {view.skills.map((skill, index) => (
          <li key={index} className="space-y-2 px-3 py-3">
            <p className="text-sm font-medium wrap-break-word">
              {skill.name}{' '}
              <span className="font-mono text-xs text-muted-foreground">{skill.id}</span>
            </p>
            {skill.description && <Prose>{skill.description}</Prose>}
            <dl className="grid gap-3 @xl:grid-cols-3">
              <List label="Tags" values={skill.tags} />
              <List label="Input" values={skill.inputModes} />
              <List label="Output" values={skill.outputModes} />
            </dl>
            {skill.examples.length > 0 && (
              <Block title="Examples">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {skill.examples.map((example, index) => (
                    <li key={index} className="wrap-break-word">
                      {example}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceNote({ children, url }: { children: string; url: string | null }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">{children}</p>
      {url && (
        <p>
          Source: <UrlText url={url} />
        </p>
      )}
    </div>
  );
}

function SpecBody({
  type,
  spec,
  url,
}: {
  type: keyof typeof SPEC_NAMES;
  spec: unknown;
  url: string | null;
}) {
  const unreadable = (
    <SourceNote url={url}>The cached spec is not in a shape this viewer can show.</SourceNote>
  );
  if (type === 'OpenApi') {
    const view = readOpenApi(spec);
    return view ? <OpenApiSpec view={view} /> : unreadable;
  }
  if (type === 'X402') {
    const view = readX402(spec);
    return view ? <X402Spec view={view} /> : unreadable;
  }
  const view = readAgentCard(spec);
  return view ? <AgentCardSpec view={view} /> : unreadable;
}

/** The registry's cached, validated copy of an OpenApi, x402 or A2A agent's spec. */
export function AgentSpecViewer({ agent, network }: { agent: RegistryEntry; network: Network }) {
  // Standard entries have no spec; the endpoint answers them with a 404.
  const query = useAgentSpec(network, agent.agentIdentifier, agent.type !== 'Standard');
  if (agent.type === 'Standard') return null;
  const url = specUrl(agent);
  const validatedAt = query.data?.specValidatedAt;

  return (
    <DetailSection
      id="agent-spec-heading"
      title="Agent spec"
      description={
        <>
          {SPEC_NAMES[agent.type]}
          {validatedAt && (
            <>
              , validated <RelativeTime date={validatedAt} />
            </>
          )}
        </>
      }
    >
      {query.isPending ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">Loading spec…</span>
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : query.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>Could not load the spec. {classifyAuthError(query.error).message}</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.data.spec == null ? (
        <SourceNote url={url}>
          The registry has no cached copy of this spec. It keeps one after a successful health
          check, and only for specs up to 256 KB.
        </SourceNote>
      ) : (
        <SpecBody type={agent.type} spec={query.data.spec} url={url} />
      )}
    </DetailSection>
  );
}
