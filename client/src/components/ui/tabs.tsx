import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

function TabsList({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-gray-100 p-1 text-muted-foreground dark:bg-gray-800",
        className
      )}
      {...props}
    />
  )
}
TabsList.displayName = TabsPrimitive.List.displayName

function TabsTrigger({ className, onClick, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const handleTabClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(event);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex grow items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        "disabled:pointer-events-none disabled:opacity-50",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "text-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200",
        "data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-1px_1px_#ffffff80,0_-1px_1px_#00000020,0_-2px_2px_#00000010] data-[state=active]:cursor-default data-[state=active]:border-b-2 data-[state=active]:border-primary",
        className
      )}
      onClick={handleTabClick}
      {...props}
    />
  )
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

function TabsContent({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  )
}
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
