import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, useRef } from "react";
import { PROJECT_TYPES } from "@shared/project-types";
import { UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { FormData, type ConnectedCompetitorItem } from "./types";

export type { ConnectedCompetitorItem };
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelWithHelp } from "@/components/shared/contextual-help";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { getTagInfo, normalizeTagName } from "@/lib/tagUtils";
import { X, Hash, RefreshCw, Info, Building2, Lightbulb, Loader2, Swords, Plus } from "lucide-react";
import InfrastructureDiscoveryDrawer, { type AttachableInfrastructureProfile } from "@/components/accounts/InfrastructureDiscoveryDrawer";
import { InfrastructureDiscoveryButton } from "@/components/accounts/InfrastructureDiscoveryButton";
import { useCrmStatus } from "@/hooks/use-crm-status";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { validationRecordRequired } from "@shared/crm-provider";
import { apiRequest } from "@/lib/queryClient";
import { toSalesforceId18 } from "@shared/crm-record-id";
import { CrmRecordFields } from "./CrmRecordFields";
import { AccountCrmPicker } from "./AccountCrmPicker";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";

const STAKEHOLDER_TYPE_OPTIONS = ["Technical Champion", "Business Champion", "Economic Buyer", "Project Admin", "IT Admin", "IT Leader", "Non-IT", "C-Level", "Leadership"];
const RELATIONSHIP_OPTIONS = ["Own", "Previously Owned", "Evaluating", "Previously Evaluated"];

interface EssentialsSectionProps {
  form: UseFormReturn<FormData>;
  isEdit: boolean;
  customers: any[];
  industries: any[];
  products: any[];
  filteredSolutions: any[];
  selectedCustomer: any;
  industryComplianceRegulations: any[];
  allTags: any[];
  tagInput: string;
  setTagInput: (value: string) => void;
  suggestedTags: any[];
  suggestedTagsIndex: number;
  setSuggestedTagsIndex: (value: number) => void;
  handleAddTag: (tag: string) => void;
  handleRemoveTag: (tag: string) => void;
  updateSuggestedTags: () => void;
  onSolutionChange?: (solutions: string[]) => void;
  setIsCreateCustomerDialogOpen: (open: boolean) => void;
  /** Opens Create Account with this CRM link filled (Account Name in CRM mode). */
  onCreateAccountFromCrm?: (url: string) => void;
  /** Opens this account's dialog with the CRM link filled, so saving links it. */
  onLinkAccountToCrm?: (customerId: number, url: string) => void;
  projectId?: number;
  /** The Infrastructure Discovery profile attached to the project. */
  infrastructureProfileId?: number | null;
  onInfrastructureProfileChange?: (profile: AttachableInfrastructureProfile | null) => void;
  projectCompetingWith: ConnectedCompetitorItem[];
  setProjectCompetingWith: (items: ConnectedCompetitorItem[] | ((prev: ConnectedCompetitorItem[]) => ConnectedCompetitorItem[])) => void;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function EssentialsSection({
  form,
  isEdit,
  customers,
  industries,
  products,
  filteredSolutions,
  selectedCustomer,
  industryComplianceRegulations,
  allTags,
  tagInput,
  setTagInput,
  suggestedTags,
  suggestedTagsIndex,
  setSuggestedTagsIndex,
  handleAddTag,
  handleRemoveTag,
  updateSuggestedTags,
  onSolutionChange,
  setIsCreateCustomerDialogOpen,
  onCreateAccountFromCrm,
  onLinkAccountToCrm,
  projectId,
  projectCompetingWith,
  setProjectCompetingWith,
  infrastructureProfileId = null,
  onInfrastructureProfileChange,
}: EssentialsSectionProps) {
  const { provider: crmProvider, connected: sfConnected } = useCrmStatus();
  const { provider: installCrm, ready: installCrmReady } = useCrmProvider();
  // With the CRM set to None the validation record link is optional.
  const linkRequired = validationRecordRequired(installCrmReady ? installCrm : undefined);
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const recordName = useValidationRecordLabel();
  const [selectedSfOpportunityId, setSelectedSfOpportunityId] = useState<string | null>(null);
  const [infraDrawerOpen, setInfraDrawerOpen] = useState(false);
  // Track whether the customer logo URL 404s at render time. Some legacy
  // customer rows still point at storage paths that were swept during the
  // Internal-asset cleanup (and similar maintenance passes); without this
  // guard the form shows a broken-image placeholder rather than the
  // canonical "No logo available" empty state. Reset on every URL
  // change so a successful re-upload reactively shows the new logo.
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const customerLogoValue = form.watch("customerLogo");
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [customerLogoValue]);

