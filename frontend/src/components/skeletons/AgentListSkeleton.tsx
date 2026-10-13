import { Skeleton } from '@/components/ui/skeleton';

// Matches the stacked row layout of AgentList closely enough that the list does not jump.
export function AgentListSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className="divide-y">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="space-y-2 px-4 py-4">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-3 w-64 max-w-full" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-12" />
          </div>
        </li>
      ))}
    </ul>
  );
}
