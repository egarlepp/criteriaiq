import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ComboboxWithInput } from "@/components/ui/combobox-with-input";
import {
  type InsertGap,
  type Gap,
  GapTypeEnum,
  GapStatusEnum,
  GapCriticalityEnum,
  GapResolutionOwnerEnum,
} from "@shared/schema";
import { gapFormResolver } from "./types";
import { Loader2, AlignVerticalSpaceAround, X, Upload, Wrench, Route, Ban, CheckCircle2, Calendar, FlaskConical, Hammer } from "lucide-react";
import { format } from "date-fns";

// Helper function to get status icon component
function getStatusIcon(status: string, className: string = "h-4 w-4") {
  switch (status) {
    case "Submitted":
      return <Upload className={className} />;
    case "Being Researched":
      return <FlaskConical className={className} />;
    case "Working On":
      return <Hammer className={className} />;
    case "Workaround Available":
      return <Wrench className={className} />;
    case "Roadmap Candidate":
      return <Route className={className} />;
    case "Won't Do":
      return <Ban className={className} />;
    case "Implemented":
      return <CheckCircle2 className={className} />;
    default:
      return null;
  }
}

interface GapFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gapToEdit?: Gap | null;
  projectContext?: { id: number; customerId: number | null; solutions: string[] };
  availableProducts?: { id: number; name: string; solutionIcon?: string | null; solutionIconName?: string | null }[];
}

