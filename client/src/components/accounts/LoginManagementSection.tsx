import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Globe, 
  Key, 
  Users, 
  Calendar, 
  Copy, 
  CheckCircle2, 
  XCircle,
  Building,
  RefreshCw,
  Lock,
  AlertTriangle,
  Info,
  Server,
  ScanQrCode,
  X,
  SquarePen,
  UserCircle,
  FolderClock
} from "lucide-react";
import { format } from "date-fns";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import CreateUserDialog from "@/components/accounts/CreateUserDialog";
import CreateCustomerDialog from "@/components/accounts/CreateCustomerDialog";

interface AllowedDomain {
  id: number;
  domain: string;
  accountId: number | null;
  accountName?: string;
  autoApprove: boolean;
  createdAt: string;
  createdById: number;
  createdByName?: string;
  isActive: boolean;
}

interface AccessCode {
  id: number;
  code: string;
  accountId: number;
  accountName?: string;
  assignedRole?: string;
  description: string | null;
  maxUses: number | null;
  currentUses: number;
  expiresAt: string | null;
  bypassLimits?: boolean;
  domains?: string[] | null;
  isActive: boolean;
  createdAt: string;
  createdById: number;
  createdByName?: string;
}

interface CodeUsageUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  usedAt: string;
}

interface Account {
  id: number;
  accountName: string;
  isInternal?: boolean;
}

