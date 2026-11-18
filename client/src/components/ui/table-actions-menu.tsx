import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface TableAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  variant?: "default" | "destructive" | "warning" | "success" | "purple";
  disabled?: boolean;
  hidden?: boolean;
  separator?: boolean;
  /** Draws the icon bold and in the primary blue, e.g. when the row has data behind the action. */
  emphasized?: boolean;
  /** Hover text for the icon button; defaults to `label`. */
  tooltip?: React.ReactNode;
  /** Hover delay in ms for this action only; defaults to the surrounding TooltipProvider's. */
  tooltipDelay?: number;
}

const EMPHASIZED_ICON_CLASS = "text-blue-600 dark:text-blue-400";
const EMPHASIZED_STROKE = 2.75;

function ActionIcon({ action, className }: { action: TableAction; className: string }) {
  const Icon = action.icon;
  return action.emphasized ? (
    <Icon className={cn(className, EMPHASIZED_ICON_CLASS)} strokeWidth={EMPHASIZED_STROKE} />
  ) : (
    <Icon className={className} />
  );
}

interface TableActionsMenuProps {
  actions: TableAction[];
  maxVisibleActions?: number;
  forceCollapsed?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
}

const variantStyles: Record<string, { button: string; menuItem: string }> = {
  default: {
    button: "text-gray-600 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800",
    menuItem: "text-gray-700 dark:text-gray-300",
  },
  destructive: {
    button: "text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:hover:text-red-400 dark:hover:bg-red-950",
    menuItem: "text-red-600 dark:text-red-500 focus:text-red-600 dark:focus:text-red-500",
  },
  warning: {
    button: "text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-500 dark:hover:text-orange-400 dark:hover:bg-orange-950",
    menuItem: "text-orange-600 dark:text-orange-500 focus:text-orange-600 dark:focus:text-orange-500",
  },
  success: {
    button: "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-500 dark:hover:text-green-400 dark:hover:bg-green-950",
    menuItem: "text-green-600 dark:text-green-500 focus:text-green-600 dark:focus:text-green-500",
  },
  purple: {
    button: "text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-950",
    menuItem: "text-purple-600 dark:text-purple-400 focus:text-purple-600 dark:focus:text-purple-400",
  },
};

export function TableActionsMenu({
  actions,
  maxVisibleActions = 3,
  forceCollapsed = false,
  className,
  triggerClassName,
  align = "end",
}: TableActionsMenuProps) {
  const { t } = useTranslation();
  const visibleActions = actions.filter((action) => !action.hidden);
  const shouldCollapse = forceCollapsed || visibleActions.length > maxVisibleActions;

  if (visibleActions.length === 0) {
    return null;
  }

  if (shouldCollapse) {
    return (
      <div className={cn("flex justify-end", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800",
                triggerClassName
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">{t("common.openActionsMenu")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align} className="w-48 bg-white dark:bg-gray-900">
            {visibleActions.flatMap((action, index) => {
              const styles = variantStyles[action.variant || "default"];
              const elements = [];
              
              if (action.separator && index > 0) {
                elements.push(<DropdownMenuSeparator key={`sep-${action.id}`} />);
              }
              
              elements.push(
                <DropdownMenuItem
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    "cursor-pointer flex items-center gap-2",
                    styles.menuItem
                  )}
                >
                  <ActionIcon action={action} className="h-4 w-4" />
                  <span>{action.label}</span>
                </DropdownMenuItem>
              );
              
              return elements;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={cn("flex justify-end gap-0.5", className)}>
      {visibleActions.map((action) => {
        const styles = variantStyles[action.variant || "default"];
        
        return (
          <Tooltip key={action.id} delayDuration={action.tooltipDelay}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.label}
                className={cn("h-8 w-8 p-0", styles.button)}
              >
                <ActionIcon action={action} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent 
              side="top" 
              className="!bg-white !text-black !text-xs !px-2 !py-1 !border !border-gray-200 !shadow-md !font-normal dark:!bg-gray-900 dark:!text-white dark:!border-gray-700"
            >
              {action.tooltip ?? action.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ResponsiveTableActionsMenu({
  actions,
  maxVisibleActions = 3,
  className,
  triggerClassName,
  align = "end",
}: TableActionsMenuProps) {
  const { t } = useTranslation();
  const visibleActions = actions.filter((action) => !action.hidden);
  const shouldCollapseByCount = visibleActions.length > maxVisibleActions;

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex justify-end", className)}>
      <div className={cn(
        shouldCollapseByCount ? "hidden" : "hidden md:flex",
        "gap-0.5"
      )}>
        {visibleActions.map((action) => {
          const styles = variantStyles[action.variant || "default"];
          
          return (
            <Tooltip key={action.id} delayDuration={action.tooltipDelay}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  className={cn("h-8 w-8 p-0", styles.button)}
                >
                  <ActionIcon action={action} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent 
                side="top" 
                className="!bg-white !text-black !text-xs !px-2 !py-1 !border !border-gray-200 !shadow-md !font-normal dark:!bg-gray-900 dark:!text-white dark:!border-gray-700"
              >
                {action.tooltip ?? action.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className={cn(
        shouldCollapseByCount ? "flex" : "flex md:hidden"
      )}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800",
                triggerClassName
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">{t("common.openActionsMenu")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align} className="w-48 bg-white dark:bg-gray-900">
            {visibleActions.flatMap((action, index) => {
              const styles = variantStyles[action.variant || "default"];
              const elements = [];
              
              if (action.separator && index > 0) {
                elements.push(<DropdownMenuSeparator key={`sep-${action.id}`} />);
              }
              
              elements.push(
                <DropdownMenuItem
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    "cursor-pointer flex items-center gap-2",
                    styles.menuItem
                  )}
                >
                  <ActionIcon action={action} className="h-4 w-4" />
                  <span>{action.label}</span>
                </DropdownMenuItem>
              );
              
              return elements;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
