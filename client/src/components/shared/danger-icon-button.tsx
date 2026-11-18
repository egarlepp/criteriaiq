import * as React from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = React.ComponentProps<typeof Button> & {
  iconClassName?: string;
};

export function DangerIconButton({ className, iconClassName, children, ref, ...props }: Props) {
  const defaultIcon = (
    <Trash2
      className={`h-4 w-4 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 allow-colored-icon ${iconClassName ?? ""}`}
    />
  );

  const icon =
    React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<any>, {
          className: `${(children.props as any)?.className ?? ""} allow-colored-icon text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300`,
        })
      : defaultIcon;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      {...props}
      className={`group h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-900/20 ${className ?? ""}`}
    >
      {icon}
    </Button>
  );
}

DangerIconButton.displayName = "DangerIconButton";
