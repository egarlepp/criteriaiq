import { User, Building, Briefcase, Shield } from "lucide-react";
import { DEFAULT_ALLOWED_LOGIN_METHOD, type AllowedLoginMethod } from "@shared/schema";

export interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'create' | 'edit';
  userData?: any;
  onUserCreated?: (userData?: { id: string; firstName: string; lastName: string; email: string }) => void;
}

export interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  accountId: number | null;
  selectedAccountIds: number[];
  allAccountsAccess: boolean;
  password: string;
  title: string;
  stakeholderTypes: string[];
  department: string;
  managerId: string | null;
  region: string;
  specialties: string[];
  role: string;
  allowedLoginMethods: AllowedLoginMethod;
  timezone: string;
  isActive: boolean;
  receiveEmails: boolean;
  skipWelcomeEmail: boolean;
  sectionPermissions: Record<string, string>;
}

export type StepColorClasses = {
  bg: string;
  border: string;
  icon: string;
  text: string;
  header: string;
};

export const STEPS = [
  { id: 1, name: 'Identity', icon: User, color: 'blue' },
  { id: 2, name: 'Organization', icon: Building, color: 'purple' },
  { id: 3, name: 'Specializations', icon: Briefcase, color: 'green' },
  { id: 4, name: 'Permissions', icon: Shield, color: 'amber' },
] as const;

export const INITIAL_FORM_DATA: FormData = {
  firstName: "",
  lastName: "",
  email: "",
  accountId: null,
  selectedAccountIds: [],
  allAccountsAccess: false,
  password: "",
  title: "",
  stakeholderTypes: ["None"],
  department: "",
  managerId: null,
  region: "",
  specialties: ["None"],
  role: "",
  allowedLoginMethods: DEFAULT_ALLOWED_LOGIN_METHOD,
  timezone: "America/New_York",
  isActive: true,
  receiveEmails: true,
  skipWelcomeEmail: false,
  sectionPermissions: {}
};
