import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface PaginationProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  className?: string;
}

/** "Load more" for cursor-paginated lists, as in the payment service admin frontend. */
export function Pagination({ hasMore, isLoading, onLoadMore, className }: PaginationProps) {
  if (!hasMore && !isLoading) {
    return (
      <div className={cn('flex justify-center', className)}>
        <span className="text-xs text-muted-foreground">End of results</span>
      </div>
    );
  }

  return (
    <div className={cn('flex justify-center', className)}>
      <Button
        variant="outline"
        size="sm"
        className="min-w-28"
        onClick={onLoadMore}
        disabled={!hasMore || isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Loading…
          </>
        ) : (
          'Load more'
        )}
      </Button>
    </div>
  );
}
