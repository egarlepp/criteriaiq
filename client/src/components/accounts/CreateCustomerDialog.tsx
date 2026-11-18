import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Building2, X, CloudCog, Users, Package, KeyRound, Globe, MapPin, Compass, SquarePen, CheckCircle2, XCircle, Swords, Plus, Trash2, ShieldCheck, Info, ImageOff } from "lucide-react";
import CreateUserDialog from "./CreateUserDialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { isHubspotUrl } from "@shared/crm-record-id";
import { CrmAccountLinkFields, crmLinkErrorMessage } from "./CrmAccountLinkFields";
import { CrmLinkPreviewPanel, CrmLinkedAccountStatus, CrmManagedBadge } from "./CrmLinkedAccountStatus";
import { CrmMatchSuggestions } from "./CrmMatchSuggestions";
import { CrmContactsPanel } from "./CrmContactsPanel";
import { useAccountCrmSync, type CrmAccountValues, type CrmFieldChange, type CrmManagedField } from "./use-account-crm-sync";

interface CreateCustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated?: (accountName?: string) => void;
  editingCustomer?: any;
  /**
   * A CRM link to fill when the dialog opens: Create Project's CRM picker
   * passes the picked account, so a new account (or the existing one being
   * linked) takes its fields from the CRM.
   */
  initialCrmUrl?: string;
}

const regions = [
  "North America",
  "South America",
  "Europe",
  "Asia Pacific",
  "Middle East & Africa",
  "Global"
];

const regionIconMap: Record<string, any> = {
  "North America": MapPin,
  "South America": MapPin,
  "Europe": MapPin,
  "Asia Pacific": MapPin,
  "Middle East & Africa": Compass,
  "Global": Globe
};

const stakeholderTypes = ["Technical Champion", "Business Champion", "Economic Buyer", "Project Admin", "IT Admin", "IT Leader", "Non-IT", "C-Level", "Leadership", "All", "None"];

