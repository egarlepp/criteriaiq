import { LucideIcon, Database, AlertCircle, CheckCircle, Info, Settings, Users, FileText, Mail, Shield } from "lucide-react";

export type ToastCategory = "system" | "data" | "validation" | "userActions";

export type ToastVariant = "default" | "destructive" | "success" | "error" | "warning" | "info" | "confirm" | "loading";

export interface ToastCategoryConfig {
  name: string;
  icon: LucideIcon;
  defaultVariant: ToastVariant;
  defaultDuration: number;
  color: string;
  subcategories?: {
    [key: string]: {
      icon?: LucideIcon;
      variant?: ToastVariant;
    };
  };
}

export const toastCategories: Record<ToastCategory, ToastCategoryConfig> = {
  system: {
    name: "System",
    icon: Settings,
    defaultVariant: "info",
    defaultDuration: 4000,
    color: "blue",
    subcategories: {
      auth: { icon: Shield, variant: "info" },
      settings: { icon: Settings, variant: "success" },
      notification: { icon: Info, variant: "info" },
    },
  },
  data: {
    name: "Data",
    icon: Database,
    defaultVariant: "success",
    defaultDuration: 3000,
    color: "green",
    subcategories: {
      create: { icon: CheckCircle, variant: "success" },
      update: { icon: CheckCircle, variant: "success" },
      delete: { icon: AlertCircle, variant: "warning" },
      export: { icon: FileText, variant: "success" },
      import: { icon: FileText, variant: "loading" },
    },
  },
  validation: {
    name: "Validation",
    icon: AlertCircle,
    defaultVariant: "warning",
    defaultDuration: 5000,
    color: "amber",
    subcategories: {
      required: { icon: AlertCircle, variant: "warning" },
      format: { icon: AlertCircle, variant: "error" },
      duplicate: { icon: AlertCircle, variant: "warning" },
    },
  },
  userActions: {
    name: "User Actions",
    icon: Users,
    defaultVariant: "success",
    defaultDuration: 3000,
    color: "purple",
    subcategories: {
      profile: { icon: Users, variant: "success" },
      invite: { icon: Mail, variant: "success" },
      permission: { icon: Shield, variant: "info" },
    },
  },
};

export function getCategoryConfig(category: ToastCategory, subcategory?: string): ToastCategoryConfig & { icon?: LucideIcon; variant?: ToastVariant } {
  const config = toastCategories[category];
  
  if (subcategory && config.subcategories?.[subcategory]) {
    return {
      ...config,
      ...config.subcategories[subcategory],
    };
  }
  
  return config;
}
