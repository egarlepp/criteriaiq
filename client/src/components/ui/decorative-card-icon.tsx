import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DecorativeCardIconProps {
  icon: LucideIcon;
  className?: string;
}

export function DecorativeCardIcon({ icon: Icon, className }: DecorativeCardIconProps) {
  return (
    <Icon
      className={cn(
        "absolute left-0 top-2 w-[90%] h-[90%] text-gray-100 dark:text-gray-800 pointer-events-none opacity-30",
        className
      )}
      style={{ transform: "translateX(-30%) rotate(-12deg)", zIndex: 0 }}
    />
  );
}
