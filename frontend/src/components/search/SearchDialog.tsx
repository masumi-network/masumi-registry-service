import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useSearch, type SearchableItem } from '@/lib/hooks/useSearch';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const router = useRouter();
  const { handleSearch, isLoading } = useSearch(open);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchableItem[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handleSearch(searchQuery).then((results) => {
      if (!cancelled) {
        setSearchResults(results || []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, handleSearch, open]);

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="overflow-hidden p-0 gap-0 shadow-lg"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command className="rounded-lg border-0" shouldFilter={false}>
          <CommandInput
            placeholder="Type to search..."
            value={searchQuery}
            onValueChange={(value) => {
              setSearchQuery(value);
            }}
          />
          <CommandList>
            {searchResults.length > 0 ? (
              <CommandGroup>
                {searchResults.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={result.id}
                    onSelect={() => handleCommandSelect(result.id)}
                    onClick={() => handleCommandSelect(result.id)}
                    className="flex flex-col items-start p-2 cursor-pointer pointer-events-auto"
                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                  >
                    <div className="font-medium">{result.title || '...'}</div>
                    {result.description && (
                      <div className="text-sm text-muted-foreground overflow-x-auto">
                        {result.description}
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : isLoading ? null : (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
            {isLoading && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
