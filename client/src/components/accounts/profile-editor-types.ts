import { z } from "zod";
import {
  adminErrorFallback,
  validateAdminPasswordField,
} from "@shared/admin-validation";

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  accountId?: number | null;
  title?: string;
  region?: string;
  department?: string;
  role?: string;
  timezone?: string;
  preferredLocale?: string;
  theme?: "light" | "dark";
  sidebarCollapsed?: boolean;
  showFlightDeck?: boolean;
  loginCount?: number;
  lastLogin?: string | null;
  profileImageUrl?: string;
  allowedLoginMethods?: string;
}

export interface UserStats {
  projectCount?: number;
  loginCount?: number;
  lastLogin?: string | null;
  recentLogins?: Array<{
    timestamp: string;
    ipAddress?: string;
    success: boolean;
  }>;
}

export interface UserSession {
  id: string;
  sessionId: string;
  deviceName?: string;
  browser?: string;
  os?: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface AlignedCustomer {
  name: string;
  region?: string;
  industry?: string;
}

export const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  accountId: z.number().nullable().optional(),
  title: z.string().optional(),
  region: z.string().optional(),
  department: z.string().optional(),
  timezone: z.string().optional(),
  preferredLocale: z.string(),
  theme: z.enum(["light", "dark"]),
  sidebarCollapsed: z.boolean(),
  showFlightDeck: z.boolean(),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().superRefine((value, ctx) => {
    const code = validateAdminPasswordField(value);
    if (code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: adminErrorFallback(code),
      });
    }
  }),
  confirmPassword: z.string(),
})
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ProfileFormData = z.infer<typeof profileSchema>;
export type PasswordFormData = z.infer<typeof passwordSchema>;

export const PROFILE_EDITOR_TABS = ["profile", "security", "activity", "notifications", "mfa-security", "calendar", "integrations"] as const;
export type ProfileEditorTab = (typeof PROFILE_EDITOR_TABS)[number];

export function isProfileEditorTab(value: unknown): value is ProfileEditorTab {
  return typeof value === "string" && (PROFILE_EDITOR_TABS as readonly string[]).includes(value);
}

export interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tab shown each time the editor opens. Defaults to "profile". */
  initialTab?: ProfileEditorTab;
}
