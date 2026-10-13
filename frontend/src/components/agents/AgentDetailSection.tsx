import { httpUrl } from '@/lib/utils';

/** One titled block of the agent detail page. */
export function DetailSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-lg border">
      <div className="space-y-0.5 border-b px-4 py-3">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="@container p-4">{children}</div>
    </section>
  );
}

/** Label above value, so long identifiers keep the full width. Use inside a `<dl>`. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

/** A long on-chain value (identifier, address) in full, wrapping anywhere. */
export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}

/**
 * A link only when the URL is http(s); anything else shows as plain text. Agent owners
 * write these URLs, so a `javascript:` one must never become clickable.
 */
export function UrlText({ url }: { url: string }) {
  const href = httpUrl(url);
  if (!href) return <Mono>{url}</Mono>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs break-all underline-offset-4 hover:underline"
    >
      {/* The parsed form, so bidi controls or lookalike hosts cannot disguise the target. */}
      {href}
    </a>
  );
}

/** Tags and similar short values. Index keys: owner-written lists can repeat a value. */
export function Chips({ values, label }: { values: string[]; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1">
      {values.map((value, index) => (
        <li key={index} className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {value}
        </li>
      ))}
    </ul>
  );
}

/** Owner-written text: plain, line breaks kept, never parsed as HTML or markdown. */
export function Prose({ children }: { children: string }) {
  return <p className="text-sm whitespace-pre-line text-muted-foreground">{children}</p>;
}
