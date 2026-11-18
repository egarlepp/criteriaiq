import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { capitalizeWords } from "@/lib/nameUtils";
import { TIMEZONE_OPTIONS, getTimezoneLabel } from "@/lib/timezones";
import { Eye, EyeOff, UserPlus, ShieldCheck, User, Building, Briefcase, Shield, ChevronDown, ChevronRight, Check, MapPin, Compass, Globe, Package, X, CircleArrowRight, CircleArrowLeft, ChevronsUpDown, Save, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useTranslation } from 'react-i18next';
import { PermissionTreeEditor } from "@/components/configuration/PermissionTreeEditor";
import { payloadToValues, valuesToPayload, type StoredPermission } from "@shared/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { TEAMS_SECTION, USERS_SECTION } from "@shared/teams";
import { OUTSIDE_ROLES, invalidateTeams, useTeams } from "@/components/teams/teams-api";
import {
  EMPTY_USER_TEAMS,
  UserTeamsPicker,
  sameUserTeams,
  userTeamsDraft,
  type UserTeamsDraft,
} from "@/components/teams/user-teams";

import type { CreateUserDialogProps } from "./create-user-types";
import { STEPS, INITIAL_FORM_DATA } from "./create-user-types";
import { ALLOWED_LOGIN_METHODS, DEFAULT_ALLOWED_LOGIN_METHOD, isAllowedLoginMethod, type AllowedLoginMethod } from "@shared/schema";
import { PasswordRuleChecklist } from "@/components/shared/PasswordRuleChecklist";
import { WorkScheduleEditor } from "./work-schedule-editor";
import {
  validateAdminPasswordField,
  ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
} from "@shared/admin-validation";
import {
  getAccountSelectionMode,
  getStepColors,
  BLOCKED_EMAIL_DOMAINS,
  isInternalEmail,
} from "./create-user-utils";

