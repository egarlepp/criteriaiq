import * as React from "react";
import { Siren, RotateCcw, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (reason?: string) => void;
  onCancel?: () => void;
  variant?: "destructive" | "warning" | "default";
  collectReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "warning",
  collectReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "Briefly explain why (optional)",
  reasonRequired = false,
}: ConfirmationDialogProps) {
  const [reason, setReason] = React.useState("");

  // Reset the reason whenever the dialog re-opens so it never carries over
  // between actions.
  React.useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (collectReason) {
      const trimmed = reason.trim();
      if (reasonRequired && trimmed.length === 0) {
        return;
      }
      onConfirm(trimmed.length > 0 ? trimmed : undefined);
    } else {
      onConfirm();
    }
    onOpenChange(false);
  };

  const getActionButtonClasses = () => {
    switch (variant) {
      case "destructive":
        return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
      case "warning":
        return "bg-amber-600 text-white hover:bg-amber-700";
      default:
        return "bg-primary text-primary-foreground hover:bg-primary/90";
    }
  };

  const confirmDisabled =
    collectReason && reasonRequired && reason.trim().length === 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-red-500 shrink-0" />
            <span>{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="dark:text-slate-400">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {collectReason && (
          <div className="space-y-2">
            <Label
              htmlFor="confirmation-dialog-reason"
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {reasonLabel}
              {reasonRequired ? (
                <span className="ml-1 text-red-600 dark:text-red-400">*</span>
              ) : (
                <span className="ml-1 text-gray-500 dark:text-gray-400">
                  (optional)
                </span>
              )}
            </Label>
            <Textarea
              id="confirmation-dialog-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              data-testid="confirmation-dialog-reason"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={handleCancel}
            className="dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4 mr-1" />
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={getActionButtonClasses()}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