  const customerName = (form.watch('customerName') as string) || '';

  // Account Name source: search the CRM, or pick a CriteriaIQ account. CRM
  // mode needs a CRM on the install and the user's own connection.
  const crmPickerAvailable = !isEdit && installCrmReady && installCrm !== "none" && crmProvider === installCrm && sfConnected;
  const [accountSource, setAccountSource] = useState<"crm" | "criteriaiq">("crm");
  const effectiveSource = crmPickerAvailable ? accountSource : "criteriaiq";
  // Once an account is chosen (from the CRM or a new one), show it in the list.
  useEffect(() => {
    if (customerName) setAccountSource("criteriaiq");
  }, [customerName]);

  // A linked account's Opportunities come by its CRM id; others by name.
  const linkedCrmAccountId: string | null =
    selectedCustomer?.crmProvider && selectedCustomer.crmProvider === crmProvider && selectedCustomer.crmAccountId
      ? String(selectedCustomer.crmAccountId)
      : null;

  const { data: opportunitiesData, isLoading: loadingOpportunities } = useQuery({
    queryKey: ['/api/crm/opportunities/by-account', crmProvider, linkedCrmAccountId ?? customerName],
    queryFn: async () => {
      // `apiRequest` already returns the parsed JSON body — calling
      // `.json()` again throws `TypeError: res.json is not a function`
      // and silently sends the query into its error branch (task #754).
      const query = linkedCrmAccountId
        ? `crmAccountId=${encodeURIComponent(linkedCrmAccountId)}`
        : `accountName=${encodeURIComponent(customerName)}`;
      return await apiRequest('GET', `/api/crm/opportunities/by-account?${query}`);
    },
    enabled: sfConnected && !!customerName,
    staleTime: 60000,
  });

  const { data: evaluationsData, isLoading: loadingEvaluations } = useQuery({
    queryKey: ['/api/crm/validation-records/by-opportunity', crmProvider, selectedSfOpportunityId],
    queryFn: async () => {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest('GET', `/api/crm/validation-records/by-opportunity?opportunityId=${encodeURIComponent(selectedSfOpportunityId!)}`);
    },
    enabled: sfConnected && !!selectedSfOpportunityId,
    staleTime: 30000,
  });

  const sfOpportunities: Array<{ id: string; name: string; accountId?: string | null }> = opportunitiesData?.opportunities || [];
  const sfEvaluations: Array<{ id: string; name: string; url?: string | null }> = evaluationsData?.records || [];

  const [compPickerSpaceId, setCompPickerSpaceId] = useState<string>("");
  const [compPickerCompetitorId, setCompPickerCompetitorId] = useState<string>("");
  const [compPickerRelationship, setCompPickerRelationship] = useState<string>("");

  const { data: techSpaces = [] } = useQuery<any[]>({
    queryKey: ["/api/technology-spaces"],
    staleTime: 60000,
  });

  const { data: allCompetitors = [] } = useQuery<any[]>({
    queryKey: ["/api/competitors"],
    staleTime: 60000,
  });