export default function CreateCustomerDialog({
  isOpen,
  onClose,
  onCustomerCreated,
  editingCustomer = null,
  initialCrmUrl
}: CreateCustomerDialogProps) {
  const { t } = useTranslation();
  // Approved domains decide which sign-ups land in an account, so only
  // Account Management editors can set them (the server refuses others).
  const canSetDomains = usePermissions().canEdit("project.customers");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  // A new account, or one that is linked now, can't be saved without a CRM
  // link unless an Admin approves the exception. Accounts saved unlinked
  // before that rule stay editable.
  const crmLinkRequired = !editingCustomer || !!(editingCustomer.salesforceAccountUrl ?? "").trim();
  // A saved logo whose file no longer loads shows a placeholder instead of a broken image.
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  // With no CRM, accounts live in CriteriaIQ only: no link section, no link required.
  const { provider: installCrm, ready: crmReady } = useCrmProvider();
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [editingContactUser, setEditingContactUser] = useState<any>(null);

  const [openSections, setOpenSections] = useState({
    accountInfo: true,
    salesforce: true,
    teamAssignment: false,
    solutionInterests: false,
    competitors: false,
    accountAccess: false,
  });

  const [connectedCompetitors, setConnectedCompetitors] = useState<Array<{
    spaceId: number;
    competitorId: number;
    spaceName: string;
    spaceColor: string;
    competitorName: string;
    relationship: string;
  }>>([]);
  const [pickerSpaceId, setPickerSpaceId] = useState<string>("");
  const [pickerCompetitorId, setPickerCompetitorId] = useState<string>("");
  const [pickerRelationship, setPickerRelationship] = useState<string>("");

  const [formData, setFormData] = useState({
    accountName: "",
    abbreviation: "",
    industryId: "",
    region: "",
    salesforceAccountUrl: "",
    crmLinkExceptionReason: "",
    accountRepresentativeId: null as string | null,
    accountEngineerId: null as string | null,
    // "None" is the default sentinel — an account always carries at least one
    // solution-interest entry, and "None" means "no specific solution yet".
    productInterests: ["None"] as string[],
    contactUsers: [] as Array<{
      userId: string;
      stakeholderTypes: string[];
    }>,
    logoFile: null as File | null,
    logoPreview: "",
    isActive: true,
    isPartner: false,
    isInternal: false,
    approvedEmailDomains: [] as string[]
  });
  const [domainInput, setDomainInput] = useState("");

  // A linked account's name, industry, region and owner come from the CRM:
  // they fill from a picked CRM account and are read-only while linked.
  const applyCrmValues = (values: CrmAccountValues) =>
    setFormData((prev) => ({
      ...prev,
      ...(values.accountName !== undefined ? { accountName: values.accountName } : {}),
      ...(values.industryId !== undefined ? { industryId: String(values.industryId) } : {}),
      ...(values.region !== undefined ? { region: values.region } : {}),
      ...(values.accountRepresentativeId !== undefined ? { accountRepresentativeId: values.accountRepresentativeId } : {}),
    }));
  const crmSync = useAccountCrmSync({
    editingCustomer,
    installCrm,
    url: formData.salesforceAccountUrl,
    onApply: applyCrmValues,
  });
  const crmLocked = (field: CrmManagedField) => installCrm !== "none" && crmSync.lockedFields.has(field);
  const crmBadge = (field: CrmManagedField) =>
    crmLocked(field) && installCrm !== "none" ? <CrmManagedBadge provider={installCrm} /> : null;

  // A new preview (upload, removal, another account) gets a fresh load attempt.
  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [formData.logoPreview]);

  useEffect(() => {
    if (editingCustomer) {
      const newFormData = {
        accountName: editingCustomer.accountName || "",
        abbreviation: editingCustomer.abbreviation || "",
        industryId: editingCustomer.industryId?.toString() || "",
        region: editingCustomer.region || "",
        salesforceAccountUrl: editingCustomer.salesforceAccountUrl || "",
        crmLinkExceptionReason: "",
        accountRepresentativeId: editingCustomer.accountRepresentativeId || null,
        accountEngineerId: editingCustomer.accountEngineerId || null,
        productInterests: Array.isArray(editingCustomer.productInterests) && editingCustomer.productInterests.length > 0 ? editingCustomer.productInterests : ["None"],
        contactUsers: Array.isArray(editingCustomer.contactUsers) ? editingCustomer.contactUsers : [],
        logoFile: null,
        logoPreview: editingCustomer.logoUrl || "",
        isActive: editingCustomer.isActive !== false,
        isPartner: editingCustomer.isPartner || false,
        isInternal: editingCustomer.isInternal || false,
        // Read straight off the account record (authoritative column) — no separate fetch.
        approvedEmailDomains: Array.isArray(editingCustomer.approvedEmailDomains) ? editingCustomer.approvedEmailDomains : []
      };
      setFormData(newFormData);
      fetch(`/api/customers/${editingCustomer.id}/competitors`)
        .then((r) => r.json())
        .then((rows: any[]) => {
          if (Array.isArray(rows)) {
            setConnectedCompetitors(rows.map((r) => ({
              spaceId: r.spaceId,
              competitorId: r.competitorId,
              spaceName: r.spaceName || "",
              spaceColor: r.spaceColor || "#64748b",
              competitorName: r.competitorName || "",
              relationship: r.relationship || "",
            })));
          }
        })
        .catch(() => {});
    } else {
      setFormData({
        accountName: "",
        abbreviation: "",
        industryId: "",
        region: "",
        salesforceAccountUrl: "",
        crmLinkExceptionReason: "",
        accountRepresentativeId: null,
        accountEngineerId: null,
        productInterests: ["None"],
        contactUsers: [],
        logoFile: null,
        logoPreview: "",
        isActive: true,
        isPartner: false,
        isInternal: false,
        approvedEmailDomains: []
      });
      setConnectedCompetitors([]);
    }
    setDomainInput("");
    setPickerSpaceId("");
    setPickerCompetitorId("");
    setPickerRelationship("");
  }, [editingCustomer]);

  // Runs after the reset above, so the picked CRM link survives it.
  useEffect(() => {
    if (isOpen && initialCrmUrl) {
      setFormData((prev: any) => ({ ...prev, salesforceAccountUrl: initialCrmUrl }));
    }
  }, [isOpen, initialCrmUrl, editingCustomer]);

  const { data: industries = [] } = useQuery({
    queryKey: ["/api/industries"],
    staleTime: 0,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", { showInactive: false }],
    queryFn: async () => {
      const allProducts = await apiRequest("GET", "/api/products");
      return Array.isArray(allProducts) ? allProducts.filter((product: any) => product.isActive === true) : [];
    },
    staleTime: 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    staleTime: 0,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers"],
    staleTime: 0,
  });

  const { data: techSpaces = [] } = useQuery<any[]>({
    queryKey: ["/api/technology-spaces"],
    queryFn: () => fetch("/api/technology-spaces").then((r) => r.json()),
    staleTime: 0,
  });

  const { data: allCompetitors = [] } = useQuery<any[]>({
    queryKey: ["/api/competitors"],
    queryFn: () => fetch("/api/competitors").then((r) => r.json()),
    staleTime: 0,
  });

  const assignedUserIds = Array.isArray(customers)
    ? customers
        .filter((customer: any) => editingCustomer ? customer.id !== editingCustomer.id : true)
        .flatMap((customer: any) => customer.contactUsers || [])
        .map((cu: any) => cu.userId)
    : [];

  const activeContactUsers = Array.isArray(users)
    ? users.filter((user: any) =>
        user.isActive === true &&
        (user.role === "Customer" || user.role === "Guest") &&
        !assignedUserIds.includes(user.id)
      )
    : [];

  // Sales reps, plus whoever already holds the account (a CRM owner may have another role).
  const salesUsers = Array.isArray(users)
    ? users.filter((user: any) => user.isActive === true && (user.role === 'Sales' || user.id === formData.accountRepresentativeId))
    : [];

  const engineerUsers = Array.isArray(users)
    ? users.filter((user: any) => user.isActive === true && user.role === 'Engineer')
    : [];

  // A CRM preview row in words: industry and owner ids become names.
  const describeCrmChange = (change: CrmFieldChange, side: "from" | "to"): string => {
    const value = change[side];
    if (value === null || value === "") return "—";
    if (change.field === "industryId") {
      const industry = Array.isArray(industries) ? industries.find((i: any) => i.id === Number(value)) : null;
      return industry?.name ?? String(value);
    }
    if (change.field === "accountRepresentativeId") {
      const person = Array.isArray(users) ? users.find((u: any) => u.id === value) : null;
      return person ? (person.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : person.email) : String(value);
    }
    if (change.field === "region") {
      return t(`accounts.createCustomer.regions.${String(value).replace(/ & /g, "And").replace(/ /g, "")}`);
    }
    return String(value);
  };

  const createCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      const formDataToSend = new FormData();
      formDataToSend.append('accountName', data.accountName);
      formDataToSend.append('abbreviation', data.abbreviation || '');
      formDataToSend.append('industryId', data.industryId ? data.industryId.toString() : '');
      formDataToSend.append('region', data.region);
      formDataToSend.append('salesforceAccountUrl', data.salesforceAccountUrl);
      formDataToSend.append('crmLinkExceptionReason', data.crmLinkExceptionReason || '');
      formDataToSend.append('accountRepresentativeId', data.accountRepresentativeId || '');
      formDataToSend.append('accountEngineerId', data.accountEngineerId || '');
      formDataToSend.append('productInterests', JSON.stringify(data.productInterests));
      formDataToSend.append('contactUsers', JSON.stringify(data.contactUsers));
      formDataToSend.append('isActive', data.isActive.toString());
      formDataToSend.append('isPartner', data.isPartner.toString());
      formDataToSend.append('isInternal', data.isInternal.toString());
      formDataToSend.append('approvedEmailDomains', JSON.stringify(data.approvedEmailDomains || []));

      if (data.logoFile) {
        formDataToSend.append('logo', data.logoFile);
      }

      const response = await fetch('/api/customers', {
        method: 'POST',
        body: formDataToSend,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(crmLinkErrorMessage(t, errorData) || errorData.details || errorData.message || 'Failed to create account');
      }

      const customer = await response.json();

      await fetch(`/api/customers/${customer.id}/competitors/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectedCompetitors: data.connectedCompetitors || [] }),
      });

      return customer;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      // Approved domains are mirrored to allowed_domains — refresh the Login Management view.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allowed-domains"] });
      onClose();
      toast({
        title: t("common.success"),
        description: t("accounts.createCustomer.toasts.createSuccess"),
        variant: "success",
        icon: CheckCircle2,
      });
      if (onCustomerCreated) {
        onCustomerCreated(data?.accountName || formData.accountName);
      }
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.createCustomer.toasts.createError"),
        variant: "error",
        icon: XCircle,
      });
    },
  });

  const editCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!editingCustomer) throw new Error("No account selected for editing");

      const formDataToSend = new FormData();
      formDataToSend.append('accountName', data.accountName);
      formDataToSend.append('abbreviation', data.abbreviation || '');
      formDataToSend.append('industryId', data.industryId ? data.industryId.toString() : '');
      formDataToSend.append('region', data.region);
      formDataToSend.append('salesforceAccountUrl', data.salesforceAccountUrl);
      formDataToSend.append('crmLinkExceptionReason', data.crmLinkExceptionReason || '');
      formDataToSend.append('accountRepresentativeId', data.accountRepresentativeId || '');
      formDataToSend.append('accountEngineerId', data.accountEngineerId || '');
      formDataToSend.append('productInterests', JSON.stringify(data.productInterests));
      formDataToSend.append('contactUsers', JSON.stringify(data.contactUsers));
      formDataToSend.append('isActive', data.isActive.toString());
      formDataToSend.append('isPartner', data.isPartner.toString());
      formDataToSend.append('isInternal', data.isInternal.toString());
      formDataToSend.append('approvedEmailDomains', JSON.stringify(data.approvedEmailDomains || []));

      if (data.logoFile) {
        formDataToSend.append('logo', data.logoFile);
      } else if (!data.logoPreview && editingCustomer.logoUrl) {
        // "Remove Logo" with no replacement clears the saved logo.
        formDataToSend.append('removeLogo', 'true');
      }

      const response = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        body: formDataToSend,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(crmLinkErrorMessage(t, errorData) || errorData.details || errorData.message || 'Failed to update account');
      }

      const updatedData = await response.json();

      await fetch(`/api/customers/${editingCustomer.id}/competitors/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectedCompetitors: data.connectedCompetitors || [] }),
      });

      return updatedData;
    },
    onSuccess: (updatedCustomer: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      // Approved domains are mirrored to allowed_domains — refresh the Login Management view.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allowed-domains"] });
      onClose();
      toast({
        title: t("common.success"),
        description: t("accounts.createCustomer.toasts.updateSuccess"),
        variant: "success",
        icon: CheckCircle2,
      });
      if (onCustomerCreated) {
        // A link made here renames the account to the CRM's name.
        onCustomerCreated(updatedCustomer?.accountName);
      }
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("accounts.createCustomer.toasts.updateError"),
        variant: "error",
        icon: XCircle,
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.accountName.trim()) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.accountNameRequired"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    // Commit any domain still sitting in the input box — users often type a
    // domain and click Save without pressing Enter, which previously dropped it.
    const pendingDomain = domainInput.toLowerCase().trim().replace(/^@/, "");
    const pendingValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(pendingDomain);
    const effectiveDomains = !canSetDomains
      ? formData.approvedEmailDomains
      : pendingValid && !formData.approvedEmailDomains.includes(pendingDomain)
      ? [...formData.approvedEmailDomains, pendingDomain]
      : formData.approvedEmailDomains;

    // Internal (login-only) accounts require nothing beyond the account name —
    // all other sections are ignored. Skip the customer-account validations.
    if (formData.isInternal) {
      if (editingCustomer) {
        editCustomerMutation.mutate({ ...formData, approvedEmailDomains: effectiveDomains, connectedCompetitors });
      } else {
        createCustomerMutation.mutate({ ...formData, approvedEmailDomains: effectiveDomains, connectedCompetitors });
      }
      return;
    }

    if (!formData.industryId) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.industryRequired"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    if (!formData.region) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.regionRequired"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    if (installCrm !== "none") {
      const url = formData.salesforceAccountUrl.trim();
      // No link: allowed only as an Admin exception with a reason, or for an
      // account saved unlinked before the rule (it stays editable).
      if (!url && crmLinkRequired && !(isAdmin && formData.crmLinkExceptionReason.trim())) {
        toast({
          title: t("common.error"),
          description: isAdmin
            ? t("accounts.createCustomer.crm.exceptionReasonRequired")
            : installCrm === "hubspot"
            ? t("accounts.createCustomer.crm.hubspotUrlRequired")
            : t("accounts.createCustomer.validation.salesforceUrlRequired"),
          variant: "error",
          icon: XCircle,
        });
        return;
      }
      // One CRM per install; the server refuses the other CRM's link too.
      const unchanged = url === (editingCustomer?.salesforceAccountUrl ?? "").trim();
      if (!unchanged && (installCrm === "hubspot") !== isHubspotUrl(url)) {
        toast({
          title: t("common.error"),
          description: installCrm === "hubspot"
            ? t("accounts.createCustomer.crm.wrongCrmHubspot")
            : t("accounts.createCustomer.crm.wrongCrmSalesforce"),
          variant: "error",
          icon: XCircle,
        });
        return;
      }
    }

    if (!formData.accountRepresentativeId) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.accountRepRequired"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    if (!formData.accountEngineerId) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.accountEngineerRequired"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    if (formData.productInterests.length === 0) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.solutionInterestRequired"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    // NOTE: contact users (Account Access) are intentionally not required to
    // create or update an account. Accounts are created before non-admin users
    // exist to assign; contact users are added later via User Management or by
    // the user adding the account to themselves. (Server mirrors this — the
    // POST /api/customers contact-user check was removed too.)

    if (editingCustomer) {
      editCustomerMutation.mutate({ ...formData, approvedEmailDomains: effectiveDomains, connectedCompetitors });
    } else {
      createCustomerMutation.mutate({ ...formData, approvedEmailDomains: effectiveDomains, connectedCompetitors });
    }
  };

  const handleProductInterestChange = (productName: string, checked: boolean) => {
    if (checked) {
      // Selecting a real solution clears the "None" sentinel.
      setFormData({
        ...formData,
        productInterests: [
          ...formData.productInterests.filter(item => item !== "None" && item !== productName),
          productName,
        ],
      });
    } else {
      // Deselecting the last solution restores "None" so the field is never
      // empty (and the required-validation always has something to accept).
      const next = formData.productInterests.filter(item => item !== productName);
      setFormData({
        ...formData,
        productInterests: next.length === 0 ? ["None"] : next,
      });
    }
  };

  const handleNoneInterestChange = (checked: boolean) => {
    // "None" is mutually exclusive with real solutions; checking it clears the
    // rest. It can't be unchecked directly — picking a real solution is how you
    // leave the "None" state (handled in handleProductInterestChange).
    if (checked) {
      setFormData({ ...formData, productInterests: ["None"] });
    }
  };

  const handleAddContactUser = (userId: string) => {
    const existingUser = formData.contactUsers.find(cu => cu.userId === userId);
    if (!existingUser) {
      const user = Array.isArray(users) ? users.find((u: any) => u.id === userId) : null;
      const userStakeholderTypes = user?.stakeholderTypes || [];

      setFormData({
        ...formData,
        contactUsers: [
          ...formData.contactUsers,
          { userId, stakeholderTypes: userStakeholderTypes }
        ]
      });
    }
  };

  const handleRemoveContactUser = (index: number) => {
    const newContactUsers = formData.contactUsers.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      contactUsers: newContactUsers
    });
  };

  const handleStakeholderTypeChange = (userIndex: number, stakeholderType: string, checked: boolean) => {
    const newContactUsers = [...formData.contactUsers];
    if (checked) {
      newContactUsers[userIndex].stakeholderTypes.push(stakeholderType);
    } else {
      newContactUsers[userIndex].stakeholderTypes =
        newContactUsers[userIndex].stakeholderTypes.filter(t => t !== stakeholderType);
    }
    setFormData({
      ...formData,
      contactUsers: newContactUsers
    });
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.logoSizeError"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    // Allow-list must match the server (server/lib/upload-config.ts
    // LOGO_ALLOWED_MIMES). SVG passes through the server-side
    // sanitizer before storage — see server/lib/svg-sanitizer.ts.
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast({
        title: t("common.error"),
        description: t("accounts.createCustomer.validation.logoTypeError"),
        variant: "error",
        icon: XCircle,
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setFormData({
      ...formData,
      logoFile: file,
      logoPreview: previewUrl
    });
  };

  const handleRemoveLogo = () => {
    if (formData.logoPreview && formData.logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(formData.logoPreview);
    }
    setFormData({
      ...formData,
      logoFile: null,
      logoPreview: ""
    });
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  function handleAddCompetitor() {
    if (!pickerSpaceId || !pickerCompetitorId || !pickerRelationship) return;
    const alreadyAdded = connectedCompetitors.some(
      (c) => c.competitorId === parseInt(pickerCompetitorId)
    );
    if (alreadyAdded) return;
    const space = techSpaces.find((s: any) => s.id.toString() === pickerSpaceId);
    const comp = allCompetitors.find((c: any) => c.id.toString() === pickerCompetitorId);
    if (!space || !comp) return;
    setConnectedCompetitors((prev) => [
      ...prev,
      {
        spaceId: parseInt(pickerSpaceId),
        competitorId: parseInt(pickerCompetitorId),
        spaceName: space.name,
        spaceColor: space.color || "#64748b",
        competitorName: comp.name,
        relationship: pickerRelationship,
      },
    ]);
    setPickerCompetitorId("");
    setPickerRelationship("");
  }

  function handleRemoveCompetitor(competitorId: number) {
    setConnectedCompetitors((prev) => prev.filter((c) => c.competitorId !== competitorId));
  }

  const competitorsInSelectedSpace = pickerSpaceId
    ? allCompetitors.filter((c: any) =>
        c.spaces?.some((s: any) => s.spaceId?.toString() === pickerSpaceId || s.id?.toString() === pickerSpaceId)
      )
    : [];

  function hexWithAlpha(hex: string, alpha: number): string {
    const h = (hex ?? "#64748b").replace("#", "");
    const r = parseInt(h.substring(0, 2), 16) || 100;
    const g = parseInt(h.substring(2, 4), 16) || 116;
    const b = parseInt(h.substring(4, 6), 16) || 139;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  const SectionHeader = ({
    title,
    isOpen,
    icon: Icon,
    bgColor = "bg-gray-50 dark:bg-slate-800",
    iconColor = "text-gray-600 dark:text-gray-300"
  }: {
    title: string;
    isOpen: boolean;
    icon: React.ElementType;
    bgColor?: string;
    iconColor?: string;
  }) => (
    <CollapsibleTrigger asChild>
      <div
        className={`flex items-center gap-2 ${bgColor} py-3 px-4 cursor-pointer rounded-t-lg border-b dark:border-slate-700`}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        )}
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="font-medium text-gray-900 dark:text-gray-100">{title}</span>
      </div>
    </CollapsibleTrigger>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="create-account-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {editingCustomer ? t("accounts.createCustomer.editTitle") : t("accounts.createCustomer.title")}
            </DialogTitle>
            <div id="create-account-description" className="sr-only">
              {t("accounts.createCustomer.dialogDescription")}
            </div>
          </DialogHeader>

          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            <span className="text-red-500 dark:text-red-400">*</span>{" "}
            {t("accounts.createCustomer.requiredFieldsNote")}
          </p>

          <div className="space-y-4">
            {/* Section 1: Account Information */}
            <Collapsible open={openSections.accountInfo} onOpenChange={() => toggleSection('accountInfo')}>
              <div className="rounded-lg border">
                <SectionHeader
                  title={t("accounts.createCustomer.sections.accountInfo")}
                  isOpen={openSections.accountInfo}
                  icon={Building2}
                  bgColor="bg-blue-50 dark:bg-blue-950/40"
                  iconColor="text-blue-600 dark:text-blue-400"
                />
                <CollapsibleContent>
                  <div className="p-4 space-y-4 bg-blue-50/30">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <Label htmlFor="accountName" className="flex items-center">
                          {t("accounts.createCustomer.fields.accountNameLabel")}
                          {crmBadge("accountName")}
                        </Label>
                        <Input
                          id="accountName"
                          disabled={crmLocked("accountName")}
                          value={formData.accountName}
                          onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                          placeholder={t("accounts.createCustomer.fields.accountNamePlaceholder")}
                        />
                      </div>
                      <div>
                        <Label htmlFor="abbreviation">{t("accounts.createCustomer.fields.abbreviationLabel")}</Label>
                        <Input
                          id="abbreviation"
                          value={formData.abbreviation}
                          onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value.toUpperCase() })}
                          placeholder={t("accounts.createCustomer.fields.abbreviationPlaceholder")}
                          maxLength={20}
                          className="uppercase"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="industry" className="flex items-center">
                          {t("accounts.createCustomer.fields.industryLabel")}
                          {crmBadge("industryId")}
                        </Label>
                        <Select
                          disabled={crmLocked("industryId")}
                          value={formData.industryId}
                          onValueChange={(value) => setFormData({
                            ...formData,
                            industryId: value
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("accounts.createCustomer.fields.industryPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.isArray(industries) && industries.map((industry: any) => (
                              <SelectItem key={industry.id} value={industry.id.toString()}>
                                <div className="flex items-center gap-2">
                                  {industry.icon && <DynamicIcon name={industry.icon} className="h-4 w-4" />}
                                  <span>{industry.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="region" className="flex items-center">
                          {t("accounts.createCustomer.fields.regionLabel")}
                          {crmBadge("region")}
                        </Label>
                        <Select
                          disabled={crmLocked("region")}
                          value={formData.region}
                          onValueChange={(value) => setFormData({ ...formData, region: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("accounts.createCustomer.fields.regionPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {regions.map((region) => {
                              const IconComponent = regionIconMap[region];
                              return (
                                <SelectItem key={region} value={region}>
                                  <div className="flex items-center gap-2">
                                    {IconComponent && <IconComponent className="h-4 w-4 text-blue-600" />}
                                    {t(`accounts.createCustomer.regions.${region.replace(/ & /g, "And").replace(/ /g, "")}`)}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="isPartner"
                          checked={formData.isPartner}
                          onCheckedChange={(checked) => setFormData({ ...formData, isPartner: checked as boolean })}
                        />
                        <Label htmlFor="isPartner" className="text-sm font-medium">
                          {t("accounts.createCustomer.fields.partnerLabel")}
                        </Label>
                      </div>

                      <TooltipProvider delayDuration={150}>
                        <div className={cn("flex items-center space-x-2", !isAdmin && "opacity-50 cursor-not-allowed")}>
                          <Checkbox
                            id="isInternal"
                            checked={formData.isInternal}
                            disabled={!isAdmin}
                            onCheckedChange={(checked) => setFormData({ ...formData, isInternal: checked as boolean })}
                          />
                          <Label
                            htmlFor="isInternal"
                            className={cn("text-sm font-medium flex items-center gap-1", !isAdmin && "cursor-not-allowed")}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                            {t("accounts.createCustomer.fields.internalLabel")}
                          </Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-gray-400 dark:text-gray-500">
                                <Info className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                {isAdmin
                                  ? t("accounts.createCustomer.fields.internalTooltip")
                                  : t("accounts.createCustomer.fields.internalTooltipAdminOnly")}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </div>

                    {canSetDomains && (isAdmin || editingCustomer?.isInternal !== true) && (
                    <div>
                      <Label htmlFor="approvedDomains">{t("accounts.createCustomer.fields.approvedDomainsLabel")}</Label>
                      {formData.approvedEmailDomains.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 mb-2">
                          {formData.approvedEmailDomains.map((domain) => (
                            <span key={domain} className="flex items-center gap-1 bg-secondary rounded-full px-3 py-1 text-sm">
                              {domain}
                              <button
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, approvedEmailDomains: prev.approvedEmailDomains.filter((d) => d !== domain) }))}
                                className="ml-1 hover:bg-black/20 dark:hover:bg-white/20 rounded"
                                aria-label={`Remove ${domain}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <Input
                        id="approvedDomains"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            const d = domainInput.toLowerCase().trim().replace(/^@/, "");
                            const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d);
                            if (valid && !formData.approvedEmailDomains.includes(d)) {
                              setFormData((prev) => ({ ...prev, approvedEmailDomains: [...prev.approvedEmailDomains, d] }));
                              setDomainInput("");
                            }
                          }
                        }}
                        placeholder={t("accounts.createCustomer.fields.approvedDomainsPlaceholder")}
                      />
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t("accounts.createCustomer.fields.approvedDomainsHint")}
                      </div>
                    </div>
                    )}

                    <div>
                      <Label htmlFor="logo">{t("accounts.createCustomer.fields.logoLabel")}</Label>
                      <div className="space-y-3">
                        <Input
                          id="logo"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="cursor-pointer"
                        />
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {t("accounts.createCustomer.fields.logoHint")}
                        </div>
                        {formData.logoPreview && (
                          <div className="flex items-center space-x-3">
                            {logoPreviewFailed ? (
                              <div
                                className="w-20 h-20 flex flex-col items-center justify-center gap-1 border rounded bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-gray-500 text-center px-1"
                                title={t("accounts.createCustomer.fields.logoUnavailableHint")}
                              >
                                <ImageOff className="h-5 w-5" />
                                <span className="text-[10px] leading-tight">{t("accounts.createCustomer.fields.logoUnavailable")}</span>
                              </div>
                            ) : (
                              <img
                                src={formData.logoPreview}
                                alt={t("accounts.createCustomer.fields.logoPreviewAlt")}
                                className="w-20 h-20 object-contain border rounded bg-white dark:bg-slate-900"
                                onError={() => setLogoPreviewFailed(true)}
                              />
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleRemoveLogo}
                            >
                              {t("accounts.createCustomer.fields.removeLogo")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Sections 2–6 do not apply to internal (login-only) accounts — grayed out + ignored when Internal is checked. */}
            <div
              className={cn("space-y-4", formData.isInternal && "opacity-50 pointer-events-none select-none")}
              aria-disabled={formData.isInternal}
            >
            {/* Section 2: CRM link (hidden when the install has no CRM) */}
            {crmReady && installCrm !== "none" ? (
            <Collapsible open={openSections.salesforce} onOpenChange={() => toggleSection('salesforce')}>
              <div className="rounded-lg border">
                <SectionHeader
                  title={installCrm === "hubspot" ? t("accounts.createCustomer.crm.sectionHubspot") : t("accounts.createCustomer.sections.salesforce")}
                  isOpen={openSections.salesforce}
                  icon={CloudCog}
                  bgColor="bg-orange-50 dark:bg-orange-950/40"
                  iconColor="text-orange-600 dark:text-orange-400"
                />
                <CollapsibleContent>
                  <div className="p-4 space-y-4 bg-orange-50/30 dark:bg-orange-950/10">
                    <CrmAccountLinkFields
                      provider={installCrm}
                      value={formData.salesforceAccountUrl}
                      onChange={(url) => setFormData((prev) => ({ ...prev, salesforceAccountUrl: url }))}
                      onPickName={(name) => setFormData((prev) => (prev.accountName.trim() ? prev : { ...prev, accountName: name }))}
                      locked={crmSync.linkUnchanged}
                      linkRequired={crmLinkRequired}
                      isAdmin={isAdmin}
                      exceptionReason={formData.crmLinkExceptionReason}
                      onExceptionReasonChange={(reason) => setFormData((prev) => ({ ...prev, crmLinkExceptionReason: reason }))}
                      approvedException={
                        editingCustomer?.crmLinkExceptionReason
                          ? { reason: editingCustomer.crmLinkExceptionReason, at: editingCustomer.crmLinkExceptionAt ?? null }
                          : null
                      }
                      accountName={formData.accountName}
                    >
                      {crmSync.linkUnchanged && crmSync.saved ? (
                        <CrmLinkedAccountStatus
                          provider={installCrm}
                          saved={crmSync.saved}
                          connected={crmSync.connected}
                          isAdmin={isAdmin}
                          refreshing={crmSync.refreshing}
                          onRefresh={() => void crmSync.refresh()}
                          onUnlink={() => setFormData((prev) => ({ ...prev, salesforceAccountUrl: "" }))}
                        />
                      ) : !formData.salesforceAccountUrl.trim() && typeof editingCustomer?.id === "number" ? (
                        <CrmMatchSuggestions
                          customerId={editingCustomer.id}
                          canEdit={canSetDomains}
                          onLink={(match) => setFormData((prev) => ({ ...prev, salesforceAccountUrl: match.url ?? "" }))}
                        />
                      ) : (
                        <CrmLinkPreviewPanel
                          provider={installCrm}
                          preview={crmSync.preview}
                          previewing={crmSync.previewing}
                          describe={describeCrmChange}
                        />
                      )}
                    </CrmAccountLinkFields>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
            ) : null}

            {/* Section 3: Team Assignment */}
            <Collapsible open={openSections.teamAssignment} onOpenChange={() => toggleSection('teamAssignment')}>
              <div className="rounded-lg border">
                <SectionHeader
                  title={t("accounts.createCustomer.sections.teamAssignment")}
                  isOpen={openSections.teamAssignment}
                  icon={Users}
                  bgColor="bg-green-50 dark:bg-green-950/40"
                  iconColor="text-green-600 dark:text-green-400"
                />
                <CollapsibleContent>
                  <div className="p-4 bg-green-50/30">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="accountRepresentative" className="flex items-center">
                          {t("accounts.createCustomer.fields.accountRepLabel")}
                          {crmBadge("accountRepresentativeId")}
                        </Label>
                        <Select
                          disabled={crmLocked("accountRepresentativeId")}
                          value={formData.accountRepresentativeId || undefined}
                          onValueChange={(value) => {
                            setFormData({ ...formData, accountRepresentativeId: value || null });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("accounts.createCustomer.fields.accountRepPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {salesUsers.map((user: any) => (
                              <SelectItem key={user.id} value={user.id}>
                                <div className={user.isApproved === false ? "text-red-600" : "text-black"}>
                                  {user.firstName && user.lastName
                                    ? `${user.firstName} ${user.lastName}`
                                    : user.email}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="accountEngineer">{t("accounts.createCustomer.fields.accountEngineerLabel")}</Label>
                        <Select
                          value={formData.accountEngineerId || undefined}
                          onValueChange={(value) => {
                            setFormData({ ...formData, accountEngineerId: value || null });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("accounts.createCustomer.fields.accountEngineerPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {engineerUsers.map((user: any) => (
                              <SelectItem key={user.id} value={user.id}>
                                <div className={user.isApproved === false ? "text-red-600" : "text-black"}>
                                  {user.firstName && user.lastName
                                    ? `${user.firstName} ${user.lastName}`
                                    : user.email}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Section 4: Solution Interests */}
            <Collapsible open={openSections.solutionInterests} onOpenChange={() => toggleSection('solutionInterests')}>
              <div className="rounded-lg border">
                <SectionHeader
                  title={t("accounts.createCustomer.sections.solutionInterests")}
                  isOpen={openSections.solutionInterests}
                  icon={Package}
                  bgColor="bg-purple-50 dark:bg-purple-950/40"
                  iconColor="text-purple-600 dark:text-purple-400"
                />
                <CollapsibleContent>
                  <div className="p-4 bg-purple-50/30">
                    <div className="grid grid-cols-3 gap-3">
                      {/* "None" — default; mutually exclusive with real solutions */}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="product-none"
                          checked={formData.productInterests.includes("None")}
                          onCheckedChange={(checked) => handleNoneInterestChange(checked as boolean)}
                        />
                        <Label htmlFor="product-none" className="text-sm text-gray-600 dark:text-gray-300">
                          {t("accounts.createCustomer.noneSolutionInterest")}
                        </Label>
                      </div>
                      {Array.isArray(products) && products.map((product: any) => (
                        <div key={product.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`product-${product.id}`}
                            checked={formData.productInterests.includes(product.name)}
                            onCheckedChange={(checked) => {
                              handleProductInterestChange(product.name, checked as boolean);
                            }}
                          />
                          <Label htmlFor={`product-${product.id}`} className="text-sm flex items-center gap-2">
                            {product.solutionIcon || product.solutionIconName ? (
<SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-4 h-4 object-contain" />
) : (
                              <Package className="h-4 w-4 text-purple-500" />
                            )}
                            {product.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Section 5: Connected Competitors */}
            <Collapsible open={openSections.competitors} onOpenChange={() => toggleSection('competitors')}>
              <div className="rounded-lg border">
                <SectionHeader
                  title={t("accounts.createCustomer.sections.competitors")}
                  isOpen={openSections.competitors}
                  icon={Swords}
                  bgColor="bg-red-50 dark:bg-red-950/40"
                  iconColor="text-red-600 dark:text-red-400"
                />
                <CollapsibleContent>
                  <div className="p-4 space-y-4 bg-red-50/30">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t("accounts.createCustomer.competitors.description")}
                    </p>

                    {/* Picker Row */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-600 dark:text-gray-300 mb-1 block">{t("accounts.createCustomer.competitors.technologySpaceLabel")}</Label>
                        <Select
                          value={pickerSpaceId}
                          onValueChange={(v) => {
                            setPickerSpaceId(v);
                            setPickerCompetitorId("");
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={t("accounts.createCustomer.competitors.selectSpacePlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {techSpaces.map((s: any) => {
                              const isHex = s.color && s.color.startsWith("#");
                              return (
                                <SelectItem key={s.id} value={s.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    {isHex && (
                                      <span
                                        className="inline-block w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: s.color }}
                                      />
                                    )}
                                    <span className="font-mono text-xs font-bold">{s.code}</span>
                                    <span>{s.name}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-1">
                        <Label className="text-xs text-gray-600 dark:text-gray-300 mb-1 block">{t("accounts.createCustomer.competitors.competitorLabel")}</Label>
                        <Select
                          value={pickerCompetitorId}
                          onValueChange={setPickerCompetitorId}
                          disabled={!pickerSpaceId}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={pickerSpaceId ? t("accounts.createCustomer.competitors.selectCompetitorPlaceholder") : t("accounts.createCustomer.competitors.chooseSpaceFirst")} />
                          </SelectTrigger>
                          <SelectContent>
                            {competitorsInSelectedSpace.length === 0 ? (
                              <div className="text-xs text-gray-400 dark:text-gray-500 italic p-2 text-center">
                                {t("accounts.createCustomer.competitors.noCompetitorsInSpace")}
                              </div>
                            ) : (
                              competitorsInSelectedSpace
                                .filter((c: any) => !connectedCompetitors.some((cc) => cc.competitorId === c.id))
                                .map((c: any) => (
                                  <SelectItem key={c.id} value={c.id.toString()}>
                                    {c.name}
                                  </SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-1">
                        <Label className="text-xs text-gray-600 dark:text-gray-300 mb-1 block">{t("accounts.createCustomer.competitors.relationshipLabel")}</Label>
                        <Select
                          value={pickerRelationship}
                          onValueChange={setPickerRelationship}
                          disabled={!pickerCompetitorId}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={pickerCompetitorId ? t("accounts.createCustomer.competitors.selectRelationshipPlaceholder") : t("accounts.createCustomer.competitors.chooseCompetitorFirst")} />
                          </SelectTrigger>
                          <SelectContent>
                            {(["Own", "Previously Owned", "Evaluating", "Previously Evaluated"] as const).map((r) => (
                              <SelectItem key={r} value={r}>
                                {t(`accounts.createCustomer.competitors.relationships.${r.replace(/ /g, "")}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={handleAddCompetitor}
                        disabled={!pickerSpaceId || !pickerCompetitorId || !pickerRelationship}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {t("common.add")}
                      </Button>
                    </div>

                    {/* Connected competitors list */}
                    {connectedCompetitors.length === 0 ? (
                      <div className="text-center text-sm text-gray-400 dark:text-gray-500 italic py-3">
                        {t("accounts.createCustomer.competitors.noCompetitorsConnected")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {connectedCompetitors.map((cc) => {
                          const isHex = cc.spaceColor && cc.spaceColor.startsWith("#");
                          const borderColor = isHex ? cc.spaceColor : "#64748b";
                          const bgColor = isHex ? hexWithAlpha(cc.spaceColor, 0.08) : "rgba(100,116,139,0.08)";
                          const textColor = isHex ? cc.spaceColor : "#475569";
                          return (
                            <div
                              key={cc.competitorId}
                              className="flex items-center justify-between rounded-lg border px-3 py-2"
                              style={{ borderColor, backgroundColor: bgColor }}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: textColor }} />
                                <span className="text-sm font-medium" style={{ color: textColor }}>
                                  {cc.competitorName}
                                </span>
                                <span
                                  className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                                  style={{
                                    backgroundColor: isHex ? hexWithAlpha(cc.spaceColor, 0.2) : "rgba(100,116,139,0.2)",
                                    color: textColor,
                                  }}
                                >
                                  {cc.spaceName}
                                </span>
                                {cc.relationship && (
                                  <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                    {cc.relationship}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCompetitor(cc.competitorId)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Section 6: Account Access */}
            <Collapsible open={openSections.accountAccess} onOpenChange={() => toggleSection('accountAccess')}>
              <div className="rounded-lg border">
                <SectionHeader
                  title={t("accounts.createCustomer.sections.accountAccess")}
                  isOpen={openSections.accountAccess}
                  icon={KeyRound}
                  bgColor="bg-amber-50 dark:bg-amber-950/40"
                  iconColor="text-amber-600 dark:text-amber-400"
                />
                <CollapsibleContent>
                  <div className="p-4 space-y-4 bg-amber-50/30 dark:bg-amber-950/10">
                    {/* A linked account's CRM contacts can be imported as Account Users. */}
                    {crmReady && installCrm !== "none" && crmSync.linkUnchanged && crmSync.connected && typeof editingCustomer?.id === "number" ? (
                      <CrmContactsPanel customerId={editingCustomer.id} provider={installCrm} />
                    ) : null}
                    <div>
                      <Select onValueChange={handleAddContactUser}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("accounts.createCustomer.access.addExistingUser")} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeContactUsers
                            .filter((user: any) =>
                              !formData.contactUsers.some(cu => cu.userId === user.id)
                            )
                            .map((user: any) => (
                              <SelectItem key={user.id} value={user.id}>
                                <div className={user.isApproved === false ? "text-red-600" : "text-black dark:text-white"}>
                                  {user.firstName} {user.lastName} ({user.email})
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.contactUsers.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("common.name")}</TableHead>
                            <TableHead>{t("accounts.createCustomer.access.tableTitle")}</TableHead>
                            <TableHead>{t("accounts.createCustomer.access.tableRegion")}</TableHead>
                            <TableHead className="w-24">{t("common.actions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.contactUsers.map((contactUser: any, index: number) => {
                            const user = Array.isArray(users) ? users.find((u: any) => u.id === contactUser.userId) : null;
                            return (
                              <TableRow key={index}>
                                <TableCell>
                                  <div className={`font-medium ${user?.isApproved === false ? "text-red-600" : ""}`}>
                                    {user?.firstName} {user?.lastName}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {user?.title || '-'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {user?.region || '-'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingContactUser(user);
                                        setIsEditUserDialogOpen(true);
                                      }}
                                      title={t("common.edit")}
                                    >
                                      <SquarePen className="h-4 w-4" />
                                    </Button>
                                    <DangerIconButton
                                      onClick={() => handleRemoveContactUser(index)}
                                      aria-label={t("accounts.createCustomer.access.removeFromAccount")}
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                        {t("accounts.createCustomer.access.noUsersSelected")}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
            </div>
            {/* End sections 2–6 wrapper */}

            {/* Account Active Status - Independent of sections */}
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                // Only an Admin can deactivate the internal account.
                disabled={!isAdmin && editingCustomer?.isInternal === true}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })}
              />
              <Label htmlFor="isActive" className="text-sm font-medium">
                {t("common.active")}
              </Label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
              >
                <X className="h-4 w-4 mr-2" />
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createCustomerMutation.isPending || editCustomerMutation.isPending}
              >
                <Building2 className="h-4 w-4 mr-2" />
                {createCustomerMutation.isPending || editCustomerMutation.isPending
                  ? t("common.saving")
                  : editingCustomer ? t("accounts.createCustomer.updateButton") : t("accounts.createCustomer.createButton")
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreateUserDialog
        isOpen={isEditUserDialogOpen}
        onClose={() => {
          setIsEditUserDialogOpen(false);
          setEditingContactUser(null);
        }}
        mode="edit"
        userData={editingContactUser}
      />
    </>
  );
}