export default function LoginManagementSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isAdmin = user?.role === "Admin";
  
  const [domainSort, handleDomainSort] = useUrlSortState("allowedDomains");
  const [newDomain, setNewDomain] = useState("");
  const [newDomainAccountId, setNewDomainAccountId] = useState<number | null>(null);
  const [newDomainAutoApprove, setNewDomainAutoApprove] = useState(true);
  const [newDomainCreateCode, setNewDomainCreateCode] = useState(false);
  const [newDomainSelected, setNewDomainSelected] = useState<string[]>([]); // domains to allow for the account
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);

  const [newCodeDescription, setNewCodeDescription] = useState("");
  const [newCodeAccountId, setNewCodeAccountId] = useState<number | null>(null);
  const [newCodePrefix, setNewCodePrefix] = useState("");
  const [newCodeRole, setNewCodeRole] = useState("");
  const [newCodeMaxUses, setNewCodeMaxUses] = useState<number>(2);
  const [newCodeExpiresInDays, setNewCodeExpiresInDays] = useState<number>(5);
  const [newCodeBypassLimits, setNewCodeBypassLimits] = useState(false);
  const [newCodeDomains, setNewCodeDomains] = useState<string[]>([]); // empty = all account domains
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);

  const [editingDomain, setEditingDomain] = useState<AllowedDomain | null>(null);
  const [editDomainAccountId, setEditDomainAccountId] = useState<number | null>(null);
  const [editDomainAutoApprove, setEditDomainAutoApprove] = useState(true);
  const [editDomainDialogOpen, setEditDomainDialogOpen] = useState(false);

  // Edit access code dialog
  const [editingCode, setEditingCode] = useState<AccessCode | null>(null);
  const [editCodeDialogOpen, setEditCodeDialogOpen] = useState(false);
  const [editCodeAccountId, setEditCodeAccountId] = useState<number | null>(null);
  const [editCodeRole, setEditCodeRole] = useState("");
  const [editCodeDescription, setEditCodeDescription] = useState("");
  const [editCodeMaxUses, setEditCodeMaxUses] = useState<number>(2);
  const [editCodeExpiresInDays, setEditCodeExpiresInDays] = useState<number>(5);
  const [editCodeBypassLimits, setEditCodeBypassLimits] = useState(false);
  const [editCodeDomains, setEditCodeDomains] = useState<string[]>([]);

  const [selectedCode, setSelectedCode] = useState<AccessCode | null>(null);
  const [codeUsageDrawerOpen, setCodeUsageDrawerOpen] = useState(false);
  const [inactiveCodesDrawerOpen, setInactiveCodesDrawerOpen] = useState(false);
  
  // Dialog states for header button events
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
  
  // Listen for header button events (Create Account and Create User)
  useEffect(() => {
    const handleCreateUser = () => {
      setIsCreateUserDialogOpen(true);
    };
    const handleCreateAccount = () => {
      setIsCreateCustomerDialogOpen(true);
    };

    window.addEventListener('createUser', handleCreateUser);
    window.addEventListener('createAccount', handleCreateAccount);
    return () => {
      window.removeEventListener('createUser', handleCreateUser);
      window.removeEventListener('createAccount', handleCreateAccount);
    };
  }, []);
  
  const { data: domains = [], isLoading: domainsLoading } = useQuery<AllowedDomain[]>({
    queryKey: ["/api/admin/allowed-domains"],
    enabled: isAdmin,
  });
  
  const { data: accessCodes = [], isLoading: codesLoading } = useQuery<AccessCode[]>({
    queryKey: ["/api/admin/access-codes"],
    enabled: isAdmin,
  });
  
  // Login Management only ever links internal (login-only) accounts.
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/customers", { scope: "internal" }],
    enabled: isAdmin,
  });

  // Approved domains for the account selected in the Generate / Edit code dialog
  // (drives the per-code domain multi-select). Empty selection = all domains.
  const { data: newCodeAccountDomains = [] } = useQuery<string[]>({
    queryKey: [`/api/customers/${newCodeAccountId}/approved-domains`],
    enabled: isAdmin && !!newCodeAccountId && codeDialogOpen,
  });
  const { data: newDomainAccountDomains = [] } = useQuery<string[]>({
    queryKey: [`/api/customers/${newDomainAccountId}/approved-domains`],
    enabled: isAdmin && !!newDomainAccountId && domainDialogOpen,
  });
  const { data: editCodeAccountDomains = [] } = useQuery<string[]>({
    queryKey: [`/api/customers/${editCodeAccountId}/approved-domains`],
    enabled: isAdmin && !!editCodeAccountId && editCodeDialogOpen,
  });
  
  const { data: roles = [] } = useQuery<{ id: number; name: string; displayName: string; icon?: string; color?: string }[]>({
    queryKey: ["/api/roles"],
    enabled: isAdmin,
  });
  
  // Restricted roles that only Admin can assign via access codes
  const adminOnlyRoles = ["Admin", "CX", "Product", "Sales", "Services", "Support"];
  
  // Filter roles based on current user's role - non-admins can't assign restricted roles
  const availableRoles = roles.filter(role => {
    if (isAdmin) return true;
    return !adminOnlyRoles.includes(role.name);
  });
  
  const { data: codeUsageUsers = [], isLoading: codeUsageLoading } = useQuery<CodeUsageUser[]>({
    queryKey: ["/api/admin/access-codes", selectedCode?.id, "usage"],
    queryFn: async () => {
      if (!selectedCode?.id) return [];
      // `apiRequest` returns the parsed JSON body directly — calling
      // `.json()` on it throws and silently kicks the query into its
      // error branch (task #754).
      return await apiRequest("GET", `/api/admin/access-codes/${selectedCode.id}/usage`);
    },
    enabled: isAdmin && !!selectedCode?.id && codeUsageDrawerOpen,
  });
  

  const bulkDomainMutation = useMutation({
    mutationFn: (data: { accountId?: number; domains: string[]; autoApprove: boolean; createCode?: boolean }) =>
      apiRequest("POST", "/api/admin/allowed-domains/bulk", data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allowed-domains"] });
      // Domains were also merged into the account's column — refresh accounts +
      // any approved-domains pickers so the badge/dropdown reflect it.
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/approved-domains") });
      if (res?.generatedCode) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
        toast({ title: t("accounts.loginManagement.toasts.domainAddedTitle"), description: t("accounts.loginManagement.toasts.domainAndCodeAddedDesc", { code: res.generatedCode.code }), variant: "success", icon: CheckCircle2 });
      } else {
        toast({ title: t("accounts.loginManagement.toasts.domainAddedTitle"), description: t("accounts.loginManagement.toasts.domainAddedDesc"), variant: "success", icon: CheckCircle2 });
      }
      setDomainDialogOpen(false);
      resetDomainForm();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorAddDomain"),
        variant: "error",
        icon: XCircle
      });
    },
  });
  
  const deleteDomainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/allowed-domains/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allowed-domains"] });
      toast({ title: t("accounts.loginManagement.toasts.domainRemovedTitle"), description: t("accounts.loginManagement.toasts.domainRemovedDesc"), variant: "success", icon: CheckCircle2 });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorRemoveDomain"),
        variant: "error",
        icon: XCircle
      });
    },
  });

  const updateDomainMutation = useMutation({
    mutationFn: (data: { id: number; accountId?: number | null; autoApprove?: boolean }) =>
      apiRequest("PUT", `/api/admin/allowed-domains/${data.id}`, { 
        accountId: data.accountId, 
        autoApprove: data.autoApprove 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allowed-domains"] });
      toast({ title: t("accounts.loginManagement.toasts.domainUpdatedTitle"), description: t("accounts.loginManagement.toasts.domainUpdatedDesc"), variant: "success", icon: CheckCircle2 });
      setEditDomainDialogOpen(false);
      setEditingDomain(null);
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorUpdateDomain"),
        variant: "error",
        icon: XCircle
      });
    },
  });
  
  const createAccessCodeMutation = useMutation({
    mutationFn: (data: { accountId: number; prefix: string; assignedRole: string; description?: string; maxUses: number; expiresInDays: number; bypassLimits: boolean; domains: string[] }) =>
      apiRequest("POST", "/api/admin/access-codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
      toast({ title: t("accounts.loginManagement.toasts.accessCodeCreatedTitle"), description: t("accounts.loginManagement.toasts.accessCodeCreatedDesc"), variant: "success", icon: CheckCircle2 });
      setCodeDialogOpen(false);
      resetCodeForm();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorCreateCode"),
        variant: "error",
        icon: XCircle
      });
    },
  });

  const updateAccessCodeMutation = useMutation({
    mutationFn: (data: { id: number; accountId: number | null; assignedRole: string; description?: string; maxUses: number; expiresInDays: number; bypassLimits: boolean; domains: string[] }) =>
      apiRequest("PUT", `/api/admin/access-codes/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
      toast({ title: t("accounts.loginManagement.toasts.accessCodeUpdatedTitle"), description: t("accounts.loginManagement.toasts.accessCodeUpdatedDesc"), variant: "success", icon: CheckCircle2 });
      setEditCodeDialogOpen(false);
      setEditingCode(null);
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorUpdateCode"),
        variant: "error",
        icon: XCircle
      });
    },
  });

  const deactivateCodeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/access-codes/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
      toast({ title: t("accounts.loginManagement.toasts.accessCodeDeactivatedTitle"), description: t("accounts.loginManagement.toasts.accessCodeDeactivatedDesc"), variant: "success", icon: CheckCircle2 });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorDeactivateCode"),
        variant: "error",
        icon: XCircle
      });
    },
  });

  const reactivateCodeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/access-codes/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
      toast({ title: t("accounts.loginManagement.toasts.accessCodeReactivatedTitle"), description: t("accounts.loginManagement.toasts.accessCodeReactivatedDesc"), variant: "success", icon: CheckCircle2 });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.loginManagement.toasts.errorReactivateCode"),
        variant: "error",
        icon: XCircle
      });
    },
  });
  
  const resetDomainForm = () => {
    setNewDomain("");
    setNewDomainAccountId(null);
    setNewDomainAutoApprove(true);
    setNewDomainCreateCode(false);
    setNewDomainSelected([]);
  };

  const resetCodeForm = () => {
    setNewCodeDescription("");
    setNewCodeAccountId(null);
    setNewCodePrefix("");
    setNewCodeRole("");
    setNewCodeMaxUses(2);
    setNewCodeExpiresInDays(5);
    setNewCodeBypassLimits(false);
    setNewCodeDomains([]);
  };

  const handleAddDomain = () => {
    // Gather the checked account domains plus any domain typed in the free-add box.
    const pending = newDomain.toLowerCase().trim().replace(/^@/, "");
    const pendingValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(pending);
    const allDomains = Array.from(new Set([...newDomainSelected, ...(pendingValid ? [pending] : [])]));

    if (allDomains.length === 0) {
      toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorEnterDomain"), variant: "error", icon: XCircle });
      return;
    }
    // Creating a login code requires an account to link it to.
    if (newDomainCreateCode && !newDomainAccountId) {
      toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorCodeNeedsAccount"), variant: "error", icon: XCircle });
      return;
    }

    bulkDomainMutation.mutate({
      accountId: newDomainAccountId || undefined,
      domains: allDomains,
      autoApprove: newDomainAutoApprove,
      createCode: newDomainCreateCode,
    });
  };

  const startEditCode = (code: AccessCode) => {
    setEditingCode(code);
    setEditCodeAccountId(code.accountId ?? null);
    setEditCodeRole(code.assignedRole ?? "");
    setEditCodeDescription(code.description ?? "");
    setEditCodeMaxUses(code.maxUses ?? 2);
    setEditCodeBypassLimits(!!code.bypassLimits);
    setEditCodeDomains(Array.isArray(code.domains) ? code.domains : []);
    // Derive remaining days from expiry when present; default to 5 otherwise.
    if (code.expiresAt) {
      const days = Math.max(1, Math.ceil((new Date(code.expiresAt).getTime() - Date.now()) / 86400000));
      setEditCodeExpiresInDays(Math.min(30, days));
    } else {
      setEditCodeExpiresInDays(5);
    }
    setEditCodeDialogOpen(true);
  };

  const handleUpdateCode = () => {
    if (!editingCode) return;
    if (!editCodeRole) {
      toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorSelectRole"), variant: "error", icon: XCircle });
      return;
    }
    if (!editCodeBypassLimits) {
      if (editCodeMaxUses < 1 || editCodeMaxUses > 20) {
        toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorMaxUsesRange"), variant: "error", icon: XCircle });
        return;
      }
      if (editCodeExpiresInDays < 1 || editCodeExpiresInDays > 30) {
        toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorExpiresRange"), variant: "error", icon: XCircle });
        return;
      }
    }
    updateAccessCodeMutation.mutate({
      id: editingCode.id,
      accountId: editCodeAccountId,
      assignedRole: editCodeRole,
      description: editCodeDescription || undefined,
      maxUses: editCodeMaxUses,
      expiresInDays: editCodeExpiresInDays,
      bypassLimits: editCodeBypassLimits,
      domains: editCodeDomains,
    });
  };
  
  const handleCreateCode = () => {
    if (!newCodeAccountId) {
      toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorSelectAccount"), variant: "error", icon: XCircle });
      return;
    }
    if (newCodePrefix.length !== 3) {
      toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorPrefix3Letters"), variant: "error", icon: XCircle });
      return;
    }
    if (!newCodeRole) {
      toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorSelectRole"), variant: "error", icon: XCircle });
      return;
    }
    // bypassLimits codes skip the max-uses / expiry validation entirely.
    if (!newCodeBypassLimits) {
      if (newCodeMaxUses < 1 || newCodeMaxUses > 20) {
        toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorMaxUsesRange"), variant: "error", icon: XCircle });
        return;
      }
      if (newCodeExpiresInDays < 1 || newCodeExpiresInDays > 30) {
        toast({ title: t("common.error"), description: t("accounts.loginManagement.toasts.errorExpiresRange"), variant: "error", icon: XCircle });
        return;
      }
    }

    createAccessCodeMutation.mutate({
      accountId: newCodeAccountId,
      prefix: newCodePrefix.toUpperCase(),
      assignedRole: newCodeRole,
      description: newCodeDescription || undefined,
      maxUses: newCodeMaxUses,
      expiresInDays: newCodeExpiresInDays,
      bypassLimits: newCodeBypassLimits,
      domains: newCodeDomains,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("accounts.loginManagement.toasts.copiedTitle"), description: t("accounts.loginManagement.toasts.copiedDesc"), variant: "success", icon: CheckCircle2 });
  };

  // Per-code domain picker. Empty selection = valid for ALL of the account's
  // approved domains. Shows the account's approved domains as checkboxes.
  const renderCodeDomainPicker = (available: string[], selected: string[], setSelected: (v: string[]) => void) => (
    <div>
      <Label>{t("accounts.loginManagement.codeDomainsLabel")}</Label>
      {available.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.codeDomainsNone")}</p>
      ) : (
        <>
          <div className="mt-1 space-y-1.5 border border-gray-200 dark:border-gray-700 rounded-md p-2 max-h-32 overflow-y-auto">
            {available.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selected.includes(d)}
                  onCheckedChange={(checked) => setSelected(checked ? [...selected, d] : selected.filter((x) => x !== d))}
                />
                <span>{d}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.codeDomainsHint")}</p>
        </>
      )}
    </div>
  );

  const startEditDomain = (domain: AllowedDomain) => {
    setEditingDomain(domain);
    setEditDomainAccountId(domain.accountId);
    setEditDomainAutoApprove(domain.autoApprove);
    setEditDomainDialogOpen(true);
  };

  const handleUpdateDomain = () => {
    if (!editingDomain) return;
    
    updateDomainMutation.mutate({
      id: editingDomain.id,
      accountId: editDomainAccountId,
      autoApprove: editDomainAutoApprove,
    });
  };

  const openCodeUsageDrawer = (code: AccessCode) => {
    setSelectedCode(code);
    setCodeUsageDrawerOpen(true);
  };

  const closeCodeUsageDrawer = () => {
    const codeId = selectedCode?.id;
    setCodeUsageDrawerOpen(false);
    setSelectedCode(null);
    if (codeId) {
      queryClient.removeQueries({ queryKey: ["/api/admin/access-codes", codeId, "usage"] });
    }
  };

  // A bypassLimits ("no usage limit / never expires") code is never exhausted or
  // expired — it ignores both the max-uses cap and the expiry window.
  const isCodeExhausted = (code: any) =>
    !code.bypassLimits && !!code.maxUses && code.currentUses >= code.maxUses;
  const isCodeExpired = (code: any) =>
    !code.bypassLimits && !!code.expiresAt && new Date(code.expiresAt) < new Date();

  // The active card lists every code the admin has enabled (isActive === true).
  // A code that is currently exhausted or expired still appears here — flagged
  // with a status badge — so the admin can bump Max Uses / Expires to make it
  // usable again (usage history is preserved). Only manually deactivated codes
  // (isActive === false) live in the Inactive drawer; reactivating one returns
  // it to this card rather than leaving it stuck out of sight.
  const activeAccessCodes = accessCodes.filter(code => code.isActive);
  const inactiveAccessCodes = accessCodes.filter(code => !code.isActive);
  
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Lock className="h-16 w-16 text-gray-400 dark:text-gray-500" />
        <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-300">{t("accounts.loginManagement.accessRestricted")}</h2>
        <p className="text-gray-500 dark:text-gray-400">{t("accounts.loginManagement.accessRestrictedDesc")}</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={ShieldCheck} />
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            {t("accounts.loginManagement.headerTitle")}
          </CardTitle>
          <CardDescription>{t("accounts.loginManagement.headerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">{t("accounts.loginManagement.defenseInDepthTitle")}</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li><strong>{t("accounts.loginManagement.labelBlockList")}</strong> {t("accounts.loginManagement.defenseStep1")}</li>
                  <li><strong>{t("accounts.loginManagement.labelAllowList")}</strong> {t("accounts.loginManagement.defenseStep2")}</li>
                  <li><strong>{t("accounts.loginManagement.labelAccessCodes")}</strong> {t("accounts.loginManagement.defenseStep3")}</li>
                  <li><strong>{t("accounts.loginManagement.labelManualApproval")}</strong> {t("accounts.loginManagement.defenseStep4")}</li>
                </ol>
              </div>
            </div>
          </div>

          {/* How to onboard internal users — Admin-only guidance */}
          {isAdmin && (
            <div className="mt-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
              <div className="flex gap-3">
                <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-sm text-indigo-800 dark:text-indigo-200">
                  <p className="font-semibold mb-1">{t("accounts.loginManagement.internalSetupTitle")}</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>{t("accounts.loginManagement.internalSetupStep1")}</li>
                    <li>{t("accounts.loginManagement.internalSetupStep2")}</li>
                    <li>{t("accounts.loginManagement.internalSetupStep3")}</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 pb-4">
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Globe} />
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
                <CardTitle className="text-2xl">{t("accounts.loginManagement.domainAllowList")}</CardTitle>
              </div>
              <Dialog open={domainDialogOpen} onOpenChange={setDomainDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Server className="h-4 w-4 mr-2" />
                    {t("accounts.loginManagement.addDomain")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      {t("accounts.loginManagement.addAllowedDomain")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("accounts.loginManagement.addDomainDesc")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Account first */}
                    <div>
                      <Label htmlFor="account">
                        {newDomainCreateCode
                          ? t("accounts.loginManagement.linkToAccountRequired")
                          : t("accounts.loginManagement.linkToAccountOptional")}
                      </Label>
                      <Select
                        value={newDomainAccountId?.toString() || "__none__"}
                        onValueChange={(v) => {
                          setNewDomainAccountId(v === "__none__" ? null : parseInt(v));
                          setNewDomainSelected([]);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("accounts.loginManagement.selectAccountPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {!newDomainCreateCode && (
                            <SelectItem value="__none__">{t("accounts.loginManagement.noAccountLink")}</SelectItem>
                          )}
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id.toString()}>
                              {account.accountName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {newDomainCreateCode
                          ? t("accounts.loginManagement.linkRequiredForCode")
                          : t("accounts.loginManagement.autoAssignDesc")}
                      </p>
                    </div>

                    {/* Domain selection: pick from the account's domains and/or add new */}
                    <div>
                      <Label htmlFor="domain">{t("accounts.loginManagement.domainLabel")}</Label>
                      {newDomainAccountId && newDomainAccountDomains.length > 0 && (
                        <div className="mt-1 space-y-1.5 border border-gray-200 dark:border-gray-700 rounded-md p-2 max-h-32 overflow-y-auto">
                          {newDomainAccountDomains.map((d) => (
                            <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={newDomainSelected.includes(d)}
                                onCheckedChange={(checked) => setNewDomainSelected(checked ? [...newDomainSelected, d] : newDomainSelected.filter((x) => x !== d))}
                              />
                              <span className="font-mono">{d}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {newDomainSelected.filter((d) => !newDomainAccountDomains.includes(d)).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {newDomainSelected.filter((d) => !newDomainAccountDomains.includes(d)).map((d) => (
                            <span key={d} className="flex items-center gap-1 bg-secondary rounded-full px-2 py-0.5 text-xs font-mono">
                              {d}
                              <button type="button" onClick={() => setNewDomainSelected(newDomainSelected.filter((x) => x !== d))} className="hover:bg-black/20 dark:hover:bg-white/20 rounded">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <Input
                        id="domain"
                        className="mt-2"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            const d = newDomain.toLowerCase().trim().replace(/^@/, "");
                            const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d);
                            if (valid && !newDomainSelected.includes(d)) {
                              setNewDomainSelected([...newDomainSelected, d]);
                              setNewDomain("");
                            }
                          }
                        }}
                        placeholder={t("accounts.loginManagement.domainPlaceholder")}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.addDomainPickHint")}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="autoApprove">{t("accounts.loginManagement.autoApproveUsers")}</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t("accounts.loginManagement.autoApproveUsersDesc")}</p>
                      </div>
                      <Switch
                        id="autoApprove"
                        checked={newDomainAutoApprove}
                        onCheckedChange={setNewDomainAutoApprove}
                      />
                    </div>
                    <div className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                      <Checkbox
                        id="createCode"
                        className="mt-0.5"
                        checked={newDomainCreateCode}
                        onCheckedChange={(checked) => {
                          const on = checked as boolean;
                          setNewDomainCreateCode(on);
                          // A login code must be tied to an account. If exactly one
                          // internal account exists, auto-select it so the admin
                          // doesn't hit a "select an account" error.
                          if (on && !newDomainAccountId && accounts.length === 1) {
                            setNewDomainAccountId(accounts[0].id);
                          }
                        }}
                      />
                      <div>
                        <Label htmlFor="createCode" className="text-sm font-medium">{t("accounts.loginManagement.createLoginCode")}</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t("accounts.loginManagement.createLoginCodeDesc")}</p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDomainDialogOpen(false)}>
                      <X className="h-4 w-4 mr-2" />
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={handleAddDomain} disabled={bulkDomainMutation.isPending}>
                      <Server className="h-4 w-4 mr-2" />
                      {bulkDomainMutation.isPending ? t("accounts.loginManagement.adding") : t("accounts.loginManagement.addDomain")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>
              {t("accounts.loginManagement.domainAllowListDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            {domainsLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : domains.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Globe className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>{t("accounts.loginManagement.noDomainsConfigured")}</p>
                <p className="text-sm">{t("accounts.loginManagement.addDomainsHint")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="domain" sortConfig={domainSort} onSort={handleDomainSort}>
                      {t("accounts.loginManagement.tableHeaderDomain")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="accountName" sortConfig={domainSort} onSort={handleDomainSort}>
                      {t("accounts.loginManagement.tableHeaderAccount")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="autoApprove" sortConfig={domainSort} onSort={handleDomainSort}>
                      {t("accounts.loginManagement.tableHeaderAutoApprove")}
                    </SortableTableHead>
                    <SortableTableHead sortable={false} className="w-[100px]">{t("accounts.loginManagement.tableHeaderActions")}</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortRows(domains, domainSort, {
                    domain: (d) => d.domain,
                    accountName: (d) => d.accountName,
                    autoApprove: (d) => d.autoApprove,
                  }).map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-mono">{domain.domain}</TableCell>
                      <TableCell>
                        {domain.accountName ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="gap-1">
                              <Building className="h-3 w-3" />
                              {domain.accountName}
                            </Badge>
                            {(() => {
                              const acctDomains = domains.filter((d) => d.accountId === domain.accountId);
                              const allApproved = acctDomains.length >= 2 && acctDomains.every((d) => d.autoApprove);
                              return allApproved ? (
                                <Badge variant="outline" className="gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {t("accounts.loginManagement.allDomainsBadge")}
                                </Badge>
                              ) : null;
                            })()}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {domain.autoApprove ? (
                          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t("accounts.loginManagement.yes")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                            <XCircle className="h-3 w-3 mr-1" />
                            {t("accounts.loginManagement.no")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => startEditDomain(domain)}
                          >
                            <SquarePen className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 h-8 w-8">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("accounts.loginManagement.removeDomainTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("accounts.loginManagement.removeDomainConfirm")} <strong>{domain.domain}</strong> {t("accounts.loginManagement.removeDomainConfirmSuffix")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                                  onClick={() => deleteDomainMutation.mutate(domain.id)}
                                >
                                  {t("accounts.loginManagement.remove")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Domain Dialog */}
        <Dialog open={editDomainDialogOpen} onOpenChange={setEditDomainDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SquarePen className="h-5 w-5" />
                {t("accounts.loginManagement.editDomainSettings")}
              </DialogTitle>
              <DialogDescription>
                {t("accounts.loginManagement.editDomainSettingsDesc")} <strong>{editingDomain?.domain}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="editAccount">{t("accounts.loginManagement.linkToAccountOptional")}</Label>
                <Select
                  value={editDomainAccountId?.toString() || "__none__"}
                  onValueChange={(v) => setEditDomainAccountId(v === "__none__" ? null : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("accounts.loginManagement.selectAccountPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("accounts.loginManagement.noAccountLink")}</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.autoAssignDesc")}</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="editAutoApprove">{t("accounts.loginManagement.autoApproveUsers")}</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t("accounts.loginManagement.autoApproveUsersDesc")}</p>
                </div>
                <Switch
                  id="editAutoApprove"
                  checked={editDomainAutoApprove}
                  onCheckedChange={setEditDomainAutoApprove}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDomainDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                {t("common.cancel")}
              </Button>
              <Button onClick={handleUpdateDomain} disabled={updateDomainMutation.isPending}>
                <SquarePen className="h-4 w-4 mr-2" />
                {updateDomainMutation.isPending ? t("accounts.loginManagement.saving") : t("accounts.loginManagement.saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Access Code Dialog */}
        <Dialog open={editCodeDialogOpen} onOpenChange={setEditCodeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SquarePen className="h-5 w-5" />
                {t("accounts.loginManagement.editCodeTitle")}
              </DialogTitle>
              <DialogDescription>
                {editingCode ? t("accounts.loginManagement.editCodeDesc", { code: editingCode.code }) : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="editCodeAccount">{t("accounts.loginManagement.accountRequired")}</Label>
                <Select
                  value={editCodeAccountId?.toString() || ""}
                  onValueChange={(v) => setEditCodeAccountId(v ? parseInt(v) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("accounts.loginManagement.selectAccountPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="editCodeRole">{t("accounts.loginManagement.assignedRole")}</Label>
                <Select value={editCodeRole} onValueChange={setEditCodeRole}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("accounts.loginManagement.selectRolePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.name}>
                        <div className="flex items-center gap-2">
                          {role.icon && (
                            <DynamicIcon name={role.icon} className="h-4 w-4" style={{ color: role.color || '#64748b' }} />
                          )}
                          <span>{role.displayName || role.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="editCodeDescription">{t("accounts.loginManagement.descriptionOptional")}</Label>
                <Input
                  id="editCodeDescription"
                  value={editCodeDescription}
                  onChange={(e) => setEditCodeDescription(e.target.value)}
                  placeholder={t("accounts.loginManagement.descriptionPlaceholder")}
                />
              </div>
              {renderCodeDomainPicker(editCodeAccountDomains, editCodeDomains, setEditCodeDomains)}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editCodeMaxUses">{t("accounts.loginManagement.maxUsesRequired")}</Label>
                  <Input
                    id="editCodeMaxUses"
                    type="number"
                    value={editCodeMaxUses}
                    disabled={editCodeBypassLimits}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 20) {
                        setEditCodeMaxUses(val);
                      } else if (e.target.value === "") {
                        setEditCodeMaxUses(2);
                      }
                    }}
                    min={1}
                    max={20}
                  />
                </div>
                <div>
                  <Label htmlFor="editCodeExpiresIn">{t("accounts.loginManagement.expiresInDaysRequired")}</Label>
                  <Input
                    id="editCodeExpiresIn"
                    type="number"
                    value={editCodeExpiresInDays}
                    disabled={editCodeBypassLimits}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 30) {
                        setEditCodeExpiresInDays(val);
                      } else if (e.target.value === "") {
                        setEditCodeExpiresInDays(5);
                      }
                    }}
                    min={1}
                    max={30}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <Checkbox
                  id="editCodeBypassLimits"
                  className="mt-0.5"
                  checked={editCodeBypassLimits}
                  onCheckedChange={(checked) => setEditCodeBypassLimits(checked as boolean)}
                />
                <div>
                  <Label htmlFor="editCodeBypassLimits" className="text-sm font-medium">{t("accounts.loginManagement.bypassLimits")}</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t("accounts.loginManagement.bypassLimitsDesc")}</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCodeDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                {t("common.cancel")}
              </Button>
              <Button onClick={handleUpdateCode} disabled={updateAccessCodeMutation.isPending}>
                <SquarePen className="h-4 w-4 mr-2" />
                {updateAccessCodeMutation.isPending ? t("accounts.loginManagement.saving") : t("accounts.loginManagement.saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Key} />
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-2xl">{t("accounts.loginManagement.accessCodesTitle")}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInactiveCodesDrawerOpen(true)}
                      >
                        <FolderClock className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("accounts.loginManagement.viewInactiveCodes")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <ScanQrCode className="h-4 w-4 mr-2" />
                      {t("accounts.loginManagement.generateCode")}
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ScanQrCode className="h-5 w-5" />
                      {t("accounts.loginManagement.generateAccessCode")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("accounts.loginManagement.generateAccessCodeDesc")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="codeAccount">{t("accounts.loginManagement.accountRequired")}</Label>
                      <Select
                        value={newCodeAccountId?.toString() || ""}
                        onValueChange={(v) => {
                          const accountId = v ? parseInt(v) : null;
                          setNewCodeAccountId(accountId);
                          setNewCodeDomains([]); // domains differ per account
                          if (accountId) {
                            const selectedAccount = accounts.find(a => a.id === accountId);
                            if (selectedAccount) {
                              const prefix = selectedAccount.accountName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
                              setNewCodePrefix(prefix || "ACC");
                            }
                          } else {
                            setNewCodePrefix("");
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("accounts.loginManagement.selectAccountPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id.toString()}>
                              {account.accountName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.linkedAccountHint")}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="codePrefix">{t("accounts.loginManagement.codePrefix")}</Label>
                        <Input
                          id="codePrefix"
                          value={newCodePrefix}
                          onChange={(e) => setNewCodePrefix(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase())}
                          placeholder={t("accounts.loginManagement.codePrefixPlaceholder")}
                          maxLength={3}
                          className="font-mono uppercase"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.exactly3Letters")}</p>
                      </div>
                      <div>
                        <Label htmlFor="codeRole">{t("accounts.loginManagement.assignedRole")}</Label>
                        <Select
                          value={newCodeRole}
                          onValueChange={setNewCodeRole}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("accounts.loginManagement.selectRolePlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => (
                              <SelectItem key={role.id} value={role.name}>
                                <div className="flex items-center gap-2">
                                  {role.icon && (
                                    <DynamicIcon
                                      name={role.icon}
                                      className="h-4 w-4"
                                      style={{ color: role.color || '#64748b' }}
                                    />
                                  )}
                                  <span>{role.displayName || role.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.roleForNewUsers")}</p>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="codeDescription">{t("accounts.loginManagement.descriptionOptional")}</Label>
                      <Input
                        id="codeDescription"
                        value={newCodeDescription}
                        onChange={(e) => setNewCodeDescription(e.target.value)}
                        placeholder={t("accounts.loginManagement.descriptionPlaceholder")}
                      />
                    </div>
                    {newCodeAccountId && renderCodeDomainPicker(newCodeAccountDomains, newCodeDomains, setNewCodeDomains)}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="maxUses">{t("accounts.loginManagement.maxUsesRequired")}</Label>
                        <Input
                          id="maxUses"
                          type="number"
                          value={newCodeMaxUses}
                          disabled={newCodeBypassLimits}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 1 && val <= 20) {
                              setNewCodeMaxUses(val);
                            } else if (e.target.value === "") {
                              setNewCodeMaxUses(2);
                            }
                          }}
                          min={1}
                          max={20}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.maxUsesHint")}</p>
                      </div>
                      <div>
                        <Label htmlFor="expiresIn">{t("accounts.loginManagement.expiresInDaysRequired")}</Label>
                        <Input
                          id="expiresIn"
                          type="number"
                          value={newCodeExpiresInDays}
                          disabled={newCodeBypassLimits}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 1 && val <= 30) {
                              setNewCodeExpiresInDays(val);
                            } else if (e.target.value === "") {
                              setNewCodeExpiresInDays(5);
                            }
                          }}
                          min={1}
                          max={30}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("accounts.loginManagement.expiresInDaysHint")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                      <Checkbox
                        id="bypassLimits"
                        className="mt-0.5"
                        checked={newCodeBypassLimits}
                        onCheckedChange={(checked) => setNewCodeBypassLimits(checked as boolean)}
                      />
                      <div>
                        <Label htmlFor="bypassLimits" className="text-sm font-medium">{t("accounts.loginManagement.bypassLimits")}</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t("accounts.loginManagement.bypassLimitsDesc")}</p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCodeDialogOpen(false)}>
                      <X className="h-4 w-4 mr-2" />
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={handleCreateCode} disabled={createAccessCodeMutation.isPending}>
                      <ScanQrCode className="h-4 w-4 mr-2" />
                      {createAccessCodeMutation.isPending ? t("accounts.loginManagement.creating") : t("accounts.loginManagement.generateCode")}
                    </Button>
                  </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <CardDescription>
              {t("accounts.loginManagement.accessCodesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            {codesLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : activeAccessCodes.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Key className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>{t("accounts.loginManagement.noActiveCodes")}</p>
                <p className="text-sm">{t("accounts.loginManagement.createCodesHint")}</p>
              </div>
            ) : (
              <TooltipProvider>
                <div className="space-y-3">
                  {activeAccessCodes.map((code) => (
                    <div 
                      key={code.id} 
                      className="relative border-0 border-l-4 border-l-blue-800 rounded-lg p-4 bg-white dark:bg-slate-800 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <code 
                                className="text-lg font-bold font-mono text-purple-700 dark:text-purple-400 cursor-pointer hover:underline"
                                onClick={() => openCodeUsageDrawer(code)}
                              >
                                {code.code}
                              </code>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("accounts.loginManagement.clickToViewUsers")}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(code.code)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("accounts.loginManagement.copyToClipboard")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          {isCodeExpired(code) ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" title={t("accounts.loginManagement.statusExpiredHint")}>
                              <Calendar className="h-3 w-3 mr-1" />
                              {t("accounts.loginManagement.statusExpired")}
                            </Badge>
                          ) : isCodeExhausted(code) ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" title={t("accounts.loginManagement.statusLimitReachedHint")}>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {t("accounts.loginManagement.statusLimitReached")}
                            </Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {t("accounts.loginManagement.active")}
                            </Badge>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => startEditCode(code)}
                              >
                                <SquarePen className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("accounts.loginManagement.editCode")}</p>
                            </TooltipContent>
                          </Tooltip>

                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <DangerIconButton className="h-6 w-6" iconClassName="h-3 w-3" />
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("accounts.loginManagement.deactivateCode")}</p>
                              </TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("accounts.loginManagement.deactivateAccessCodeTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("accounts.loginManagement.deactivateAccessCodeConfirm")} <strong>{code.code}</strong>{t("accounts.loginManagement.deactivateAccessCodeSuffix")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                                  onClick={() => deactivateCodeMutation.mutate(code.id)}
                                >
                                  {t("accounts.loginManagement.deactivate")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {code.accountName || t("accounts.loginManagement.unknownUser")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {code.bypassLimits
                            ? t("accounts.loginManagement.unlimitedUses")
                            : `${code.currentUses}/${code.maxUses || "∞"} ${t("accounts.loginManagement.uses")}`}
                        </span>
                        {code.bypassLimits ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {t("accounts.loginManagement.neverExpires")}
                          </span>
                        ) : code.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {t("accounts.loginManagement.expires", { date: format(new Date(code.expiresAt), "MMM d, yyyy") })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <UserCircle className="h-3 w-3" />
                          {t("accounts.loginManagement.createdByLabel", { name: code.createdByName || t("accounts.loginManagement.unknownUser") })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(code.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <Globe className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                        {code.domains && code.domains.length > 0 ? (
                          code.domains.map((d) => (
                            <span key={d} className="text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                              {d}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded font-medium">
                            {t("accounts.loginManagement.codeDomainsAll")}
                          </span>
                        )}
                      </div>

                      {code.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">
                          {code.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Code Usage Drawer */}
      <Sheet open={codeUsageDrawerOpen} onOpenChange={(open) => { if (!open) closeCodeUsageDrawer(); }}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("accounts.loginManagement.usersWhoUsedCode")}
            </SheetTitle>
            <SheetDescription>
              {t("accounts.loginManagement.codeLabel")} <strong className="font-mono text-purple-700 dark:text-purple-400">{selectedCode?.code}</strong>
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {codeUsageLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
              </div>
            ) : codeUsageUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Users className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>{t("accounts.loginManagement.noUsersUsedCode")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {codeUsageUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <UserCircle className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                      <div>
                        <p className="font-medium">{user.firstName} {user.lastName}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(user.usedAt), "MMM d, yyyy")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Inactive Codes Drawer */}
      <Sheet open={inactiveCodesDrawerOpen} onOpenChange={setInactiveCodesDrawerOpen}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FolderClock className="h-5 w-5" />
              {t("accounts.loginManagement.inactiveAccessCodes")}
            </SheetTitle>
            <SheetDescription>
              {t("accounts.loginManagement.inactiveDesc")}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {inactiveAccessCodes.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FolderClock className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>{t("accounts.loginManagement.noInactiveCodes")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inactiveAccessCodes.map((code) => (
                  <div
                    key={code.id}
                    className="relative border-0 border-l-4 border-l-gray-400 rounded-lg p-4 bg-gray-50 dark:bg-slate-800 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <code className="text-lg font-bold font-mono text-gray-500 dark:text-gray-400">
                        {code.code}
                      </code>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          <XCircle className="h-3 w-3 mr-1" />
                          {t("accounts.loginManagement.inactive")}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950/40"
                          onClick={() => reactivateCodeMutation.mutate(code.id)}
                          disabled={reactivateCodeMutation.isPending}
                          title={t("accounts.loginManagement.reactivate")}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t("accounts.loginManagement.reactivate")}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {code.accountName || t("accounts.loginManagement.unknownUser")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {code.currentUses}/{code.maxUses || "∞"} {t("accounts.loginManagement.uses")}
                      </span>
                      {code.expiresAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t("accounts.loginManagement.expired", { date: format(new Date(code.expiresAt), "MMM d, yyyy") })}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <UserCircle className="h-3 w-3" />
                        {t("accounts.loginManagement.createdByLabel", { name: code.createdByName || t("accounts.loginManagement.unknownUser") })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(code.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    
                    {code.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">
                        {code.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
      
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-2xl">{t("accounts.loginManagement.blockedDomainsTitle")}</CardTitle>
          </div>
          <CardDescription>
            {t("accounts.loginManagement.blockedDomainsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com", "aol.com",
              "protonmail.com", "mailinator.com", "10minutemail.com", "guerrillamail.com", 
              "temp-mail.org", "yopmail.com"
            ].map((domain) => (
              <Badge key={domain} variant="outline" className="text-red-600 border-red-200 dark:border-red-900">
                <XCircle className="h-3 w-3 mr-1" />
                {domain}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Create User Dialog triggered from header */}
      <CreateUserDialog
        isOpen={isCreateUserDialogOpen}
        onClose={() => setIsCreateUserDialogOpen(false)}
      />
      
      {/* Create Account Dialog triggered from header */}
      <CreateCustomerDialog
        isOpen={isCreateCustomerDialogOpen}
        onClose={() => setIsCreateCustomerDialogOpen(false)}
        onCustomerCreated={() => {
          setIsCreateCustomerDialogOpen(false);
        }}
      />
    </div>
  );
}
