import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ConfigTabSkeletonProps {
  /**
   * Test id for the wrapping element so existing loading-state assertions
   * keep working when the spinner is replaced by this skeleton.
   */
  testId?: string;
}

/**
 * Content-shaped Suspense fallback used while a Configuration tab (or
 * sub-tab) is being lazily fetched for the first time. The shape roughly
 * matches the typical Configuration tab layout — a title + description,
 * followed by a card containing a toolbar and a list of rows — so the
 * real content can swap in without a visible layout shift.
 */
export function ConfigTabSkeleton({ testId }: ConfigTabSkeletonProps) {
  return (
    <div
      className="space-y-4"
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-4 w-20 hidden sm:block" />
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </Card>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
