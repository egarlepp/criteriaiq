import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, Palette, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { applyLogoVariants, applyThemeColors } from "@/lib/theme-apply";
import { ACTIVE_THEME_QUERY_KEY, useActiveTheme } from "@/hooks/useActiveTheme";
import {
  CLASSIC_COLORS,
  isLogoVariant,
  resolveLogoVariants,
  withThemeDefaults,
  type LogoVariant,
  type ThemeColors,
} from "@shared/theme-colors";
import { ThemeEditor, type ThemeFormState } from "./ThemeEditor";
import { useMediaLogoVariants } from "./logo-variants";

interface ThemeRow {
  id: number;
  name: string;
  colors: ThemeColors;
  logoVariantLight: LogoVariant | null;
  logoVariantDark: LogoVariant | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const THEMES_QUERY_KEY = ["/api/admin/themes"] as const;

type EditorState = { mode: "create"; initial: ThemeFormState } | { mode: "edit"; id: number; initial: ThemeFormState } | null;

function ThemeSwatch({ colors }: { colors: ThemeColors }) {
  return (
    <span className="flex h-7 w-12 shrink-0 overflow-hidden rounded border border-gray-200 dark:border-gray-700" aria-hidden="true">
      <span className="w-1/3" style={{ backgroundImage: `linear-gradient(to bottom, ${colors.sidebarBgTopLight}, ${colors.sidebarBgBottomLight})` }} />
      <span className="flex w-2/3 flex-col">
        <span className="h-2" style={{ background: `linear-gradient(to right, ${colors.topbarGradientFromLight}, ${colors.topbarGradientToLight})` }} />
        <span className="flex flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
          <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: colors.primaryLight }} />
        </span>
      </span>
    </span>
  );
}

/**
 * Admin › Appearance › Theming. Lists saved themes plus the built-in
 * CriteriaIQ Classic, and opens the editor to create or change one. One
 * theme is active for everyone; with none active the app shows Classic.
 */