export default function CreateUserDialog({ isOpen, onClose, mode = 'create', userData, onUserCreated }: CreateUserDialogProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Protected accounts (users.isProtected) keep a locked role and permissions
  const isProtectedUser = mode === 'edit' && userData?.isProtected === true;

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    accountId: null as number | null, // For Customer/Guest single account
    selectedAccountIds: [] as number[], // For Partner multi-account
    allAccountsAccess: false, // For internal roles (CX, Engineer, Support, Services, Sales, Product)
    password: "",
    title: "",
    stakeholderTypes: ["None"] as string[],
    department: "",
    managerId: null as string | null,
    region: "",
    specialties: ["None"] as string[],
    role: "",
    allowedLoginMethods: DEFAULT_ALLOWED_LOGIN_METHOD as AllowedLoginMethod,
    timezone: "America/New_York",
    isActive: true,
    receiveEmails: true, // Default to true
    skipWelcomeEmail: false,
    sectionPermissions: {} as Record<string, string>
  });
  
  // Internal (login-only) account detection.
  // A user is "internal" when their email domain is linked (via the Domain
  // Allow List) to a customer flagged is_internal. The allow list is
  // admin-only; the internal accounts also feed the staff Account picker.
  const isAdminUser = (currentUser as any)?.role === 'Admin';
  const { data: internalAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", { scope: "internal" }],
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });
  const activeInternalAccounts = useMemo(
    () => (internalAccounts as any[]).filter((a) => a.isActive !== false),
    [internalAccounts],
  );
  const internalAccountIds = useMemo(
    () => new Set<number>((internalAccounts as any[]).map((a) => a.id)),
    [internalAccounts],
  );
  const { data: allowedDomainsData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/allowed-domains"],
    enabled: isOpen && isAdminUser,
    staleTime: 5 * 60 * 1000,
  });
  const internalDomains = useMemo(() => {
    const internalIds = new Set((internalAccounts as any[]).map((a) => a.id));
    const set = new Set<string>();
    for (const d of (allowedDomainsData as any[])) {
      if (d?.domain && d.accountId != null && internalIds.has(d.accountId)) {
        set.add(String(d.domain).toLowerCase());
      }
    }
    return set;
  }, [internalAccounts, allowedDomainsData]);
  const isInternalUser = isInternalEmail(formData.email, internalDomains);
  // Name of the internal account the email domain belongs to; the server
  // links the user to that account on create/update.
  const internalAccountName = useMemo(() => {
    const domain = formData.email?.toLowerCase().trim().split("@")[1];
    if (!domain || !internalDomains.has(domain)) return undefined;
    const link = (allowedDomainsData as any[]).find((d) => String(d?.domain).toLowerCase() === domain);
    return (internalAccounts as any[]).find((a) => a.id === link?.accountId)?.accountName as string | undefined;
  }, [formData.email, internalDomains, allowedDomainsData, internalAccounts]);
  const accountSelectionMode = isInternalUser ? 'all' as const : getAccountSelectionMode(formData.role);
  
  // State for account dropdown
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  
  // State for password visibility and confirmation
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

  // Inline error for the per-user password history check (Task #292).
  // Lives on the dialog instead of the toast so an admin can see why the
  // last submit was rejected while they edit the field. Cleared whenever
  // the password value changes so a stale reuse warning never lingers
  // after a fresh attempt.
  const [passwordReuseError, setPasswordReuseError] = useState<{
    message: string;
    historySize: number;
  } | null>(null);

  // Size of the per-user password history the server enforces. Drives the
  // up-front "cannot reuse last N" helper text under the password field so
  // admins know the rule before they submit. Defaults to the shared
  // constant and is upgraded to the authoritative server value the first
  // time the reuse-error channel surfaces a `historySize`, keeping the
  // helper text and the inline error in lockstep.
  const [historySize, setHistorySize] = useState<number>(
    ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  );

  // Step wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({
    1: true, // Identity open by default
    2: false,
    3: false,
    4: false
  });

  // Reset step when dialog opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      // Reset password visibility and confirmation
      setShowPassword(false);
      setShowConfirmPassword(false);
      setConfirmPassword("");
      setPasswordReuseError(null);
      // In edit mode, all sections are accessible
      if (mode === 'edit') {
        setOpenSections({ 1: true, 2: false, 3: false, 4: false });
      } else {
        setOpenSections({ 1: true, 2: false, 3: false, 4: false });
      }
    }
  }, [isOpen, mode]);

  // Toggle section open/closed
  const toggleSection = (stepId: number) => {
    // In edit mode, allow toggling any section
    // In create mode, only allow toggling completed steps or current step
    if (mode === 'edit' || stepId <= currentStep) {
      // Prevent collapsing a section if it has required fields that are incomplete
      if (openSections[stepId] && !isStepCompleted(stepId) && stepId === currentStep) {
        // Don't allow collapsing the current step if it's incomplete
        return;
      }
      setOpenSections(prev => ({ ...prev, [stepId]: !prev[stepId] }));
    }
  };

  // Check if a step is completed (has required fields filled)
  const isStepCompleted = (stepId: number): boolean => {
    const hasBasicIdentity = !!(formData.firstName.trim() && formData.lastName.trim() && 
      formData.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email));
    
    switch (stepId) {
      case 1: // Identity - password and role required for all users in create mode
        if (mode === 'create') {
          // Password and role are required for all new user accounts
          return hasBasicIdentity && !!(formData.password.trim() && validatePassword(formData.password).isValid) && !!formData.role;
        }
        // In edit mode, password is optional but role is still required
        return hasBasicIdentity && !!formData.role;
      case 2: // Organization - all fields are required (account requirement varies by role)
        const mode2 = isInternalUser ? 'all' : getAccountSelectionMode(formData.role);
        const hasValidAccount = mode2 === 'all' ? true :
          mode2 === 'multi' ? formData.selectedAccountIds.length > 0 :
          !!formData.accountId;
        return !!(hasValidAccount && formData.title.trim() && formData.department && formData.region && formData.timezone);
      case 3: // Specializations - solutions and stakeholder types must have selections
        const hasSolutions = formData.specialties.length > 0;
        const hasStakeholderTypes = formData.stakeholderTypes.length > 0;
        return hasSolutions && hasStakeholderTypes;
      case 4: // Permissions - mark complete if user has reached this step or has configured any permissions
        const hasConfiguredPerms = Object.values(formData.sectionPermissions).some(p => p && p !== 'none');
        return hasConfiguredPerms || currentStep >= 4;
      default:
        return false;
    }
  };

  // Navigate to next step (only if current step is complete)
  const goToNextStep = () => {
    if (currentStep < 4 && isStepCompleted(currentStep)) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setOpenSections(prev => ({ ...prev, [currentStep]: false, [nextStep]: true }));
    }
  };

  // Navigate to previous step
  const goToPrevStep = () => {
    if (currentStep > 1) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      setOpenSections(prev => ({ ...prev, [currentStep]: false, [prevStep]: true }));
    }
  };

  // Get step summary text for collapsed sections
  const getStepSummary = (stepId: number): string => {
    switch (stepId) {
      case 1:
        if (formData.firstName || formData.lastName) {
          const rolePart = formData.role ? ` (${formData.role})` : '';
          return `${formData.firstName} ${formData.lastName}${formData.email ? ` - ${formData.email}` : ''}${rolePart}`;
        }
        return 'Enter personal details and role';
      case 2:
        const mode2Summary = isInternalUser ? 'all' : getAccountSelectionMode(formData.role);
        let accountDisplay = '';
        if (isInternalUser) {
          accountDisplay = internalAccountName ?? t('common.internal');
        } else if (mode2Summary === 'all') {
          accountDisplay = (internalAccounts as any[]).find((a) => a.id === formData.accountId)?.accountName ?? t('users.allAccounts');
        } else if (mode2Summary === 'multi') {
          accountDisplay = formData.selectedAccountIds.length > 0 
            ? `${formData.selectedAccountIds.length} account${formData.selectedAccountIds.length > 1 ? 's' : ''}` 
            : '';
        } else {
          const selectedAccount = customers.find((c: any) => c.id === formData.accountId);
          accountDisplay = selectedAccount?.accountName || '';
        }
        const parts = [accountDisplay, formData.title, formData.department, formData.region].filter(Boolean);
        return parts.length > 0 ? parts.join(' • ') : 'Enter organization details';
      case 3:
        const solutionsText = formData.specialties.length > 0 && !formData.specialties.includes("None") 
          ? `${formData.specialties.length} solutions` 
          : formData.specialties.includes("None") ? 'No solutions' : '';
        const stakeholderText = formData.stakeholderTypes.length > 0 && !formData.stakeholderTypes.includes("None")
          ? `${formData.stakeholderTypes.length} stakeholder types`
          : formData.stakeholderTypes.includes("None") ? 'No stakeholder types' : '';
        return [solutionsText, stakeholderText].filter(Boolean).join(' • ') || 'Select specializations';
      case 4:
        const permCount = Object.values(formData.sectionPermissions).filter(p => p && p !== 'none').length;
        return permCount > 0 ? `${permCount} permissions configured` : 'Configure access permissions';
      default:
        return '';
    }
  };

  // Get region icon based on region value
  const getRegionIcon = (region: string) => {
    switch (region) {
      case 'Middle East & Africa':
        return <Compass className="h-4 w-4 mr-2 text-amber-600" />;
      case 'Global':
        return <Globe className="h-4 w-4 mr-2 text-blue-600" />;
      default:
        return <MapPin className="h-4 w-4 mr-2 text-emerald-600" />;
    }
  };

  // A user imported from a CRM contact takes name and title from the contact;
  // the server keeps them on save (shared/crm-contact-fields.ts).
  const crmSourced = mode === 'edit' && !!userData?.crmContactId && !!userData?.crmProvider;
  const crmLockTitle = crmSourced
    ? t('users.source.lockedField', { crm: userData?.crmProvider === 'hubspot' ? 'HubSpot' : 'Salesforce' })
    : undefined;
  const lockedInputClass = crmSourced ? 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : undefined;

  // Initialize form with user data in edit mode
  useEffect(() => {
    if (mode === 'edit' && userData) {
      setFormData({
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        email: userData.email || "",
        accountId: userData.accountId || null,
        selectedAccountIds: userData.selectedAccountIds || [], // For Partner multi-account
        allAccountsAccess: userData.allAccountsAccess || false, // For internal roles
        password: "", // Never pre-fill password
        title: userData.title || "",
        stakeholderTypes: userData.stakeholderTypes || [],
        department: userData.department || "",
        managerId: userData.managerId || null,
        region: userData.region || "",
        specialties: userData.specialties || [],
        role: userData.role || "",
        allowedLoginMethods: isAllowedLoginMethod(userData.allowedLoginMethods)
          ? userData.allowedLoginMethods
          : DEFAULT_ALLOWED_LOGIN_METHOD,
        timezone: userData.timezone || "America/New_York",
        isActive: userData.isActive !== false,
        receiveEmails: userData.receiveEmails !== false,
        skipWelcomeEmail: userData.skipWelcomeEmail || false,
        sectionPermissions: userData.sectionPermissions || {} // Preserve existing permissions
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      resetForm();
    }
  }, [mode, userData, isOpen]);

  // Fetch solutions for specialties multiselect
  const { data: solutions = [] } = useQuery({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  // Fetch roles to get role IDs for permission fetching
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch customers (accounts) for the account dropdown
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch users for the Manager dropdown
  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });


  // Internal users have no solution interests or stakeholder types. Force both
  // to "None" and lock the Specializations inputs. Generalized to any internal
  // account. Guarded so it doesn't loop once set.
  useEffect(() => {
    if (!isInternalUser) return;
    setFormData(prev => {
      const specIsNone = prev.specialties.length === 1 && prev.specialties[0] === "None";
      const stakeIsNone = prev.stakeholderTypes.length === 1 && prev.stakeholderTypes[0] === "None";
      if (specIsNone && stakeIsNone) return prev;
      return { ...prev, specialties: ["None"], stakeholderTypes: ["None"] };
    });
  }, [isInternalUser]);

  // Get the selected role for permission fetching
  const selectedRole = roles.find((r: any) => r.name === formData.role);

  // Filter roles based on current user's permissions
  const availableRoles = roles.filter((role: any) => {
    if ((currentUser as any)?.role === 'Admin') {
      // Admin sees all roles
      return true;
    } else if ((currentUser as any)?.role === 'Engineer') {
      // Engineer sees all roles EXCEPT Admin
      return role.name !== 'Admin';
    }
    return false;
  });

  // Permissions are locked for protected users OR when user role is Admin
  const isPermissionLocked = isProtectedUser || formData.role === 'Admin';

  // Fetch user-specific permissions using useQuery (concurrent, no dependencies)
  const { data: userPermissions, isLoading: isLoadingUserPerms } = useQuery<StoredPermission[]>({
    queryKey: [`/api/user-permissions/${userData?.id}`],
    enabled: isOpen && mode === 'edit' && !!userData?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch role default permissions using useQuery (uses selectedRole from roles array)
  const { data: rolePermissions, isLoading: isLoadingRolePerms } = useQuery<StoredPermission[]>({
    queryKey: [`/api/roles/${selectedRole?.id}/permissions`],
    enabled: isOpen && !!selectedRole?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // The values the Permissions step starts from: a new user starts from their
  // role's defaults; an existing user keeps their own values unless the role
  // is changed here, which starts them from the new role's defaults. Each page
  // has its own value and a page with no value is None, so the two lists are
  // never merged.
  const roleChanged = mode === 'edit' && !!userData && formData.role !== (userData.role || "");
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && !roleChanged) {
      // Wait for the data: a fresh [] on every render would loop.
      if (isLoadingUserPerms || !userPermissions) return;
      setFormData(prev => ({ ...prev, sectionPermissions: payloadToValues(userPermissions) }));
      return;
    }
    if (!selectedRole || isLoadingRolePerms || !rolePermissions) return;
    setFormData(prev => ({ ...prev, sectionPermissions: payloadToValues(rolePermissions) }));
  }, [isOpen, mode, roleChanged, selectedRole, userPermissions, rolePermissions, isLoadingRolePerms, isLoadingUserPerms]);

  // Only an Admin can set another user's page permissions (the save route
  // refuses anyone else), and never on the Admin role or a protected account.
  const canEditPermissions = isAdminUser && !isPermissionLocked;

  // Teams only organize and filter people (docs/features/teams.md). Anyone
  // who can edit Teams or Users may set a person's teams.
  const { canEdit } = usePermissions();
  const canEditTeams = canEdit(TEAMS_SECTION) || canEdit(USERS_SECTION);
  const { data: allTeams = [] } = useTeams(isOpen && canEditTeams);
  const isOutsideRole = OUTSIDE_ROLES.has(formData.role);
  const [teamDraft, setTeamDraft] = useState<UserTeamsDraft>(EMPTY_USER_TEAMS);
  const [initialTeams, setInitialTeams] = useState<UserTeamsDraft>(EMPTY_USER_TEAMS);
  const [teamsSeeded, setTeamsSeeded] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setTeamsSeeded(false);
      return;
    }
    if (teamsSeeded || !canEditTeams) return;
    const current = mode === "edit" && userData?.id ? userTeamsDraft(allTeams, userData.id) : EMPTY_USER_TEAMS;
    setTeamDraft(current);
    setInitialTeams(current);
    if (allTeams.length > 0 || mode !== "edit") setTeamsSeeded(true);
  }, [isOpen, mode, userData?.id, allTeams, teamsSeeded, canEditTeams]);
  const saveTeams = async (userId: string) => {
    if (!canEditTeams) return;
    // An outside user is only ever cleared off teams.
    const next = isOutsideRole ? EMPTY_USER_TEAMS : teamDraft;
    if (sameUserTeams(next, initialTeams)) return;
    await apiRequest("PUT", `/api/user-teams/${userId}`, next);
    invalidateTeams();
  };
  const savePermissions = (userId: string) =>
    apiRequest("PUT", `/api/user-permissions/${userId}`, { permissions: valuesToPayload(formData.sectionPermissions) });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const created = await apiRequest("POST", "/api/users", data);
      if (canEditPermissions && created?.id) await savePermissions(created.id);
      if (created?.id) await saveTeams(created.id);
      return created;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-permissions"] });
      toast({
        title: t("users.createUserSuccessTitle"),
        description: t("users.createUserSuccessDescription"),
      });
      if (onUserCreated) {
        onUserCreated({
          id: data?.id || '',
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email
        });
      }
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      showErrorToast(t("common.error"), error.message || t("users.createUserErrorDescription"));
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const updated = await apiRequest("PUT", `/api/users/${userId}`, updates);
      if (canEditPermissions) await savePermissions(userId);
      await saveTeams(userId);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-permissions"] });
      setPasswordReuseError(null);
      toast({
        title: t('common.success'),
        description: t('users.updateSuccess'),
        variant: "success",
        icon: CheckCircle2,
      });
      onClose();
    },
    onError: (error: any) => {
      // When the server rejects the new password as recently-used we
      // surface the message inline under the password field instead of
      // the generic toast. The toast disappears too quickly for an admin
      // to act on, and this specific failure has a clear, field-scoped
      // remediation ("pick something they haven't used recently").
      const details = error?.details;
      if (details?.errorCode === PASSWORD_RECENTLY_USED_ERROR_CODE) {
        const serverHistorySize =
          typeof details.historySize === 'number' && details.historySize > 0
            ? details.historySize
            : ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE;
        // Promote the authoritative server value so the up-front helper
        // text and the inline error always quote the same number.
        setHistorySize(serverHistorySize);
        setPasswordReuseError({
          message: t('users.passwordRecentlyUsed', { count: serverHistorySize }),
          historySize: serverHistorySize,
        });
        return;
      }
      toast({
        title: t('common.error'),
        description: error.message || t('users.updateError'),
        variant: "error",
        icon: XCircle,
      });
    },
  });

  const resetForm = () => {
    setFormData({ ...INITIAL_FORM_DATA });
  };

  const toggleSpecialty = (specialty: string) => {
    setFormData(prev => {
      if (specialty === "None") {
        // If selecting None, clear all other specialties and set only None
        if (prev.specialties.includes("None")) {
          return { ...prev, specialties: [] }; // Deselecting None
        }
        return { ...prev, specialties: ["None"] };
      } else {
        // If selecting any other specialty, remove None if present
        const withoutNone = prev.specialties.filter(s => s !== "None");
        if (prev.specialties.includes(specialty)) {
          return { ...prev, specialties: withoutNone.filter(s => s !== specialty) };
        }
        return { ...prev, specialties: [...withoutNone, specialty] };
      }
    });
  };

  const toggleStakeholderType = (type: string) => {
    setFormData(prev => {
      if (type === "None" || type === "All") {
        // If selecting None or All, clear all other types and set only the selected one
        if (prev.stakeholderTypes.includes(type)) {
          return { ...prev, stakeholderTypes: [] }; // Deselecting None/All
        }
        return { ...prev, stakeholderTypes: [type] };
      } else {
        // If selecting any other type, remove None and All if present
        const withoutExclusive = prev.stakeholderTypes.filter(s => s !== "None" && s !== "All");
        if (prev.stakeholderTypes.includes(type)) {
          return { ...prev, stakeholderTypes: withoutExclusive.filter(s => s !== type) };
        }
        return { ...prev, stakeholderTypes: [...withoutExclusive, type] };
      }
    });
  };

  const handleRoleChange = (value: string) => {
    // Update role - permissions will be auto-loaded by useQuery using selectedRole
    const mode = getAccountSelectionMode(value);
    // Staff default to the internal account when there is exactly one.
    const defaultInternalId = activeInternalAccounts.length === 1 ? activeInternalAccounts[0].id : null;
    setFormData(prev => ({
      ...prev,
      role: value,
      // Reset account fields based on new role
      allAccountsAccess: mode === 'all',
      accountId: mode === 'single'
        ? (prev.accountId != null && internalAccountIds.has(prev.accountId) ? null : prev.accountId)
        : mode === 'all'
          ? (prev.accountId != null && internalAccountIds.has(prev.accountId) ? prev.accountId : defaultInternalId)
          : null,
      selectedAccountIds: mode === 'multi' ? prev.selectedAccountIds : []
    }));
  };

  const validatePassword = (password: string): { isValid: boolean; error?: string } => {
    const code = validateAdminPasswordField(password);
    if (!code) return { isValid: true };
    const messageKey =
      code === "adminPasswordTooShort"
        ? "users.passwordErrorLength"
        : "users.passwordErrorComplexity";
    return { isValid: false, error: t(messageKey) };
  };

  const handleSubmit = () => {
    // Block submission for protected users trying to change role or permissions
    if (isProtectedUser && mode === 'edit') {
      showErrorToast(t("common.error"), "Protected administrator accounts cannot be modified. Role and permissions are locked.");
      return;
    }
    
    // Validate required fields
    if (!formData.firstName.trim()) {
      showErrorToast(t("common.error"), t("users.firstNameRequired"));
      return;
    }
    if (!formData.lastName.trim()) {
      showErrorToast(t("common.error"), t("users.lastNameRequired"));
      return;
    }
    if (!formData.email.trim()) {
      showErrorToast(t("common.error"), t("users.emailRequired"));
      return;
    }
    
    // Personal domains are blocked for new addresses only, so an existing
    // user on one can still be edited without changing their email.
    const emailDomain = formData.email.toLowerCase().split('@')[1];
    const emailUnchanged = mode === 'edit' && formData.email.trim().toLowerCase() === (userData?.email ?? '').trim().toLowerCase();
    if (!emailUnchanged && BLOCKED_EMAIL_DOMAINS.includes(emailDomain)) {
      showErrorToast(t("common.error"), "Company Emails Only! Personal and disposable email domains are not allowed.");
      return;
    }
    
    // Validate account based on role selection mode (skip for internal users)
    const submitMode = isInternalUser ? 'all' : getAccountSelectionMode(formData.role);
    if (!isInternalUser) {
      if (submitMode === 'single' && !formData.accountId) {
        showErrorToast(t("common.error"), "Account is required");
        return;
      }
      if (submitMode === 'multi' && formData.selectedAccountIds.length === 0) {
        showErrorToast(t("common.error"), "At least one account must be selected");
        return;
      }
    }
    if (!formData.role) { // Ensure role is selected
      showErrorToast(t("common.error"), t("users.roleRequired"));
      return;
    }

    // Validate password complexity for create mode (required for all users) or if password is provided in edit mode
    if (mode === 'create') {
      if (!formData.password.trim()) {
        showErrorToast(t("common.error"), t("users.passwordRequired"));
        return;
      }

      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.isValid) {
        showErrorToast(t("common.passwordError"), passwordValidation.error);
        return;
      }
      
      // Validate password confirmation match
      if (formData.password !== confirmPassword) {
        showErrorToast(t("common.error"), "Passwords do not match");
        return;
      }
    } else if (mode === 'edit' && formData.password && formData.password.trim()) {
      // Only validate if password is being changed in edit mode
      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.isValid) {
        showErrorToast(t("common.passwordError"), passwordValidation.error);
        return;
      }
      
      // Validate password confirmation match when changing password
      if (formData.password !== confirmPassword) {
        showErrorToast(t("common.error"), "Passwords do not match");
        return;
      }
    }

    const submitData: any = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      // Staff may only be linked to an internal account (the server enforces
      // the same rule); domain-linked staff are linked by the server.
      accountId: isInternalUser ? null
        : submitMode === 'single' ? formData.accountId
        : submitMode === 'all' && formData.accountId != null && internalAccountIds.has(formData.accountId) ? formData.accountId
        : null,
      allAccountsAccess: isInternalUser || submitMode === 'all',
      selectedAccountIds: isInternalUser ? [] : (submitMode === 'multi' ? formData.selectedAccountIds : []),
      title: formData.title,
      region: formData.region,
      role: formData.role,
      stakeholderTypes: formData.stakeholderTypes,
      department: formData.department,
      managerId: formData.managerId,
      solutions: formData.specialties,
      timezone: formData.timezone,
      isActive: formData.isActive,
      receiveEmails: formData.receiveEmails,
      skipWelcomeEmail: formData.skipWelcomeEmail,
    };
    // Sign-in policy is admin-only server-side; non-admins never send it.
    if (isAdminUser) {
      submitData.allowedLoginMethods = formData.allowedLoginMethods;
    }
    
    if (mode === 'edit' && userData?.id) {
      // Only include password if it's being changed in edit mode.
      //
      // The admin edit endpoint (`PUT /api/users/:userId`) keys all of
      // its password handling — strength validation, the per-user
      // history check, and bcrypt hashing — off `newPassword`. Sending
      // the bare `password` field would bypass that entire pipeline and
      // (because storage writes the field as-is) silently land an
      // unhashed value in the user row. Use `newPassword` so the same
      // path that drives the inline "recently used" error fires here.
      if (formData.password && formData.password.trim()) {
        submitData.newPassword = formData.password;
      }
      updateUserMutation.mutate({ userId: userData.id, updates: submitData });
    } else {
      // Include password for create mode — `POST /api/users` reads it
      // from the `password` field, not `newPassword`.
      submitData.password = formData.password;
      createUserMutation.mutate(submitData);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[650px] w-full max-h-[90vh] overflow-y-auto" aria-describedby="create-user-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {mode === 'edit' ? 'Edit User' : 'Create New User'}
          </DialogTitle>
          <div id="create-user-description" className="sr-only">
            {mode === 'edit' ? 'Edit user account details and permissions' : 'Create a new user account with role and permissions'}
          </div>
        </DialogHeader>
        
        {/* Protected User Alert */}
        {isProtectedUser && (
          <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              This is a protected administrator account. Role and permissions cannot be modified to ensure the application always has at least one administrator.
            </AlertDescription>
          </Alert>
        )}

        {/* Step Progress Indicator */}
        <div className="flex items-center justify-between mb-4 px-2">
          {STEPS.map((step, index) => {
            const isActive = currentStep === step.id;
            const isCompleted = mode === 'edit' ? isStepCompleted(step.id) : step.id < currentStep || isStepCompleted(step.id);
            const StepIcon = step.icon;
            
            // Explicit color mappings for Tailwind JIT
            const stepCircleActiveClasses: Record<string, string> = {
              blue: 'bg-blue-100 border-blue-500 dark:bg-blue-900/30 dark:border-blue-600',
              purple: 'bg-purple-100 border-purple-500 dark:bg-purple-900/30 dark:border-purple-600',
              green: 'bg-green-100 border-green-500 dark:bg-green-900/30 dark:border-green-600',
              amber: 'bg-amber-100 border-amber-500 dark:bg-amber-900/30 dark:border-amber-600',
            };
            const stepIconActiveClasses: Record<string, string> = {
              blue: 'text-blue-600',
              purple: 'text-purple-600',
              green: 'text-green-600',
              amber: 'text-amber-600',
            };
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div 
                  className={`flex flex-col items-center cursor-pointer transition-all ${
                    mode === 'edit' || step.id <= currentStep ? 'opacity-100' : 'opacity-50'
                  }`}
                  onClick={() => {
                    if (mode === 'edit' || step.id <= currentStep) {
                      setCurrentStep(step.id);
                      setOpenSections(prev => {
                        const newState = { 1: false, 2: false, 3: false, 4: false };
                        newState[step.id] = true;
                        return newState;
                      });
                    }
                  }}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    isCompleted && !isActive
                      ? 'bg-green-100 border-green-500 dark:bg-green-900/30 dark:border-green-600'
                      : isActive
                        ? stepCircleActiveClasses[step.color]
                        : 'bg-gray-100 border-gray-300 dark:bg-slate-700 dark:border-slate-600'
                  }`}>
                    {isCompleted && !isActive ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <StepIcon className={`h-5 w-5 ${isActive ? stepIconActiveClasses[step.color] : 'text-gray-400'}`} />
                    )}
                  </div>
                  <span className={`text-xs mt-1 font-medium ${isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    {step.name}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${
                    (mode === 'edit' || step.id < currentStep) ? 'bg-green-400' : 'bg-gray-200 dark:bg-slate-600'
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Collapsible Step Sections */}
        <div className="space-y-3">
          {/* Step 1: Identity */}
          <Collapsible open={openSections[1]} onOpenChange={() => toggleSection(1)}>
            <div className={`rounded-lg border ${getStepColors(1, openSections[1], isStepCompleted(1)).border} ${getStepColors(1, openSections[1], isStepCompleted(1)).bg} overflow-hidden transition-all`}>
              <CollapsibleTrigger className="w-full">
                <div className={`flex items-center justify-between p-3 ${getStepColors(1, openSections[1], isStepCompleted(1)).header}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${openSections[1] ? 'bg-blue-200/50 dark:bg-blue-800/50' : 'bg-gray-200/50 dark:bg-slate-700/50'}`}>
                      {isStepCompleted(1) && !openSections[1] ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <User className={`h-4 w-4 ${getStepColors(1, openSections[1], isStepCompleted(1)).icon}`} />
                      )}
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold text-sm ${getStepColors(1, openSections[1], isStepCompleted(1)).text}`}>
                        Identity
                      </h3>
                      {!openSections[1] && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{getStepSummary(1)}</p>
                      )}
                    </div>
                  </div>
                  {openSections[1] ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="user-firstName">{t('users.firstName')} *</Label>
                      <Input
                        id="user-firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: capitalizeWords(e.target.value) }))}
                        placeholder={t('users.firstName')}
                        readOnly={crmSourced}
                        title={crmLockTitle}
                        className={lockedInputClass}
                      />
                    </div>
                    <div>
                      <Label htmlFor="user-lastName">{t('users.lastName')} *</Label>
                      <Input
                        id="user-lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: capitalizeWords(e.target.value) }))}
                        placeholder={t('users.lastName')}
                        readOnly={crmSourced}
                        title={crmLockTitle}
                        className={lockedInputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="user-email">{t('users.email')} *</Label>
                    <Input
                      id="user-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder={t('users.email')}
                    />
                    <p className="text-sm text-blue-600 mt-1">{t('users.companyEmailsOnly')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="user-password">
                        {mode === 'edit' ? t('users.newPassword') : `${t('users.password')} *`}
                      </Label>
                      <div className="relative">
                        <Input
                          id="user-password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) => {
                            const next = e.target.value;
                            setFormData(prev => ({ ...prev, password: next }));
                            // Drop the prior reuse warning the moment the
                            // admin starts typing a new candidate so it
                            // never appears stale relative to the input.
                            if (passwordReuseError) setPasswordReuseError(null);
                          }}
                          placeholder={mode === 'edit' ? t('users.keepPassword') : t('users.password')}
                          aria-describedby="user-password-rules"
                          aria-invalid={!!passwordReuseError || (!!formData.password && !validatePassword(formData.password).isValid)}
                          className={`pr-10 ${(passwordReuseError || (formData.password && !validatePassword(formData.password).isValid)) ? "border-red-500" : ""}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <PasswordRuleChecklist
                        password={formData.password}
                        id="user-password-rules"
                      />
                      <p
                        className="mt-1 text-xs text-muted-foreground"
                        data-testid="text-password-help-no-reuse"
                      >
                        {t('users.passwordHelpNoReuse', { count: historySize })}
                      </p>
                      {formData.password && !validatePassword(formData.password).isValid && (
                        <p className="text-sm text-red-500 mt-1">{validatePassword(formData.password).error}</p>
                      )}
                      {passwordReuseError && (
                        <p
                          className="text-sm text-red-500 mt-1"
                          role="alert"
                          data-testid="text-password-reuse-error"
                        >
                          {passwordReuseError.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="user-confirm-password">
                        {mode === 'edit' ? 'Confirm New Password' : 'Confirm Password *'}
                      </Label>
                      <div className="relative">
                        <Input
                          id="user-confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={mode === 'edit' ? 'Retype new password' : 'Retype password'}
                          className={`pr-10 ${confirmPassword && formData.password !== confirmPassword ? "border-red-500" : ""}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {confirmPassword && formData.password !== confirmPassword && (
                        <p className="text-sm text-red-500 mt-1">{t('users.passwordsDoNotMatch')}</p>
                      )}
                      {confirmPassword && formData.password === confirmPassword && confirmPassword.length > 0 && (
                        <p className="text-sm text-green-600 mt-1">{t('users.passwordsMatch')}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="user-role">{t('users.role')} *</Label>
                      <Select value={formData.role} onValueChange={handleRoleChange} disabled={isProtectedUser}>
                        <SelectTrigger className={isProtectedUser ? 'cursor-not-allowed opacity-60' : ''}>
                          <SelectValue placeholder={t('users.selectRole')}>
                            {formData.role && (() => {
                              const selectedRole = availableRoles.find((r: any) => r.name === formData.role);
                              return selectedRole ? (
                                <span className="flex items-center gap-2">
                                  {selectedRole.icon && selectedRole.icon.trim() && (
                                    <DynamicIcon name={selectedRole.icon} className="h-3.5 w-3.5" style={{ color: selectedRole.color || '#6b7280' }} />
                                  )}
                                  {selectedRole.displayName}
                                </span>
                              ) : formData.role;
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((role: any) => (
                            <SelectItem key={role.id} value={role.name}>
                              <span className="flex items-center gap-2">
                                {role.icon && role.icon.trim() && (
                                  <DynamicIcon name={role.icon} className="h-3.5 w-3.5" style={{ color: role.color || '#6b7280' }} />
                                )}
                                {role.displayName}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                  </div>
                  {isAdminUser && (
                    <div>
                      <Label htmlFor="user-allowed-login-methods">{t('users.allowedLoginMethods.label')}</Label>
                      <Select
                        value={formData.allowedLoginMethods}
                        // Ignore anything that isn't a known value: Radix can
                        // fire onValueChange("") while mounting, which would
                        // reset a just-hydrated value (the PR #191 race).
                        onValueChange={(value) => {
                          if (isAllowedLoginMethod(value)) {
                            setFormData(prev => ({ ...prev, allowedLoginMethods: value }));
                          }
                        }}
                      >
                        <SelectTrigger id="user-allowed-login-methods" data-testid="select-allowed-login-methods">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOWED_LOGIN_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {t(`users.allowedLoginMethods.options.${method}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('users.allowedLoginMethods.help')}
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Step 2: Organization */}
          <Collapsible open={openSections[2]} onOpenChange={() => toggleSection(2)}>
            <div className={`rounded-lg border ${getStepColors(2, openSections[2], isStepCompleted(2)).border} ${getStepColors(2, openSections[2], isStepCompleted(2)).bg} overflow-hidden transition-all ${mode === 'create' && currentStep < 2 ? 'opacity-50' : ''}`}>
              <CollapsibleTrigger className="w-full" disabled={mode === 'create' && currentStep < 2}>
                <div className={`flex items-center justify-between p-3 ${getStepColors(2, openSections[2], isStepCompleted(2)).header}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${openSections[2] ? 'bg-purple-200/50 dark:bg-purple-800/50' : 'bg-gray-200/50 dark:bg-slate-700/50'}`}>
                      {isStepCompleted(2) && !openSections[2] ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Building className={`h-4 w-4 ${getStepColors(2, openSections[2], isStepCompleted(2)).icon}`} />
                      )}
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold text-sm ${getStepColors(2, openSections[2], isStepCompleted(2)).text}`}>
                        Organization
                      </h3>
                      {!openSections[2] && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{getStepSummary(2)}</p>
                      )}
                    </div>
                  </div>
                  {openSections[2] ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Account {accountSelectionMode !== 'all' && !isInternalUser ? '*' : ''}</Label>
                      
                      {/* Internal account - auto-detected from email domain */}
                      {isInternalUser && (
                        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 cursor-not-allowed">
                          <Building className="h-4 w-4 text-purple-500" />
                          <span className="font-medium">{internalAccountName ?? t('common.internal')}</span>
                        </div>
                      )}
                      
                      {/* Internal roles - all accounts, optionally linked to an internal account */}
                      {!isInternalUser && accountSelectionMode === 'all' && activeInternalAccounts.length === 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 cursor-not-allowed">
                          <Globe className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{t('users.allAccounts')}</span>
                        </div>
                      )}
                      {!isInternalUser && accountSelectionMode === 'all' && activeInternalAccounts.length > 0 && (
                        <Select
                          value={formData.accountId != null && internalAccountIds.has(formData.accountId) ? String(formData.accountId) : "none"}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, accountId: value === "none" ? null : Number(value) }))}
                        >
                          <SelectTrigger data-testid="select-internal-account">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <div className="flex items-center">
                                <Globe className="h-4 w-4 mr-2 text-blue-500" />
                                {t('users.noInternalAccount')}
                              </div>
                            </SelectItem>
                            {activeInternalAccounts.map((account: any) => (
                              <SelectItem key={account.id} value={String(account.id)}>
                                <div className="flex items-center">
                                  <Building className="h-4 w-4 mr-2 text-purple-500" />
                                  {account.accountName}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      
                      {/* Single Account - Popover dropdown for Customer/Guest */}
                      {!isInternalUser && accountSelectionMode === 'single' && (
                        <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={accountPopoverOpen}
                              className="w-full justify-between font-normal"
                            >
                              {formData.accountId
                                ? customers.find((c: any) => c.id === formData.accountId)?.accountName || t('users.selectAccount')
                                : t('users.selectAccount')}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t('users.searchAccounts')} />
                              <CommandList>
                                <CommandEmpty>{t('users.noAccountFound')}</CommandEmpty>
                                <CommandGroup>
                                  {customers
                                    .filter((c: any) => c.isActive !== false)
                                    .map((customer: any) => (
                                      <CommandItem
                                        key={customer.id}
                                        value={customer.accountName}
                                        onSelect={() => {
                                          setFormData(prev => ({ ...prev, accountId: customer.id }));
                                          setAccountPopoverOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={`mr-2 h-4 w-4 ${formData.accountId === customer.id ? "opacity-100" : "opacity-0"}`}
                                        />
                                        <Building className="mr-2 h-4 w-4 text-purple-500" />
                                        {customer.accountName}
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}
                      
                      {/* Multi-Select Accounts - Checkbox list for Partner */}
                      {!isInternalUser && accountSelectionMode === 'multi' && (
                        <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={accountPopoverOpen}
                              className="w-full justify-between font-normal"
                            >
                              {formData.selectedAccountIds.length > 0
                                ? `${formData.selectedAccountIds.length} account${formData.selectedAccountIds.length > 1 ? 's' : ''} selected`
                                : "Select accounts..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t('users.searchAccounts')} />
                              <CommandList>
                                <CommandEmpty>{t('users.noAccountFound')}</CommandEmpty>
                                <CommandGroup>
                                  {customers
                                    .filter((c: any) => c.isActive !== false)
                                    .map((customer: any) => {
                                      const isSelected = formData.selectedAccountIds.includes(customer.id);
                                      return (
                                        <CommandItem
                                          key={customer.id}
                                          value={customer.accountName}
                                          onSelect={() => {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedAccountIds: isSelected
                                                ? prev.selectedAccountIds.filter(id => id !== customer.id)
                                                : [...prev.selectedAccountIds, customer.id]
                                            }));
                                          }}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                                          />
                                          <Building className="mr-2 h-4 w-4 text-purple-500" />
                                          {customer.accountName}
                                        </CommandItem>
                                      );
                                    })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}
                      
                      {isInternalUser && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('users.internalAccountAutoDetected')}
                        </p>
                      )}
                      {!isInternalUser && accountSelectionMode === 'all' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('users.internalAccountHelp')}
                        </p>
                      )}
                      {!isInternalUser && accountSelectionMode === 'multi' && formData.selectedAccountIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {formData.selectedAccountIds.slice(0, 3).map(id => {
                            const account = customers.find((c: any) => c.id === id);
                            return account ? (
                              <span key={id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                {account.accountName}
                              </span>
                            ) : null;
                          })}
                          {formData.selectedAccountIds.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              +{formData.selectedAccountIds.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="user-title">{t('users.title')} *</Label>
                      <Input
                        id="user-title"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder={t('users.title')}
                        readOnly={crmSourced}
                        title={crmLockTitle}
                        className={lockedInputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="user-department">{t('users.department')} *</Label>
                      <Select value={formData.department} onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users.selectDepartment')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="C-Level">{t('departments.cLevel')}</SelectItem>
                          <SelectItem value="HR">{t('departments.hr')}</SelectItem>
                          <SelectItem value="Finance">{t('departments.finance')}</SelectItem>
                          <SelectItem value="Marketing">{t('departments.marketing')}</SelectItem>
                          <SelectItem value="Sales">{t('departments.sales')}</SelectItem>
                          <SelectItem value="Operations">{t('departments.operations')}</SelectItem>
                          <SelectItem value="Engineering">{t('departments.engineering')}</SelectItem>
                          <SelectItem value="Security">{t('departments.security')}</SelectItem>
                          <SelectItem value="Network">{t('departments.network')}</SelectItem>
                          <SelectItem value="R&D">{t('departments.rnd')}</SelectItem>
                          <SelectItem value="Support">{t('departments.support')}</SelectItem>
                          <SelectItem value="IT">{t('departments.it')}</SelectItem>
                          <SelectItem value="CX">{t('departments.cx')}</SelectItem>
                          <SelectItem value="Services">{t('departments.services')}</SelectItem>
                          <SelectItem value="Product">{t('departments.product')}</SelectItem>
                          <SelectItem value="Other">{t('departments.other')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="user-manager">{t('users.manager')}</Label>
                      <Select
                        value={formData.managerId || "no-manager"}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, managerId: value === "no-manager" ? null : value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('users.selectManager')} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          <SelectItem value="no-manager">{t('users.noManager')}</SelectItem>
                          {(allUsers as any[])
                            .filter((u: any) => u.isActive !== false && u.id !== userData?.id)
                            .map((u: any) => (
                              <SelectItem key={u.id} value={u.id}>
                                <span className="flex items-center gap-2">
                                  <User className="h-3.5 w-3.5 text-purple-500" />
                                  {u.firstName} {u.lastName}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="user-region">{t('users.region')} *</Label>
                      <Select value={formData.region} onValueChange={(value) => setFormData(prev => ({ ...prev, region: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users.selectRegion')}>
                            {formData.region && (
                              <span className="flex items-center">
                                {getRegionIcon(formData.region)}
                                {formData.region}
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="North America">
                            <span className="flex items-center"><MapPin className="h-4 w-4 mr-2 text-emerald-600" />{t('regions.northAmerica')}</span>
                          </SelectItem>
                          <SelectItem value="South America">
                            <span className="flex items-center"><MapPin className="h-4 w-4 mr-2 text-emerald-600" />{t('regions.southAmerica')}</span>
                          </SelectItem>
                          <SelectItem value="Europe">
                            <span className="flex items-center"><MapPin className="h-4 w-4 mr-2 text-emerald-600" />{t('regions.europe')}</span>
                          </SelectItem>
                          <SelectItem value="Asia Pacific">
                            <span className="flex items-center"><MapPin className="h-4 w-4 mr-2 text-emerald-600" />{t('regions.asiaPacific')}</span>
                          </SelectItem>
                          <SelectItem value="Middle East & Africa">
                            <span className="flex items-center"><Compass className="h-4 w-4 mr-2 text-amber-600" />{t('regions.middleEastAfrica')}</span>
                          </SelectItem>
                          <SelectItem value="Global">
                            <span className="flex items-center"><Globe className="h-4 w-4 mr-2 text-blue-600" />{t('regions.global')}</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="user-timezone">{t('users.timezone')} *</Label>
                      <Select value={formData.timezone} onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users.selectTimezone')} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {getTimezoneLabel(tz.value, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {canEditTeams && (
                    <div className="space-y-2">
                      <Label>{t('teams.users.teams')}</Label>
                      <UserTeamsPicker
                        teams={allTeams}
                        value={teamDraft}
                        onChange={setTeamDraft}
                        outsideUser={isOutsideRole}
                      />
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Step 3: Specializations */}
          <Collapsible open={openSections[3]} onOpenChange={() => toggleSection(3)}>
            <div className={`rounded-lg border ${getStepColors(3, openSections[3], isStepCompleted(3)).border} ${getStepColors(3, openSections[3], isStepCompleted(3)).bg} overflow-hidden transition-all ${mode === 'create' && currentStep < 3 ? 'opacity-50' : ''}`}>
              <CollapsibleTrigger className="w-full" disabled={mode === 'create' && currentStep < 3}>
                <div className={`flex items-center justify-between p-3 ${getStepColors(3, openSections[3], isStepCompleted(3)).header}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${openSections[3] ? 'bg-green-200/50 dark:bg-green-800/50' : 'bg-gray-200/50 dark:bg-slate-700/50'}`}>
                      {isStepCompleted(3) && !openSections[3] ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Briefcase className={`h-4 w-4 ${getStepColors(3, openSections[3], isStepCompleted(3)).icon}`} />
                      )}
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold text-sm ${getStepColors(3, openSections[3], isStepCompleted(3)).text}`}>
                        Specializations
                      </h3>
                      {!openSections[3] && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{getStepSummary(3)}</p>
                      )}
                    </div>
                  </div>
                  {openSections[3] ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 space-y-4">
                  <div>
                    <Label>{t('users.solutions')} *</Label>
                    {isInternalUser && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('users.internalNoSolutions')}</p>
                    )}
                    <div className={`mt-2 grid grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded-md p-3 bg-white dark:bg-slate-900 ${isInternalUser ? 'opacity-60' : ''}`}>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="specialty-none"
                          checked={formData.specialties.includes("None")}
                          onChange={() => toggleSpecialty("None")}
                          className="rounded"
                          disabled={isInternalUser}
                        />
                        <Label htmlFor="specialty-none" className="text-sm">None</Label>
                      </div>
                      {(solutions as any[])
                        .filter((solution: any) => solution.isActive === true)
                        .map((solution: any) => (
                        <div key={solution.id} className={`flex items-center space-x-2 ${formData.specialties.includes("None") ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            id={`specialty-${solution.id}`}
                            checked={formData.specialties.includes(solution.name)}
                            onChange={() => toggleSpecialty(solution.name)}
                            className="rounded"
                            disabled={formData.specialties.includes("None") || isInternalUser}
                          />
                          <Label htmlFor={`specialty-${solution.id}`} className="text-sm flex items-center gap-2">
                            {solution.solutionIcon || solution.solutionIconName ? (
<SolutionGraphic graphic={solution.solutionIcon} icon={solution.solutionIconName} name={solution.name} className="w-4 h-4 object-contain" />
) : (
                              <Package className="h-4 w-4 text-green-500" />
                            )}
                            {solution.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>{t('users.stakeholderTypes')} *</Label>
                    {isInternalUser && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('users.internalNoStakeholders')}</p>
                    )}
                    <div className={`mt-2 grid grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded-md p-3 bg-white dark:bg-slate-900 ${isInternalUser ? 'opacity-60' : ''}`}>
                      {["Technical Champion", "Business Champion", "Economic Buyer", "Project Admin", "IT Admin", "IT Leader", "Non-IT", "C-Level", "Leadership", "All", "None"].map((type) => {
                        const hasNoneSelected = formData.stakeholderTypes.includes("None");
                        const hasAllSelected = formData.stakeholderTypes.includes("All");
                        const isExclusiveOption = type === "None" || type === "All";

                        // Disable non-exclusive options when "None" or "All" is selected
                        const isDisabled = (hasNoneSelected || hasAllSelected) && !isExclusiveOption;

                        return (
                          <div key={type} className={`flex items-center space-x-2 ${isDisabled ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              id={`stakeholder-${type}`}
                              checked={formData.stakeholderTypes.includes(type)}
                              onChange={() => toggleStakeholderType(type)}
                              className="rounded"
                              disabled={isDisabled || isInternalUser}
                            />
                            <Label htmlFor={`stakeholder-${type}`} className="text-sm">{type}</Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Step 4: Permissions */}
          <Collapsible open={openSections[4]} onOpenChange={() => toggleSection(4)}>
            <div className={`rounded-lg border ${getStepColors(4, openSections[4], isStepCompleted(4)).border} ${getStepColors(4, openSections[4], isStepCompleted(4)).bg} overflow-hidden transition-all ${mode === 'create' && currentStep < 4 ? 'opacity-50' : ''}`}>
              <CollapsibleTrigger className="w-full" disabled={mode === 'create' && currentStep < 4}>
                <div className={`flex items-center justify-between p-3 ${getStepColors(4, openSections[4], isStepCompleted(4)).header}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${openSections[4] ? 'bg-amber-200/50 dark:bg-amber-800/50' : 'bg-gray-200/50 dark:bg-slate-700/50'}`}>
                      {isStepCompleted(4) && !openSections[4] ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Shield className={`h-4 w-4 ${getStepColors(4, openSections[4], isStepCompleted(4)).icon}`} />
                      )}
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold text-sm ${getStepColors(4, openSections[4], isStepCompleted(4)).text}`}>
                        Permissions
                      </h3>
                      {!openSections[4] && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{getStepSummary(4)}</p>
                      )}
                    </div>
                  </div>
                  {openSections[4] ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 space-y-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                    <p>{t('users.permissionsNote')}</p>
                  </div>
                  <div className="max-h-[28rem] overflow-y-auto rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <PermissionTreeEditor
                      values={formData.sectionPermissions}
                      isAdminRole={formData.role === 'Admin'}
                      disabled={!canEditPermissions}
                      onChange={(keys, level) =>
                        setFormData(prev => ({
                          ...prev,
                          sectionPermissions: { ...prev.sectionPermissions, ...Object.fromEntries(keys.map((key) => [key, level])) },
                        }))
                      }
                    />
                  </div>
                  
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Work week and time off: saved on its own, edit mode only */}
          {mode === 'edit' && userData?.id && (
            <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-md bg-gray-200/50 dark:bg-slate-700/50">
                        <CalendarClock className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{t('profile.workSchedule.heading')}</h3>
                        {!scheduleOpen && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('profile.workSchedule.adminSummary')}</p>
                        )}
                      </div>
                    </div>
                    {scheduleOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-4 pt-0 space-y-3">
                    <p className="text-xs text-muted-foreground">{t('profile.workSchedule.adminNote')}</p>
                    <WorkScheduleEditor userId={userData.id} />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>

        {/* Active Status & Navigation Buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-4">
            {currentStep > 1 && (
              <Button type="button" onClick={goToPrevStep}>
                <CircleArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="user-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: !!checked }))}
              />
              <Label htmlFor="user-active" className="text-sm font-medium">{t('users.active')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="skip-welcome-email"
                checked={formData.skipWelcomeEmail}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, skipWelcomeEmail: !!checked }))}
              />
              <Label htmlFor="skip-welcome-email" className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('users.doNotSendWelcomeEmail')}</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-1" />
              {t('common.cancel')}
            </Button>
            {currentStep < 4 && mode === 'create' ? (
              <Button 
                type="button" 
                onClick={goToNextStep}
                disabled={!isStepCompleted(currentStep)}
              >
                <CircleArrowRight className="h-4 w-4 mr-1" />
                Next
              </Button>
            ) : (
              <Button 
                type="submit" 
                onClick={handleSubmit}
                disabled={
                  (mode === 'create' && createUserMutation.isPending) ||
                  (mode === 'edit' && updateUserMutation.isPending) ||
                  !formData.firstName.trim() ||
                  !formData.lastName.trim() ||
                  !formData.email.trim() ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) ||
                  (mode === 'create' && (!formData.password.trim() || !validatePassword(formData.password).isValid)) ||
                  !formData.role ||
                  // Role-based account validation (skip for internal users)
                  (!isInternalUser && getAccountSelectionMode(formData.role) === 'single' && !formData.accountId) ||
                  (!isInternalUser && getAccountSelectionMode(formData.role) === 'multi' && formData.selectedAccountIds.length === 0) ||
                  !formData.title.trim() ||
                  !formData.department ||
                  !formData.region ||
                  !formData.timezone ||
                  formData.specialties.length === 0 ||
                  formData.stakeholderTypes.length === 0
                }
              >
                {mode === 'create' && createUserMutation.isPending && t('common.loading')}
                {mode === 'edit' && updateUserMutation.isPending && t('common.updating')}
                {mode === 'create' && !createUserMutation.isPending && (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    {t('users.createUserTitle')}
                  </>
                )}
                {mode === 'edit' && !updateUserMutation.isPending && (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    {t('common.updateUser')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}