export function GapFormDialog({
  open,
  onOpenChange,
  gapToEdit,
  projectContext,
  availableProducts: externalProducts,
}: GapFormDialogProps) {
  const queryClient = useQueryClient();

  const { data: productsData } = useQuery<{ id: number; name: string; solutionIcon?: string | null; solutionIconName?: string | null }[]>({
    queryKey: ["/api/products"],
    enabled: !externalProducts,
  });

  const allProducts = externalProducts || productsData || [];
  
  // Filter products to only show solutions that match the project's selected solutions
  // Uses case-insensitive partial matching with trimming (same logic as GapDrawer)
  const availableProducts = projectContext?.solutions?.length
    ? allProducts.filter((product) =>
        projectContext.solutions.some((projectSolution) => {
          const productNameLower = product.name.toLowerCase().trim();
          const projectSolutionLower = projectSolution.toLowerCase().trim();
          return (
            productNameLower.includes(projectSolutionLower) ||
            projectSolutionLower.includes(productNameLower)
          );
        })
      )
    : allProducts;

  const form = useForm<InsertGap>({
    resolver: gapFormResolver,
    defaultValues: {
      gapName: "",
      impactedSolution: "",
      gapType: "Feature",
      status: "Workaround Available",
      criticality: "Should Have",
      description: "",
      workaroundDetail: "",
      resolutionOwner: "Unassigned",
      projectId: projectContext?.id,
      customerId: projectContext?.customerId ?? undefined,
    },
  });

  // Watch the impactedSolution field to fetch linked components
  const selectedSolutionName = form.watch("impactedSolution");
  
  // Find the product ID for the selected solution name
  const selectedProduct = useMemo(() => {
    if (!selectedSolutionName) return null;
    return allProducts.find(
      (p) => p.name.toLowerCase().trim() === selectedSolutionName.toLowerCase().trim()
    );
  }, [selectedSolutionName, allProducts]);

  const { data: customersData = [] } = useQuery<{ id: number; accountName: string }[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allProjectsData = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const selectedCustomerId = form.watch("customerId") as number | undefined;
  const selectedProjectId = form.watch("projectId") as number | undefined;

  const filteredProjects = useMemo(() => {
    if (!selectedCustomerId || !selectedSolutionName) return [];
    const customer = customersData.find((c) => c.id === selectedCustomerId);
    if (!customer) return [];
    return allProjectsData.filter((p: any) => {
      const nameMatch = (p.customerName || '').toLowerCase() === customer.accountName.toLowerCase();
      const sol = (p.solutionName || '').toLowerCase();
      const selected = selectedSolutionName.toLowerCase();
      const solutionMatch = sol.includes(selected) || selected.includes(sol);
      return nameMatch && solutionMatch;
    });
  }, [customersData, allProjectsData, selectedCustomerId, selectedSolutionName]);

  const selectedAccountName = useMemo(() => {
    if (!selectedCustomerId) return '';
    return customersData.find((c) => c.id === selectedCustomerId)?.accountName || '';
  }, [customersData, selectedCustomerId]);

  const selectedProjectName = useMemo(() => {
    if (!selectedProjectId) return '';
    const p = allProjectsData.find((p: any) => p.id === selectedProjectId);
    return p ? (p.opportunityName || p.name || `Project #${p.id}`) : '';
  }, [allProjectsData, selectedProjectId]);

  useEffect(() => {
    const currentProjectId = form.getValues("projectId");
    if (!currentProjectId || projectContext?.id) return;
    const proj = allProjectsData.find((p: any) => p.id === currentProjectId);
    if (!proj) return;
    const customer = customersData.find((c) => c.id === selectedCustomerId);
    const nameMatch = customer && (proj.customerName || '').toLowerCase() === customer.accountName.toLowerCase();
    const sol = (proj.solutionName || '').toLowerCase();
    const selected = (selectedSolutionName || '').toLowerCase();
    const solMatch = sol.includes(selected) || selected.includes(sol);
    if (!nameMatch || !solMatch) form.setValue("projectId", undefined as any);
  }, [selectedCustomerId, selectedSolutionName]);

  // Fetch components linked to the selected solution
  const { data: componentsData } = useQuery<{ id: number; name: string; isAllSolutions?: boolean }[]>({
    queryKey: ["/api/components", { solutionId: selectedProduct?.id }],
    queryFn: async () => {
      const response = await fetch(`/api/components?solutionId=${selectedProduct?.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch components");
      return response.json();
    },
    enabled: !!selectedProduct?.id,
  });

  // Convert components to combobox options
  const componentOptions = useMemo(() => {
    if (!componentsData) return [];
    return componentsData.map((comp) => ({
      value: comp.name,
      label: comp.name,
    }));
  }, [componentsData]);

  useEffect(() => {
    if (open) {
      if (gapToEdit) {
        form.reset({
          gapName: gapToEdit.gapName,
          impactedSolution: gapToEdit.impactedSolution,
          impactedComponent: gapToEdit.impactedComponent,
          gapType: gapToEdit.gapType as any,
          status: gapToEdit.status as any,
          criticality: gapToEdit.criticality as any,
          description: gapToEdit.description,
          workaroundDetail: gapToEdit.workaroundDetail,
          resolutionOwner: gapToEdit.resolutionOwner as any,
          projectId: gapToEdit.projectId || undefined,
          customerId: gapToEdit.customerId || undefined,
        });
      } else {
        form.reset({
          gapName: "",
          impactedSolution: "",
          gapType: "Feature",
          status: "Workaround Available",
          criticality: "Should Have",
          description: "",
          workaroundDetail: "",
          resolutionOwner: "Unassigned",
          projectId: projectContext?.id,
          customerId: projectContext?.customerId ?? undefined,
        });
      }
    }
  }, [open, gapToEdit, projectContext, form]);

  const mutation = useMutation({
    mutationFn: async (values: InsertGap) => {
      if (gapToEdit) {
        return apiRequest("PATCH", `/api/gaps/${gapToEdit.id}`, values);
      } else {
        return apiRequest("POST", "/api/gaps", values);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gaps"] });
      if (projectContext?.id) {
        queryClient.invalidateQueries({
          queryKey: [`/api/projects/${projectContext.id}/gaps`],
        });
      }
      showSuccessToast(`Gap ${gapToEdit ? "updated" : "logged"} successfully`);
      onOpenChange(false);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "An error occurred");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlignVerticalSpaceAround className="h-5 w-5" />
            {gapToEdit ? `Edit Gap Analysis ID: #${gapToEdit.id}` : "Log New Gap"}
          </DialogTitle>
          <DialogDescription>
            Identify limitations in the solution and define workarounds or
            roadmap requests.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="gapName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Gap Name <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter a short, descriptive name for this gap..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="impactedSolution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Impacted Solution <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Solution..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableProducts.map((prod) => (
                          <SelectItem key={prod.id} value={prod.name}>
                            <div className="flex items-center gap-2">
                              <SolutionGraphic graphic={prod.solutionIcon} icon={prod.solutionIconName} name={`${prod.name} icon`} className="w-5 h-5 shrink-0" />
                              <span>{prod.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="impactedComponent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Component / Module (Optional)</FormLabel>
                    <FormControl>
                      <ComboboxWithInput
                        options={componentOptions}
                        value={field.value || ""}
                        onValueChange={field.onChange}
                        placeholder="Select or type..."
                        searchPlaceholder="Search components..."
                        emptyText="No components found. Type to add custom."
                        allowCustomValue={true}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Account Name + Project row */}
            <div className="grid grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Account Name <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                {projectContext?.customerId ? (
                  <FormControl>
                    <Input value={selectedAccountName} disabled className="bg-muted/50" />
                  </FormControl>
                ) : (
                  <Select
                    value={selectedCustomerId ? String(selectedCustomerId) : ""}
                    onValueChange={(val) => {
                      form.setValue("customerId", Number(val) as any);
                      form.setValue("projectId", undefined as any);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customersData
                        .slice()
                        .sort((a, b) => a.accountName.localeCompare(b.accountName))
                        .map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.accountName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </FormItem>

              <FormItem>
                <FormLabel>Project <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                {projectContext?.id ? (
                  <FormControl>
                    <Input value={selectedProjectName} disabled className="bg-muted/50" />
                  </FormControl>
                ) : (
                  <Select
                    value={selectedProjectId ? String(selectedProjectId) : ""}
                    onValueChange={(val) => form.setValue("projectId", Number(val) as any)}
                    disabled={!selectedCustomerId || !selectedSolutionName}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            !selectedCustomerId || !selectedSolutionName
                              ? "Select account & solution first..."
                              : "Select project..."
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredProjects.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No matching projects found</div>
                      ) : (
                        filteredProjects.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.opportunityName || p.name || `Project #${p.id}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </FormItem>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="gapType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gap Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GapTypeEnum.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="criticality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Criticality</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GapCriticalityEnum.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GapStatusEnum.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            <span className="flex items-center gap-2">
                              {getStatusIcon(opt)}
                              {opt}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Gap Description (The "Ask"){" "}
                    <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the customer requirement and why our current native capability is insufficient..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="workaroundDetail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proposed Workaround / Solution</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the script, config change, or process workaround..."
                      className="min-h-[80px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="resolutionOwner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolution Owner</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GapResolutionOwnerEnum.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Status Dates Section - Only show when editing existing gap */}
            {gapToEdit && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Status Dates</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block mb-1">Date Submitted</span>
                    <span className="font-medium">
                      {gapToEdit.createdAt ? format(new Date(gapToEdit.createdAt), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Final Disposition</span>
                    <span className="font-medium">
                      {gapToEdit.finalDispositionDate ? format(new Date(gapToEdit.finalDispositionDate), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Last Modified</span>
                    <span className="font-medium">
                      {gapToEdit.updatedAt ? format(new Date(gapToEdit.updatedAt), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <AlignVerticalSpaceAround className="mr-2 h-4 w-4" />
                )}
                {gapToEdit ? "Update Gap" : "Log Gap"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
