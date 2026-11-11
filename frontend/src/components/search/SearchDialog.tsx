import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useSearch, type SearchableItem } from '@/lib/hooks/useSearch';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

// Searching agents is a registry request, so wait for a pause in typing instead of
// sending one per keystroke.
const SEARCH_DEBOUNCE_MS = 300;

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const router = useRouter();
  const { handleSearch, isLoading } = useSearch(open);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchableItem[]>([]);
  // An empty box settles at once (no delay), so text typed right after clearing it, or after
  // closing and reopening the dialog, never searches for the previous text.
  const isBoxEmpty = searchQuery.trim() === '';
  const debouncedQuery = useDebouncedValue(searchQuery, isBoxEmpty ? 0 : SEARCH_DEBOUNCE_MS);
  const query = isBoxEmpty ? '' : debouncedQuery;
  const isWaitingToSearch = !isBoxEmpty && query !== searchQuery;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handleSearch(query).then((results) => {
      if (!cancelled) {
        setSearchResults(results || []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, handleSearch, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchQuery('');
      setSearchResults([]);
    }
    onOpenChange(nextOpen);
  };

  const handleSearchSelect = (result: SearchableItem) => {
    handleOpenChange(false);
    router.push(result.href).then(() => {
      if (result.elementId) {
        setTimeout(() => {
          const element = document.getElementById(result.elementId || '');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-element');
            if (result.type === 'action' && element instanceof HTMLElement) {
              element.click();
            }
            setTimeout(() => {
              element.classList.remove('highlight-element');
            }, 4000);
          }
        }, 100);
      }
    });
  };

  const handleCommandSelect = (value: string) => {
    const result = searchResults.find((r) => r.id === value);
    if (result) {
      handleSearchSelect(result);
    }
  };

  const trimmedQuery = searchQuery.trim();
  const showEmpty =
    !isLoading && !isWaitingToSearch && trimmedQuery.length > 0 && searchResults.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
      description="Search pages, agents, sources, and actions"
    >
      <CommandInput
        placeholder="Search pages, agents, sources…"
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {showEmpty ? <CommandEmpty>No results found.</CommandEmpty> : null}
        {searchResults.length > 0 ? (
          <CommandGroup>
            {searchResults.map((result) => (
              <CommandItem
                key={result.id}
                value={result.id}
                onSelect={() => handleCommandSelect(result.id)}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <div className="font-medium">{result.title || '…'}</div>
                {result.description ? (
                  <div className="text-sm text-muted-foreground">{result.description}</div>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {isLoading || isWaitingToSearch ? (
          <div className="text-muted-foreground px-3 py-2 text-xs">Searching…</div>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