export function ThemingSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingDelete, setPendingDelete] = useState<ThemeRow | null>(null);

  const themesQuery = useQuery<ThemeRow[]>({ queryKey: THEMES_QUERY_KEY });
  const activeQuery = useActiveTheme();
  const { variants: mediaLogoVariants } = useMediaLogoVariants();
  const themes = (themesQuery.data ?? []).map((row) => ({
    ...row,
    colors: withThemeDefaults(row.colors),
    logoVariantLight: isLogoVariant(row.logoVariantLight) ? row.logoVariantLight : null,
    logoVariantDark: isLogoVariant(row.logoVariantDark) ? row.logoVariantDark : null,
  }));
  const activeTheme = themes.find((row) => row.isActive) ?? null;

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: THEMES_QUERY_KEY }),
      qc.invalidateQueries({ queryKey: ACTIVE_THEME_QUERY_KEY }),
    ]);
  };

  /** Shows the theme everyone sees (ends any unsaved preview). */
  const showActiveTheme = () => {
    applyThemeColors(activeQuery.data?.colors ?? activeTheme?.colors ?? null);
    applyLogoVariants(activeQuery.data?.logoVariants ?? resolveLogoVariants(activeTheme, mediaLogoVariants));
  };

  /** Puts `row` (or Classic with null) on screen, as everyone will now see it. */
  const showTheme = (row: Pick<ThemeRow, "colors" | "logoVariantLight" | "logoVariantDark"> | null) => {
    applyThemeColors(row ? withThemeDefaults(row.colors) : null);
    applyLogoVariants(resolveLogoVariants(row, mediaLogoVariants));
  };

  const onError = (err: unknown) => {
    showErrorToast("common.error", err instanceof Error ? err.message : "appearance.theming.toasts.failed");
  };

  const saveMutation = useMutation({
    mutationFn: async ({ state, form }: { state: NonNullable<EditorState>; form: ThemeFormState }) =>
      state.mode === "create"
        ? ((await apiRequest("POST", "/api/admin/themes", form)) as ThemeRow)
        : ((await apiRequest("PATCH", `/api/admin/themes/${state.id}`, form)) as ThemeRow),
    onSuccess: async (saved, { state }) => {
      setEditor(null);
      // Saving the active theme changes the app for everyone, this screen included.
      if (saved.isActive) showTheme(saved);
      showSuccessToast(state.mode === "create" ? "appearance.theming.toasts.created" : "appearance.theming.toasts.saved");
      await refresh();
    },
    onError,
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number | null) => apiRequest("POST", "/api/admin/themes/activate", { id }),
    onSuccess: async (_data, id) => {
      const target = id === null ? null : themes.find((row) => row.id === id);
      showTheme(target ?? null);
      showSuccessToast("appearance.theming.toasts.activated");
      await refresh();
    },
    onError,
  });

  const cloneMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/admin/themes/${id}/clone`),
    onSuccess: async () => {
      showSuccessToast("appearance.theming.toasts.copied");
      await refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/themes/${id}`),
    onSuccess: async () => {
      showSuccessToast("appearance.theming.toasts.deleted");
      await refresh();
    },
    onError,
  });

  const busy = activateMutation.isPending || cloneMutation.isPending || deleteMutation.isPending;

  const openCreate = () =>
    setEditor({
      mode: "create",
      initial: {
        name: "",
        colors: { ...(activeTheme?.colors ?? CLASSIC_COLORS) },
        logoVariantLight: activeTheme?.logoVariantLight ?? null,
        logoVariantDark: activeTheme?.logoVariantDark ?? null,
      },
    });

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Palette} />
        <CardHeader className="relative z-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {editor
                  ? editor.mode === "create"
                    ? t("appearance.theming.editor.newTitle")
                    : t("appearance.theming.editor.editTitle", { name: editor.initial.name })
                  : t("appearance.theming.title")}
              </CardTitle>
              <CardDescription>{t("appearance.theming.intro")}</CardDescription>
            </div>
            {!editor && (
              <Button onClick={openCreate} data-testid="theme-new-button">
                <Plus className="mr-2 h-4 w-4" />
                {t("appearance.theming.newTheme")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          {editor ? (
            <ThemeEditor
              key={editor.mode === "edit" ? editor.id : "new"}
              initial={editor.initial}
              isNew={editor.mode === "create"}
              saving={saveMutation.isPending}
              onSave={(form) => saveMutation.mutate({ state: editor, form })}
              onCancel={() => setEditor(null)}
              onRevertPreview={showActiveTheme}
              mediaLogoVariants={mediaLogoVariants}
            />
          ) : themesQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700" data-testid="theme-list">
              <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <ThemeSwatch colors={CLASSIC_COLORS} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{t("appearance.theming.presets.criteriaiq_classic")}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("appearance.theming.classicHint")}</p>
                  </div>
                  {!activeTheme && <ActiveBadge />}
                </div>
                {activeTheme && (
                  <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(null)} disabled={busy}>
                    {t("appearance.theming.activate")}
                  </Button>
                )}
              </li>
              {themes.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" data-testid={`theme-row-${row.id}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ThemeSwatch colors={row.colors} />
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</p>
                    {row.isActive && <ActiveBadge />}
                  </div>
                  <div className="flex items-center gap-1">
                    {!row.isActive && (
                      <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(row.id)} disabled={busy}>
                        {t("appearance.theming.activate")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditor({
                          mode: "edit",
                          id: row.id,
                          initial: {
                            name: row.name,
                            colors: row.colors,
                            logoVariantLight: row.logoVariantLight,
                            logoVariantDark: row.logoVariantDark,
                          },
                        })
                      }
                      disabled={busy}
                      title={t("appearance.theming.edit")}
                      aria-label={t("appearance.theming.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cloneMutation.mutate(row.id)}
                      disabled={busy}
                      title={t("appearance.theming.copy")}
                      aria-label={t("appearance.theming.copy")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {!row.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(row)}
                        disabled={busy}
                        title={t("appearance.theming.delete")}
                        aria-label={t("appearance.theming.delete")}
                      >
                        <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t("appearance.theming.deleteDialog.title")}
        description={t("appearance.theming.deleteDialog.description", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("appearance.theming.delete")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function ActiveBadge() {
  const { t } = useTranslation();
  return (
    <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/40">
      <Star className="h-3 w-3" />
      {t("appearance.theming.active")}
    </Badge>
  );
}
