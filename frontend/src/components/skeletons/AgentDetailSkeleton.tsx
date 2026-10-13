import { Skeleton } from '@/components/ui/skeleton';

// Header, then the overview and health sections, close enough that the page does not jump.
export function AgentDetailSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading agent…</span>
      <div className="space-y-3">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-5 w-48 max-w-full" />
      </div>
      {[6, 3].map((fields, index) => (
        <div key={index} className="space-y-4 rounded-lg border p-4">
          <Skeleton className="h-4 w-24" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: fields }).map((_, field) => (
              <div key={field} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full max-w-xs" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
