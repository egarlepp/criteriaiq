import { toast } from "@/hooks/use-toast";
import { toastMessages, ToastMessage } from "./toast-messages";
import { getCategoryConfig } from "./toast-categories";
import i18n from "@/i18n";

interface ShowToastOptions {
  message: ToastMessage;
  variables?: Record<string, string>;
  actionLabel?: string;
  onAction?: () => void;
}

export function showToast({ message, variables, actionLabel, onAction }: ShowToastOptions) {
  const { titleKey, descriptionKey, category, subcategory, variant } = message;
  const categoryConfig = getCategoryConfig(category, subcategory);
  
  const title = i18n.t(titleKey, variables ?? {});
  const description = descriptionKey ? i18n.t(descriptionKey, variables ?? {}) : undefined;
  
  const IconComponent = categoryConfig.icon;
  
  toast({
    title,
    description,
    variant: variant || categoryConfig.defaultVariant,
    icon: IconComponent,
    duration: categoryConfig.defaultDuration,
  });
}

export const showSuccessToast = (titleKey: string, descriptionKey?: string) => {
  toast({
    title: i18n.t(titleKey),
    description: descriptionKey ? i18n.t(descriptionKey) : undefined,
    variant: "success",
  });
};

export const showErrorToast = (titleKey: string, descriptionKey?: string) => {
  toast({
    title: i18n.t(titleKey),
    description: descriptionKey ? i18n.t(descriptionKey) : undefined,
    variant: "error",
  });
};

export const showWarningToast = (titleKey: string, descriptionKey?: string) => {
  toast({
    title: i18n.t(titleKey),
    description: descriptionKey ? i18n.t(descriptionKey) : undefined,
    variant: "warning",
  });
};

export const showInfoToast = (titleKey: string, descriptionKey?: string) => {
  toast({
    title: i18n.t(titleKey),
    description: descriptionKey ? i18n.t(descriptionKey) : undefined,
    variant: "info",
  });
};

export { toastMessages };