  const { data: accountCompetitors = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", selectedCustomer?.id, "competitors"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${selectedCustomer.id}/competitors`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!selectedCustomer?.id,
    staleTime: 30000,
  });

  const competitorsForSelectedSpace = compPickerSpaceId
    ? allCompetitors.filter((c: any) =>
        c.spaces?.some((s: any) => (s.spaceId || s.id)?.toString() === compPickerSpaceId)
      )
    : allCompetitors;

  function handleAddCompetingWith() {
    if (!compPickerSpaceId || !compPickerCompetitorId || !compPickerRelationship) return;
    const alreadyAdded = projectCompetingWith.some(
      (c) => c.competitorId === parseInt(compPickerCompetitorId) && c.spaceId === parseInt(compPickerSpaceId)
    );
    if (alreadyAdded) return;
    const space = techSpaces.find((s: any) => s.id.toString() === compPickerSpaceId);
    const comp = allCompetitors.find((c: any) => c.id.toString() === compPickerCompetitorId);
    if (!space || !comp) return;
    setProjectCompetingWith((prev: ConnectedCompetitorItem[]) => [
      ...prev,
      {
        spaceId: parseInt(compPickerSpaceId),
        competitorId: parseInt(compPickerCompetitorId),
        spaceName: space.name,
        spaceColor: space.color || "#64748b",
        competitorName: comp.name,
        relationship: compPickerRelationship,
      },
    ]);
    setCompPickerCompetitorId("");
    setCompPickerRelationship("");
  }

  function handleRemoveCompetingWith(competitorId: number, spaceId: number) {
    setProjectCompetingWith((prev: ConnectedCompetitorItem[]) => prev.filter((c) => !(c.competitorId === competitorId && c.spaceId === spaceId)));
  }

  // The Opportunity, its record link and its CRM ids belong to the account,
  // so clear them when the account changes. Only on a real change: mounting
  // the form, or loading an existing project (first non-empty name), must
  // not wipe the saved values.
  const previousCustomerName = useRef(customerName);
  useEffect(() => {
    const previous = previousCustomerName.current;
    previousCustomerName.current = customerName;
    if (!previous || previous === customerName) return;
    setSelectedSfOpportunityId(null);
    form.setValue('opportunityName', '' as any);
    form.setValue('salesforceEvaluationLink', '' as any);
    form.setValue('crmProvider', '' as any);
    form.setValue('crmOpportunityId', '' as any);
    form.setValue('crmAccountId', '' as any);
    // A profile belongs to one account; a new account starts with none.
    form.setValue('infrastructureProfileId', null);
  }, [customerName]);

  function selectCustomer(value: string) {
    form.setValue("customerName", value, { shouldValidate: true });
    const selectedCustomer = customers.find((c: any) => c.accountName === value);
    if (selectedCustomer) {
      if (selectedCustomer.logoUrl) {
        form.setValue("customerLogo", selectedCustomer.logoUrl);
      } else {
        form.setValue("customerLogo", null);
      }
      if (selectedCustomer.industryId) {
        const industry = industries.find((ind: any) => ind.id === selectedCustomer.industryId);
        if (industry) {
          form.setValue("industry", industry.name);
        }
      } else {
        form.setValue("industry", "");
      }
    } else {
      form.setValue("customerLogo", null);
      form.setValue("industry", "");
    }
  }

  const crmName = installCrm === "hubspot" ? "HubSpot" : "Salesforce";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <FormField
          control={form.control}
          name="customerName"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <div className="flex h-5 items-center justify-between gap-2">
                <FormLabel className="dark:text-slate-200 h-5 flex items-center">Account Name <span className="text-red-500 ml-0.5">*</span></FormLabel>
                {crmPickerAvailable ? (
                  <div
                    role="radiogroup"
                    aria-label={t("projects.form.accountPicker.sourceLabel")}
                    className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs dark:border-slate-700"
                  >
                    {(["crm", "criteriaiq"] as const).map((source) => (
                      <button
                        key={source}
                        type="button"
                        role="radio"
                        aria-checked={effectiveSource === source}
                        title={source === "crm" ? t("projects.form.accountPicker.sourceCrmTitle", { crm: crmName }) : undefined}
                        onClick={() => setAccountSource(source)}
                        className={cn(
                          "rounded px-2 py-0.5 font-medium transition-colors",
                          effectiveSource === source
                            ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                        )}
                      >
                        {source === "crm" ? t("projects.form.accountPicker.sourceCrm") : t("projects.form.accountPicker.sourceCriteriaIq")}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {isEdit ? (
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input 
                      value={field.value} 
                      readOnly 
                      className="bg-gray-100 cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 flex-1" 
                    />
                  </FormControl>
                  <InfrastructureDiscoveryButton
                    customerId={selectedCustomer?.id}
                    onClick={() => setInfraDrawerOpen(true)}
                  />
                </div>
              ) : effectiveSource === "crm" && installCrm !== "none" ? (
                <AccountCrmPicker
                  provider={installCrm}
                  customers={customers}
                  onSelectAccount={(name) => {
                    selectCustomer(name);
                    setAccountSource("criteriaiq");
                  }}
                  onCreateFromCrm={(url) => onCreateAccountFromCrm?.(url)}
                  onLinkExisting={(id, url) => onLinkAccountToCrm?.(id, url)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    selectCustomer(value);
                  }} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="flex-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                        <SelectValue placeholder="Select a customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((customer: any) => {
                        const industry = industries.find(ind => ind.id === customer.industryId);
                        return (
                          <SelectItem key={customer.id} value={customer.accountName}>
                            <div className="flex flex-col">
                              <span className="font-medium">{customer.accountName}</span>
                              {industry && (
                                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                                  {industry.icon && <DynamicIcon name={industry.icon} className="h-3.5 w-3.5" />}
                                  <span>{industry.name}</span>
                                </div>
                              )}
                              {!industry && <span className="text-sm text-gray-500 dark:text-gray-400">No industry specified</span>}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <InfrastructureDiscoveryButton
                    customerId={selectedCustomer?.id}
                    onClick={() => setInfraDrawerOpen(true)}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => setIsCreateCustomerDialogOpen(true)}
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Create Account</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="customerLogo"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="dark:text-slate-200 h-5 flex items-center gap-1.5">
                Account & Company Logo
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Loaded from the selected customer's profile. To change, update the customer's logo in Customer management.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <FormControl>
                {field.value && !logoLoadFailed ? (
                  <div className="flex items-center gap-3 h-10 px-3 rounded-md border bg-gray-50 dark:bg-slate-800 dark:border-slate-700">
                    <img
                      src={field.value}
                      alt="Customer logo"
                      className="max-w-[80px] max-h-[28px] object-contain dark:bg-white dark:rounded dark:px-1"
                      onError={() => setLogoLoadFailed(true)}
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300 truncate">
                      {selectedCustomer?.accountName ? `${selectedCustomer.accountName} logo` : 'Company logo'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center h-10 px-3 rounded-md border bg-gray-50 dark:bg-slate-800 dark:border-slate-700">
                    <span className="text-sm text-gray-400 dark:text-slate-500">No logo available</span>
                  </div>
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="industry"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="dark:text-slate-200 h-5 flex items-center gap-1.5">
                Industry
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Automatically loaded from the selected customer's profile.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={true}
                  className="bg-gray-50 cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                  placeholder="Auto-populated from selected customer"
                />
              </FormControl>
              {industryComplianceRegulations.length > 0 && (
                <p className="text-sm text-blue-600 mt-2 dark:text-blue-400">
                  <strong>Compliance & Regulations = </strong>
                  {industryComplianceRegulations.map((reg: any, index: number) => (
                    <span key={reg.id}>
                      {reg.name}{index < industryComplianceRegulations.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="dark:text-slate-200 h-5 flex items-center">Project Type <span className="text-red-500 ml-0.5">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PROJECT_TYPES.map((projectType) => (
                    <SelectItem key={projectType} value={projectType}>{projectType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <FormField
          control={form.control}
          name="solutionName"
          render={({ field }) => {
            const currentValue = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);

            return (
              <FormItem className="space-y-2">
                <div className="h-5 flex items-center">
                  <LabelWithHelp label="Solution Name" helpKey="solutions" required />
                </div>
                <div className="space-y-2">
                  <Select onValueChange={(value) => {
                    if (value && !currentValue.includes(value)) {
                      field.onChange([...currentValue, value]);
                    }
                  }} value="">
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder={currentValue.length > 0 ? "Add more solutions..." : "Select solutions..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSolutions.map((product: any) => (
                        <SelectItem key={product.id} value={product.name}>
                          <div className="flex items-center gap-2">
                            <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={`${product.name} icon`} className="w-5 h-5 shrink-0" />
                            <span className={product.isActive === false ? 'text-blue-600' : ''}>
                              {product.name}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {currentValue.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {currentValue.map((solution: string, index: number) => {
                        const solutionProduct = products?.find((p: any) => p.name === solution);
                        return (
                          <div key={`${solution}-${index}`} className="flex items-center gap-0.5">
                            <SolutionBadge
                              solutionName={solution}
                              solutionIcon={solutionProduct?.solutionIcon}
                              solutionIconName={solutionProduct?.solutionIconName}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newValues = field.value.filter((v: string) => v !== solution);
                                field.onChange(newValues);
                                onSolutionChange?.(newValues);
                              }}
                              className="text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="environment"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="dark:text-slate-200 h-5 flex items-center">Environment <span className="text-red-500 ml-0.5">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="CloudLAB">CloudLAB</SelectItem>
                  <SelectItem value="OnPremise Production">OnPremise Production</SelectItem>
                  <SelectItem value="OnPremise PreProd">OnPremise PreProd</SelectItem>
                  <SelectItem value="SaaS">SaaS</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Column 1: Opportunity Name (75%) + ACV Value (25%) */}
        <div className="grid grid-cols-4 gap-3 items-start">
          <div className="col-span-3">
            <FormField
              control={form.control}
              name="opportunityName"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="dark:text-slate-200 h-5 flex items-center">
                    Opportunity Name <span className="text-red-500 ml-0.5">*</span>
                  </FormLabel>
                  {sfConnected ? (
                    <Select
                      value={(field.value as string) || ''}
                      onValueChange={(value) => {
                        const opp = sfOpportunities.find(o => o.name === value);
                        field.onChange(value);
                        setSelectedSfOpportunityId(opp?.id || null);
                        form.setValue('salesforceEvaluationLink', '' as any);
                        // Picking an Opportunity fills its record ids
                        // (Account from the Opportunity's Account).
                        // Salesforce ids are stored 18-char; HubSpot ids as is.
                        const crmId = (id?: string | null) =>
                          !id ? null : crmProvider === 'salesforce' ? toSalesforceId18(id) : id;
                        const opportunityId = crmId(opp?.id);
                        if (opportunityId && crmProvider !== 'none') {
                          const accountId = crmId(opp?.accountId);
                          form.setValue('crmProvider', crmProvider as any, { shouldDirty: true });
                          form.setValue('crmOpportunityId', opportunityId as any, { shouldDirty: true, shouldValidate: true });
                          form.setValue('crmAccountId', (accountId ?? '') as any, { shouldDirty: true, shouldValidate: true });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                          {loadingOpportunities ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Loading...
                            </span>
                          ) : (
                            <SelectValue placeholder={customerName ? "Select opportunity" : "Select account first"} />
                          )}
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sfOpportunities.length === 0 && !loadingOpportunities && (
                          <SelectItem value="__none__" disabled>
                            {customerName ? "No opportunities found" : "Select an account first"}
                          </SelectItem>
                        )}
                        {sfOpportunities.map((opp) => (
                          <SelectItem key={opp.id} value={opp.name}>
                            {opp.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <FormControl>
                      <Input
                        placeholder="Enter opportunity name"
                        {...field}
                        value={(field.value as string) ?? ''}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="col-span-1">
            <FormField
              control={form.control}
              name="opportunityAcvValue"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <div className="h-5 flex items-center">
                    <LabelWithHelp label="ACV Value" helpKey="opportunityAcvValue" required />
                  </div>
                  <FormControl>
                    <Input
                      placeholder="$0.00"
                      {...field}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                      onChange={(e) => {
                        let value = e.target.value;
                        value = value.replace(/[^0-9.]/g, '');
                        if (value.includes('.')) {
                          const parts = value.split('.');
                          value = parts[0] + '.' + parts[1].slice(0, 2);
                        }
                        if (value && value !== "0" && value !== "0.00") {
                          const parts = value.split('.');
                          const wholePart = parts[0];
                          const decimalPart = parts[1];
                          const formattedWhole = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                          const formattedValue = decimalPart !== undefined
                            ? formattedWhole + '.' + decimalPart
                            : formattedWhole;
                          value = '$' + formattedValue;
                        } else {
                          value = '';
                        }
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                  {(() => {
                    const raw = field.value?.replace(/[^0-9.]/g, '') || '';
                    const numVal = parseFloat(raw);
                    if (!raw || isNaN(numVal) || numVal <= 0) return null;
                    let message = '';
                    if (numVal < 50000) {
                      message = '≤50k - Use a Quick plan';
                    } else if (numVal <= 100000) {
                      message = '50k-100k - Consider a MAP template';
                    } else {
                      message = '>100k - Use a full MAP template';
                    }
                    return (
                      <div className="flex items-start gap-1 mt-1 px-2 py-1.5 rounded-md border border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20">
                        <Lightbulb className="h-3 w-3 text-orange-500 dark:text-orange-400 shrink-0 mt-0.5" />
                        <span className="text-xs font-medium text-orange-600 dark:text-orange-400 leading-tight">{message}</span>
                      </div>
                    );
                  })()}
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Column 2: validation record link (Evaluation / POC / POV / ...) */}
        <FormField
          control={form.control}
          name="salesforceEvaluationLink"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="dark:text-slate-200 h-5 flex items-center">
                {t("projects.form.validationRecord.linkLabel", { record: recordName })}
                {linkRequired ? <span className="text-red-500 dark:text-red-400 ml-0.5">*</span> : null}
              </FormLabel>
              {sfConnected ? (
                <Select
                  value={(field.value as string) || ''}
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                  disabled={!selectedSfOpportunityId}
                >
                  <FormControl>
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      {loadingEvaluations ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading...
                        </span>
                      ) : (
                        <SelectValue placeholder={selectedSfOpportunityId ? t("projects.form.validationRecord.select", { record: recordName }) : t("projects.form.validationRecord.selectOpportunityFirst")} />
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sfEvaluations.length === 0 && !loadingEvaluations && (
                      <SelectItem value="__none__" disabled>
                        {selectedSfOpportunityId ? t("projects.form.validationRecord.noneFound", { record: recordName }) : t("projects.form.validationRecord.selectOpportunityFirst")}
                      </SelectItem>
                    )}
                    {sfEvaluations.map((ev) => (
                      // Store the record URL when the server sends one, so
                      // the Evaluation id can be read back from the link.
                      <SelectItem key={ev.id} value={ev.url || ev.name}>
                        {ev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <FormControl>
                  <Input
                    placeholder={t("projects.form.validationRecord.urlPlaceholder", { record: recordName })}
                    {...field}
                    value={(field.value as string) ?? ''}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  />
                </FormControl>
              )}
              {form.formState.errors.salesforceEvaluationLink ? (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t("projects.form.validationRecord.required", { record: recordName })}
                </p>
              ) : null}
            </FormItem>
          )}
        />
      </div>

      {/* CRM record ids (Opportunity / Account) */}
      <CrmRecordFields form={form} projectId={projectId} />

      {/* Competitors Row: Connected With (read-only) + Competing With (interactive) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Column 1: Competitors Connected With (read-only from account) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium dark:text-slate-200 flex items-center gap-1.5">
            <Swords className="h-4 w-4 text-blue-500" />
            Competitors Connected With
          </Label>
          {!selectedCustomer?.id ? (
            <div className="text-sm text-gray-400 dark:text-slate-500 italic py-3 px-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              Select an account to see connected competitors
            </div>
          ) : accountCompetitors.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-slate-500 italic py-3 px-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No competitors connected to this account
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {accountCompetitors.map((ac: any) => {
                const isHex = ac.spaceColor?.startsWith("#");
                const bgColor = isHex ? hexWithAlpha(ac.spaceColor, 0.08) : "rgba(100,116,139,0.08)";
                const borderColor = isHex ? hexWithAlpha(ac.spaceColor, 0.25) : "rgba(100,116,139,0.25)";
                const textColor = isHex ? ac.spaceColor : "#64748b";
                return (
                  <div
                    key={`${ac.competitorId}-${ac.spaceId}`}
                    className="flex items-center gap-2 flex-wrap rounded-lg border px-3 py-2"
                    style={{ borderColor, backgroundColor: bgColor }}
                  >
                    <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: textColor }} />
                    <span className="text-sm font-medium" style={{ color: textColor }}>
                      {ac.competitorName}
                    </span>
                    {ac.spaceName && (
                      <span
                        className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                        style={{
                          backgroundColor: isHex ? hexWithAlpha(ac.spaceColor, 0.2) : "rgba(100,116,139,0.2)",
                          color: textColor,
                        }}
                      >
                        {ac.spaceName}
                      </span>
                    )}
                    {ac.relationship && (
                      <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        {ac.relationship}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 2: Competitors Competing With (interactive picker) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium dark:text-slate-200 flex items-center gap-1.5">
            <Swords className="h-4 w-4 text-red-500" />
            Competitors Competing With
          </Label>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Technology Space</Label>
              <Select
                value={compPickerSpaceId}
                onValueChange={(val) => {
                  setCompPickerSpaceId(val);
                  setCompPickerCompetitorId("");
                  setCompPickerRelationship("");
                }}
              >
                <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue placeholder="Select space..." />
                </SelectTrigger>
                <SelectContent>
                  {techSpaces.map((s: any) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Competitor</Label>
              <Select
                value={compPickerCompetitorId}
                onValueChange={(val) => {
                  setCompPickerCompetitorId(val);
                  setCompPickerRelationship("");
                }}
                disabled={!compPickerSpaceId}
              >
                <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue placeholder={compPickerSpaceId ? "Select competitor..." : "Choose space first"} />
                </SelectTrigger>
                <SelectContent>
                  {competitorsForSelectedSpace.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Relationship</Label>
              <Select
                value={compPickerRelationship}
                onValueChange={setCompPickerRelationship}
                disabled={!compPickerCompetitorId}
              >
                <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue placeholder={compPickerCompetitorId ? "Select relationship..." : "Choose competitor first"} />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleAddCompetingWith}
              disabled={!compPickerSpaceId || !compPickerCompetitorId || !compPickerRelationship}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>

          {projectCompetingWith.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-slate-500 italic py-3 px-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No competitors added yet
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {projectCompetingWith.map((cc) => {
                const isHex = cc.spaceColor?.startsWith("#");
                const bgColor = isHex ? hexWithAlpha(cc.spaceColor, 0.08) : "rgba(100,116,139,0.08)";
                const borderColor = isHex ? hexWithAlpha(cc.spaceColor, 0.25) : "rgba(100,116,139,0.25)";
                const textColor = isHex ? cc.spaceColor : "#64748b";
                return (
                  <div
                    key={`${cc.competitorId}-${cc.spaceId}`}
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
                      onClick={() => handleRemoveCompetingWith(cc.competitorId, cc.spaceId)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <FormField
        control={form.control}
        name="tags"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="dark:text-slate-200">Tags</FormLabel>
            <FormControl>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(field.value || []).map((tag) => {
                    const tagInfo = getTagInfo(tag);
                    return (
                      <Badge 
                        key={tag} 
                        variant="secondary" 
                        className="flex items-center gap-1 text-white rounded-full px-3 py-1"
                        style={{ backgroundColor: tagInfo.color }}
                      >
                        <Hash className="h-3 w-3" />
                        {tagInfo.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:bg-black/20 rounded text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Select onValueChange={(value) => {
                    if (value) {
                      handleAddTag(value);
                    }
                  }}>
                    <SelectTrigger className="flex-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Select tags" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTags?.filter(tag => !(field.value || []).includes(tag.name)).map((tag) => (
                        <SelectItem key={tag.id} value={tag.name}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            {normalizeTagName(tag.name)}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {suggestedTags.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 dark:text-slate-400">Suggested tags:</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const nextIndex = (suggestedTagsIndex + 5) % (allTags?.length || 1);
                          setSuggestedTagsIndex(nextIndex);
                          updateSuggestedTags();
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        More
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {suggestedTags.map((tag) => (
                        <Button
                          key={tag.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddTag(tag.name)}
                          className="text-xs text-white rounded-full px-3 py-1"
                          style={{ backgroundColor: tag.color, borderColor: tag.color }}
                        >
                          <Hash className="h-3 w-3 mr-1" />
                          {normalizeTagName(tag.name)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <InfrastructureDiscoveryDrawer
        open={infraDrawerOpen}
        onOpenChange={setInfraDrawerOpen}
        customerId={selectedCustomer?.id ?? 0}
        customerName={selectedCustomer?.accountName ?? ""}
        attachedProfileId={infrastructureProfileId}
        onAttachProfile={onInfrastructureProfileChange}
      />
    </div>
  );
}
