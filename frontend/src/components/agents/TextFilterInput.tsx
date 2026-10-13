import { useEffect, useRef, useState } from 'react';
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
}: TextFilterInputProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const [seenRevision, setSeenRevision] = useState(revision);
  // What this field last sent, until it comes back as `value`. That echo must not reset a
  // draft the user has kept typing into (or strip the space they just typed).
  const [awaitingEcho, setAwaitingEcho] = useState<string | null>(null);
  const [externalChanges, setExternalChanges] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  function commit(next: string) {
    clearTimeout(timer.current);
    timer.current = undefined;
    const trimmed = next.trim();
    if (trimmed === value) return;
    setAwaitingEcho(trimmed);
    onCommit(trimmed);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
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
        className="font-mono text-xs"
      />
    </div>
  );
}
