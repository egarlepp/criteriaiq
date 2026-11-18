import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SubNavPopoverProps {
  items: SubNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  title?: string;
  className?: string;
}

export function SubNavPopover({ items, activeId, onSelect, title, className }: SubNavPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const activeItem = items.find((item) => item.id === activeId) || items[0];
  const ActiveIcon = activeItem.icon;

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  React.useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex group", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/60"
      >
        <span className="text-gray-400 dark:text-gray-500 text-xs font-medium">View:</span>
        <ActiveIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-blue-600 dark:text-blue-400">{activeItem.label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100">
          {title && (
            <div className="px-3 pt-1.5 pb-1 mb-1 border-b border-gray-100 dark:border-gray-700">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap">{title}</span>
            </div>
          )}
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors duration-100",
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                )}
              >
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                )}
                {!isActive && <span className="h-1.5 w-1.5 shrink-0" />}
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500")} />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
