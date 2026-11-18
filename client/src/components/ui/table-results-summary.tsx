import { cn } from "@/lib/utils";

interface TableResultsSummaryProps {
  /** Number of items currently displayed */
  displayedCount: number;
  /** Total number of items before filtering */
  totalCount: number;
  /** Name of the items (e.g., "users", "projects", "emails") - singular or plural will be handled automatically */
  itemName?: string;
  /** Whether any filters are currently active */
  isFiltered?: boolean;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Reusable component for displaying table results summary with filter indication.
 * Shows "Showing X of Y items" with optional "(filtered from Z)" indicator.
 * 
 * @example
 * <TableResultsSummary 
 *   displayedCount={5} 
 *   totalCount={100} 
 *   itemName="users"
 *   isFiltered={true}
 * />
 * // Outputs: "Showing 5 of 100 users (filtered from 100)"
 */
export function TableResultsSummary({
  displayedCount,
  totalCount,
  itemName = "items",
  isFiltered = false,
  className
}: TableResultsSummaryProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="text-sm text-gray-600 dark:text-gray-300">
        Showing {displayedCount} of {totalCount} {itemName}
        {isFiltered && (
          <span className="text-blue-600 dark:text-blue-400 ml-1">
            (filtered from {totalCount})
          </span>
        )}
      </div>
    </div>
  );
}
