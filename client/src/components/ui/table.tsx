import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ref, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm dark:text-white", className)}
        {...props}
      />
    </div>
  )
}
Table.displayName = "Table"

function TableHeader({ className, ref, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead ref={ref} className={cn("[&_tr]:border-b table-header bg-gray-50 dark:bg-gray-800", className)} {...props} />
  )
}
TableHeader.displayName = "TableHeader"

function TableBody({ className, ref, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0 [&_tr:last-child_td]:border-0", className)}
      {...props}
    />
  )
}
TableBody.displayName = "TableBody"

function TableFooter({ className, ref, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      ref={ref}
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}
TableFooter.displayName = "TableFooter"

function TableRow({ className, ref, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-gray-200/50 transition-colors hover:bg-gray-50 data-[state=selected]:bg-muted table-row dark:border-gray-700 dark:hover:bg-gray-800",
        className
      )}
      {...props}
    />
  )
}
TableRow.displayName = "TableRow"

function TableHead({ className, sortable, sortDirection, onSort, children, ref, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}) {
  const renderSortIcon = () => {
    if (!sortable) return null;

    if (sortDirection === "asc") {
      return (
        <svg className="w-4 h-4 ml-1 text-current" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 4l-8 8h16l-8-8z"/>
        </svg>
      );
    } else if (sortDirection === "desc") {
      return (
        <svg className="w-4 h-4 ml-1 text-current" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 20l8-8H4l8 8z"/>
        </svg>
      );
    } else {
      return (
        <svg className="w-4 h-4 ml-1 text-current opacity-40" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 4l-8 8h16l-8-8z"/>
          <path d="M12 20l8-8H4l8 8z"/>
        </svg>
      );
    }
  };

  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-semibold text-gray-900 bg-gray-50 border-b border-gray-200 dark:text-white dark:bg-gray-800 dark:border-gray-700 [&:has([role=checkbox])]:pr-0 text-sm tracking-wide",
        sortable && "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none",
        className
      )}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      {sortable ? (
        <div className="flex items-center gap-1 w-full">
          {children}
          {renderSortIcon()}
        </div>
      ) : (
        children
      )}
    </th>
  );
}
TableHead.displayName = "TableHead"

function TableCell({ className, ref, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      ref={ref}
      className={cn("p-4 align-middle border-b border-gray-200/50 dark:border-gray-700 [&:has([role=checkbox])]:pr-0 dark:text-white", className)}
      {...props}
    />
  )
}
TableCell.displayName = "TableCell"

function TableCaption({ className, ref, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      ref={ref}
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
