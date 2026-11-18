import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, Edit, RotateCcw, Save, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";

interface Industry {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  complianceRegulations?: number[];
  allRegulationsApply?: boolean;
}

interface Regulation {
  id: number;
  name: string;
  longName?: string | null;
}

interface IndustryForm {
  name: string;
  description: string;
  icon: string;
  complianceRegulations: number[];
  allRegulationsApply: boolean;
}

interface ResetSummary {
  summary?: { inserted?: number; updated?: number; totalDefaults?: number };
}

const EMPTY_FORM: IndustryForm = {
  name: "",
  description: "",
  icon: "Building2",
  complianceRegulations: [],
  allRegulationsApply: false,
};

/**
 * Admin › Projects & Rules › Industries: the industry list used by project
 * templates and filters, with the regulations each industry falls under.
 * Its own page and permission (config.industries); it used to be a card on
 * Field Settings.
 */
export function IndustriesSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const { canEdit } = usePermissions();
  const canEditIndustries = canEdit("config.industries");
  const isAdmin = user?.role === "Admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<IndustryForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<Industry | null>(null);
  const [loadingRegulations, setLoadingRegulations] = useState(false);
  const [regSearch, setRegSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const { data: industries = [] } = useQuery<Industry[]>({
    queryKey: ["/api/industries"],
    queryFn: () => apiRequest("GET", "/api/industries"),
    enabled: isAuthenticated,
    staleTime: 300000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: regulations = [] } = useQuery<Regulation[]>({
    queryKey: ["/api/compliance"],
    queryFn: () => apiRequest("GET", "/api/compliance"),
    enabled: isAuthenticated,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const regById = useMemo(() => {
    const map = new Map<number, string>();
    regulations.forEach((reg) => map.set(reg.id, reg.name));
    return map;
  }, [regulations]);

  const regulationName = (id: number) => regById.get(id) || t("industries.regulationFallback", { id });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setRegSearch("");
  };

  const createMutation = useMutation({
    mutationFn: async (data: IndustryForm) => apiRequest("POST", "/api/industries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      closeDialog();
      showSuccessToast(t("industries.toasts.createdTitle"), t("industries.toasts.created"));
    },
    onError: () => showErrorToast(t("industries.toasts.errorTitle"), t("industries.toasts.createFailed")),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: IndustryForm }) =>
      apiRequest("PUT", `/api/industries/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      closeDialog();
      showSuccessToast(t("industries.toasts.updatedTitle"), t("industries.toasts.updated"));
    },
    onError: () => showErrorToast(t("industries.toasts.errorTitle"), t("industries.toasts.updateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/industries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      showSuccessToast(t("industries.toasts.deletedTitle"), t("industries.toasts.deleted"));
    },
    onError: (error: unknown) =>
      showErrorToast(
        t("industries.toasts.errorTitle"),
        error instanceof Error && error.message ? error.message : t("industries.toasts.deleteFailed"),
      ),
  });

  const resetMutation = useMutation({
    mutationFn: async (): Promise<ResetSummary> => apiRequest("POST", "/api/industries/reset-defaults"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      const s = data?.summary;
      showSuccessToast(
        t("industries.toasts.resetTitle"),
        s
          ? t("industries.toasts.resetSummary", {
              inserted: s.inserted ?? 0,
              updated: s.updated ?? 0,
              total: s.totalDefaults ?? 0,
            })
          : t("industries.toasts.resetDone"),
      );
    },
    onError: (error: unknown) =>
      showErrorToast(
        t("industries.toasts.resetFailedTitle"),
        error instanceof Error && error.message ? error.message : t("industries.toasts.resetFailed"),
      ),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (industry: Industry) => {
    setEditing(industry);
    setForm({
      name: industry.name,
      description: industry.description || "",
      icon: industry.icon || "Building2",
      complianceRegulations: [],
      allRegulationsApply: false,
    });
    setDialogOpen(true);
    setLoadingRegulations(true);
    apiRequest("GET", `/api/industries/${industry.id}/compliance-regulations`)
      .then(({ regulationIds, allRegulationsApply }: { regulationIds?: number[]; allRegulationsApply?: boolean }) => {
        setForm((prev) => ({
          ...prev,
          complianceRegulations: regulationIds || [],
          allRegulationsApply: allRegulationsApply || false,
        }));
      })
      .catch(() => showErrorToast(t("industries.toasts.warningTitle"), t("industries.toasts.loadRegulationsFailed")))
      .finally(() => setLoadingRegulations(false));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      showErrorToast(t("industries.toasts.errorTitle"), t("industries.toasts.nameRequired"));
      return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, updates: form });
    else createMutation.mutate(form);
  };

  const filteredRegulations = regulations.filter((reg) => {
    const q = regSearch.trim().toLowerCase();
    if (!q) return true;
    return (reg.name || "").toLowerCase().includes(q) || (reg.longName || "").toLowerCase().includes(q);
  });

  const alignmentText = (industry: Industry) => {
    if (industry.allRegulationsApply) return t("industries.allRegulationsApply");
    const names = (industry.complianceRegulations ?? []).map(regulationName).join(", ");
    return names || null;
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">{t("industries.title")}</CardTitle>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                disabled={resetMutation.isPending}
                className="flex items-center gap-2"
                title={t("industries.resetHint")}
                data-testid="button-reset-industries"
              >
                <RotateCcw className="h-4 w-4" />
                {t("industries.reset")}
              </Button>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t("industries.description")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("industries.count", { count: industries.length })}
            </p>
            {canEditIndustries && (
              <Button onClick={openCreate} size="sm" className="flex items-center gap-2" data-testid="button-add-industry">
                <Building className="h-4 w-4" />
                {t("industries.add")}
              </Button>
            )}
          </div>

          {industries.length > 0 ? (
            <div className="space-y-2">
              {industries.map((industry) => {
                const alignment = alignmentText(industry);
                return (
                  <div
                    key={industry.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                    data-testid={`industry-row-${industry.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {industry.icon && <DynamicIcon name={industry.icon} className="h-5 w-5 text-primary shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{industry.name}</p>
                        {industry.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{industry.description}</p>
                        )}
                        <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                          <span className="font-medium">{t("industries.alignmentLabel")} = </span>
                          {alignment ? (
                            <span>{alignment}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">{t("industries.noRegulations")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canEditIndustries && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(industry)}
                          className="h-8 w-8 p-0 text-gray-900 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
                          title={t("industries.edit")}
                          aria-label={t("industries.edit")}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeleteId(industry.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          title={t("industries.delete")}
                          aria-label={t("industries.delete")}
                        >
                          <Trash2 className="h-4 w-4 red-trash-icon" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Building className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p>{t("industries.empty")}</p>
              {canEditIndustries && <p className="text-sm">{t("industries.emptyHint")}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title={t("industries.deleteDialog.title")}
        description={t("industries.deleteDialog.description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (pendingDeleteId !== null) deleteMutation.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
        variant="destructive"
      />

      <ConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={t("industries.resetDialog.title")}
        description={t("industries.resetDialog.description")}
        confirmLabel={t("industries.resetDialog.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => resetMutation.mutate()}
        variant="destructive"
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) setDialogOpen(true);
          else closeDialog();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              {editing ? t("industries.dialog.editTitle") : t("industries.dialog.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1">
            <div>
              <Label htmlFor="industry-name">{t("industries.dialog.name")}</Label>
              <Input
                id="industry-name"
                placeholder={t("industries.dialog.namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="industry-description">{t("industries.dialog.description")}</Label>
              <Textarea
                id="industry-description"
                placeholder={t("industries.dialog.descriptionPlaceholder")}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <LucideIconPicker
                label={t("industries.dialog.icon")}
                value={form.icon}
                onChange={(icon) => setForm((prev) => ({ ...prev, icon }))}
              />
            </div>
            <div>
              <Label>{t("industries.alignmentLabel")}</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("industries.dialog.alignmentHint")}</p>
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id="industry-all-regs-apply"
                  checked={form.allRegulationsApply}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setForm((prev) => ({
                      ...prev,
                      allRegulationsApply: next,
                      complianceRegulations: next ? [] : prev.complianceRegulations,
                    }));
                  }}
                />
                <Label
                  htmlFor="industry-all-regs-apply"
                  className="text-sm font-normal cursor-pointer text-gray-700 dark:text-gray-300"
                >
                  {t("industries.allRegulationsApply")}
                </Label>
              </div>
              {loadingRegulations ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{t("industries.dialog.loadingSelections")}</p>
              ) : (
                !form.allRegulationsApply && (
                  <div className="mt-3 space-y-2">
                    {form.complianceRegulations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {form.complianceRegulations.map((regId) => {
                          const name = regulationName(regId);
                          return (
                            <Badge
                              key={regId}
                              variant="secondary"
                              className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 gap-1"
                            >
                              {name}
                              <button
                                type="button"
                                aria-label={t("industries.dialog.removeRegulation", { name })}
                                className="hover:text-blue-900 dark:hover:text-blue-100"
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    complianceRegulations: prev.complianceRegulations.filter((id) => id !== regId),
                                  }))
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    <Input
                      placeholder={t("industries.dialog.searchRegulations")}
                      value={regSearch}
                      onChange={(e) => setRegSearch(e.target.value)}
                    />
                    <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredRegulations.map((reg) => {
                        const checked = form.complianceRegulations.includes(reg.id);
                        return (
                          <label
                            key={reg.id}
                            htmlFor={`industry-reg-${reg.id}`}
                            className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Checkbox
                              id={`industry-reg-${reg.id}`}
                              checked={checked}
                              onCheckedChange={(c) => {
                                const isChecked = c === true;
                                setForm((prev) => ({
                                  ...prev,
                                  complianceRegulations: isChecked
                                    ? Array.from(new Set([...prev.complianceRegulations, reg.id]))
                                    : prev.complianceRegulations.filter((id) => id !== reg.id),
                                }));
                              }}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{reg.name}</div>
                              {reg.longName && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{reg.longName}</div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                      {regulations.length === 0 && (
                        <div className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400 text-center">
                          {t("industries.dialog.noRegulations")}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={closeDialog}>
                <X className="h-4 w-4 mr-1" />
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving} data-testid="button-save-industry">
                <Save className="h-4 w-4 mr-1" />
                {editing ? t("common.saveChanges") : t("industries.dialog.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
