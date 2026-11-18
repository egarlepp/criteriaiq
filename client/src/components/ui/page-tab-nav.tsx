import * as React from "react";
import { cn } from "@/lib/utils";

interface PageTabNavProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function PageTabNav({ children, className, style }: PageTabNavProps) {
  return (
    <div
      className={cn(
        "page-tab-nav bg-gray-100 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700 flex justify-center sticky top-0 z-30 backdrop-blur-sm",
        className
      )}
      style={{
        marginLeft: '-80px',
        marginRight: '-80px',
        paddingLeft: '80px',
        paddingRight: '80px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
