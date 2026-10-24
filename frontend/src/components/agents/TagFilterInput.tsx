import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_TAGS, MAX_TAG_LENGTH } from '@/lib/agent-filters';

interface TagFilterInputProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

/** Free-text tags: the registry has no tag list to choose from. */
export function TagFilterInput({ tags, onAdd, onRemove }: TagFilterInputProps) {
  const [draft, setDraft] = useState('');
  const isFull = tags.length >= MAX_TAGS;

  function addDraft() {
    const tag = draft.trim();
    setDraft('');
    if (tag) onAdd(tag);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="filter-tags">Tags</Label>
      {tags.length > 0 && (
        <ul aria-label="Selected tags" className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted py-0.5 pl-2.5 pr-1 text-xs"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onRemove(tag)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id="filter-tags"
        value={draft}
        maxLength={MAX_TAG_LENGTH}
        disabled={isFull}
        placeholder={isFull ? `Up to ${MAX_TAGS} tags` : 'Type a tag, press Enter'}
        aria-describedby="filter-tags-hint"
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={addDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addDraft();
          } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
            onRemove(tags[tags.length - 1]);
          }
        }}
      />
      <p id="filter-tags-hint" className="text-xs text-muted-foreground">
        Agents with any of these tags match.
      </p>
    </div>
  );
}
