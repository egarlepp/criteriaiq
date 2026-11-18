import type { StepColorClasses } from "./create-user-types";
import { STEPS } from "./create-user-types";

/**
 * "Internal user" check: true when the email's domain belongs to an internal
 * (login-only) account. `internalDomains` is the set of email domains linked,
 * via the Domain Allow List, to a customer flagged `is_internal`. Admins mark
 * their own organization's account as internal and link its email domain(s);
 * nothing is hard-coded to a particular vendor.
 */
export function isInternalEmail(email: string, internalDomains: Set<string>): boolean {
  const domain = email?.toLowerCase().trim().split("@")[1];
  return !!domain && internalDomains.has(domain);
}

export function getUserAccountDisplayName(user: { email?: string; company?: string }, accountName?: string): string {
  if (accountName) return accountName;
  if (user.company) return user.company;
  return '';
}

export const MULTI_ACCOUNT_ROLES = ['Partner'];
export const SINGLE_ACCOUNT_ROLES = ['Customer', 'Guest'];

export const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com',
  'aol.com', 'protonmail.com', 'mailinator.com', '10minutemail.com',
  'guerrillamail.com', 'temp-mail.org', 'yopmail.com'
];

// Customer and Guest belong to one account, Partner to several. Every other
// role (Admin and custom roles included) is internal staff with access to
// all accounts, matching isExternalRole on the server. No role yet → single,
// so the Account field still asks for a choice.
export function getAccountSelectionMode(role: string): 'all' | 'multi' | 'single' {
  if (!role || SINGLE_ACCOUNT_ROLES.includes(role)) return 'single';
  if (MULTI_ACCOUNT_ROLES.includes(role)) return 'multi';
  return 'all';
}

export function getStepColors(stepId: number, isActive: boolean, isCompleted: boolean): StepColorClasses {
  const step = STEPS.find(s => s.id === stepId);
  const defaultColors: StepColorClasses = {
    bg: 'bg-gray-50 dark:bg-slate-800/50',
    border: 'border-gray-200 dark:border-slate-700',
    icon: 'text-gray-400',
    text: 'text-gray-700 dark:text-gray-300',
    header: 'bg-gray-100/50 dark:bg-slate-700/30',
  };

  if (!step) return defaultColors;

  const colorMap: Record<string, StepColorClasses> = {
    blue: {
      bg: isActive ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-gray-50 dark:bg-slate-800/50',
      border: isActive ? 'border-blue-200 dark:border-blue-800' : 'border-gray-200 dark:border-slate-700',
      icon: isCompleted ? 'text-green-600' : isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400',
      text: isActive ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300',
      header: 'bg-blue-100/50 dark:bg-blue-900/30',
    },
    purple: {
      bg: isActive ? 'bg-purple-50 dark:bg-purple-950/30' : 'bg-gray-50 dark:bg-slate-800/50',
      border: isActive ? 'border-purple-200 dark:border-purple-800' : 'border-gray-200 dark:border-slate-700',
      icon: isCompleted ? 'text-green-600' : isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400',
      text: isActive ? 'text-purple-900 dark:text-purple-100' : 'text-gray-700 dark:text-gray-300',
      header: 'bg-purple-100/50 dark:bg-purple-900/30',
    },
    green: {
      bg: isActive ? 'bg-green-50 dark:bg-green-950/30' : 'bg-gray-50 dark:bg-slate-800/50',
      border: isActive ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-slate-700',
      icon: isCompleted ? 'text-green-600' : isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400',
      text: isActive ? 'text-green-900 dark:text-green-100' : 'text-gray-700 dark:text-gray-300',
      header: 'bg-green-100/50 dark:bg-green-900/30',
    },
    amber: {
      bg: isActive ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-gray-50 dark:bg-slate-800/50',
      border: isActive ? 'border-amber-200 dark:border-amber-800' : 'border-gray-200 dark:border-slate-700',
      icon: isCompleted ? 'text-green-600' : isActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400',
      text: isActive ? 'text-amber-900 dark:text-amber-100' : 'text-gray-700 dark:text-gray-300',
      header: 'bg-amber-100/50 dark:bg-amber-900/30',
    },
  };

  return colorMap[step.color] || defaultColors;
}
