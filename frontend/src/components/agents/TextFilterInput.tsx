import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const COMMIT_DELAY_MS = 400;

interface TextFilterInputProps {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  placeholder?: string;
  /** Changes whenever the URL view changes, so a replaced commit can be noticed. */
  revision: unknown;
  onCommit: (value: string) => void;
  /** An error message for a value the API would reject; such a value is never committed. */
  validate?: (value: string) => string | null;
  hint?: string;
  disabled?: boolean;
  type?: 'text' | 'search';
  inputMode?: 'text' | 'numeric' | 'decimal';
  labelClassName?: string;
  inputClassName?: string;
}

/**
 * A text filter that applies once typing pauses, or at once on Enter or leaving the field,
 * so every keystroke does not start a registry query.
 */
export function TextFilterInput({
  id,
  label,
  value,
  maxLength,
  placeholder,
  revision,
  onCommit,
  validate,
  hint,
  disabled,
  type = 'text',
  inputMode,
  labelClassName,
  inputClassName = 'font-mono text-xs',
}: TextFilterInputProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const [seenRevision, setSeenRevision] = useState(revision);
  // What this field last sent, until it comes back as `value`. That echo must not reset a
  // draft the user has kept typing into (or strip the space they just typed).
  const [awaitingEcho, setAwaitingEcho] = useState<string | null>(null);
  const [externalChanges, setExternalChanges] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A draft that failed `validate` and was kept out of the URL. When the error clears,
  // say because the other bound of a range moved, it is committed after all.
  const rejectedDraft = useRef<string | null>(null);

  if (value !== syncedValue || revision !== seenRevision) {
    setSyncedValue(value);
    setSeenRevision(revision);
    if (value === awaitingEcho) {
      // Our own commit came back: keep the draft as typed.
      setAwaitingEcho(null);
    } else if (value !== syncedValue || awaitingEcho !== null) {
      // Changed elsewhere (back/forward, a removed filter), or our commit was replaced
      // before it landed (Reset clicked right after typing): show what the URL holds.
      setAwaitingEcho(null);
      setDraft(value);
      setExternalChanges((count) => count + 1);
    }
  }

  // A commit still pending from before an outside change would undo that change.
  useEffect(() => clearTimeout(timer.current), [externalChanges]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const trimmedDraft = draft.trim();
  const error = trimmedDraft && validate ? validate(trimmedDraft) : null;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function commit(next: string) {
    clearTimeout(timer.current);
    timer.current = undefined;
    const trimmed = next.trim();
    rejectedDraft.current = null;
    if (trimmed === value) return;
    // The message under the field explains why; the view keeps its last valid value.
    if (trimmed && validate?.(trimmed)) {
      rejectedDraft.current = trimmed;
      return;
    }
    setAwaitingEcho(trimmed);
    onCommit(trimmed);
  }

  const retryRejectedDraft = useEffectEvent(() => {
    if (rejectedDraft.current !== null && rejectedDraft.current === draft.trim()) commit(draft);
  });
  useEffect(() => {
    if (!error) retryRejectedDraft();
  }, [error]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(next), COMMIT_DELAY_MS);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft);
        }}
        onBlur={() => {
          // Leaving the field (say, for a nav link) must not leave a commit pending.
          if (timer.current !== undefined) commit(draft);
        }}
        className={inputClassName}
      />
      {/* Always rendered, so screen readers announce an error when it appears. */}
      <p id={errorId} aria-live="polite" className="text-xs text-destructive empty:hidden">
        {error}
      </p>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
