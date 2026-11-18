import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Eye, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyLogoVariants, applyThemeColors } from "@/lib/theme-apply";
import {
  THEME_FIELD_GROUPS,
  THEME_PRESETS,
  findContrastIssues,
  isLogoVariant,
  resolveLogoVariants,
  suggestedLogoVariant,
  suggestedLogoVariants,
  type LogoVariant,
  type LogoVariants,
  type ThemeColorField,
  type ThemeColorMode,
  type ThemeColors,
} from "@shared/theme-colors";
import { ThemeChromePreview } from "./ThemeChromePreview";

export interface ThemeFormState {
  name: string;
  colors: ThemeColors;
  /** Which CriteriaIQ logo version each mode shows; null follows the Media setting. */
  logoVariantLight: LogoVariant | null;
  logoVariantDark: LogoVariant | null;
}

const FOLLOW_MEDIA = "follow_media";

interface ThemeEditorProps {
  initial: ThemeFormState;
  isNew: boolean;
  saving: boolean;
  onSave: (form: ThemeFormState) => void;
  onCancel: () => void;
  /** Puts the active theme back on screen after a Preview that was not saved. */
  onRevertPreview: () => void;
  /** The app-wide logo versions from Media, used where the theme follows Media. */
  mediaLogoVariants: LogoVariants;
}

/**
 * Create / edit form for one theme: name, a preset to start from, every
 * light/dark color pair, contrast warnings and a live drawing of the chrome.
 * Preview applies the colors to the admin's own screen only; leaving the
 * editor without saving puts the active theme back.
 */
export function ThemeEditor({ initial, isNew, saving, onSave, onCancel, onRevertPreview, mediaLogoVariants }: ThemeEditorProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ThemeFormState>(initial);
  const [previewing, setPreviewing] = useState(false);
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const previewingRef = useRef(false);
  const revertRef = useRef(onRevertPreview);
  revertRef.current = onRevertPreview;

  // Leaving the editor (Cancel, Save, switching tab) ends any preview.
  useEffect(() => () => {
    if (previewingRef.current) revertRef.current();
  }, []);

  const issues = useMemo(() => findContrastIssues(form.colors), [form.colors]);
  const logoVariants = useMemo(
    () => resolveLogoVariants(form, mediaLogoVariants),
    [form, mediaLogoVariants],
  );
  const logoMismatches = (["light", "dark"] as const).filter(
    (mode) => logoVariants[mode] !== suggestedLogoVariant(form.colors, mode),
  );
  const trimmedName = form.name.trim();

  const setColor = (key: keyof ThemeColors, value: string) => {
    setPresetKey(null);
    setForm((f) => ({ ...f, colors: { ...f.colors, [key]: value.toUpperCase() } }));
  };

  const applyPreset = (key: string, colors: ThemeColors) => {
    setPresetKey(key);
    const logos = suggestedLogoVariants(colors);
    setForm((f) => ({ ...f, colors: { ...colors }, logoVariantLight: logos.light, logoVariantDark: logos.dark }));
  };

  const setLogoVariant = (mode: ThemeColorMode, value: string) => {
    const variant = isLogoVariant(value) ? value : null;
    setForm((f) => (mode === "light" ? { ...f, logoVariantLight: variant } : { ...f, logoVariantDark: variant }));
  };

  // While previewing, the screen follows every edit.
  useEffect(() => {
    if (previewing) {
      applyThemeColors(form.colors);
      applyLogoVariants(logoVariants);
    }
  }, [previewing, form.colors, logoVariants]);

  const togglePreview = () => {
    if (previewing) {
      previewingRef.current = false;
      setPreviewing(false);
      onRevertPreview();
    } else {
      previewingRef.current = true;
      setPreviewing(true);
    }
  };

  const fieldLabel = (field: ThemeColorField) => t(`appearance.theming.fields.${field}.label`);

  return (
    <div className="space-y-6" data-testid="theme-editor">
      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="theme-name">{t("appearance.theming.editor.nameLabel")}</Label>
        <Input
          id="theme-name"
          value={form.name}
          maxLength={200}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t("appearance.theming.editor.namePlaceholder")}
          data-testid="theme-name-input"
        />
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("appearance.theming.editor.presetsTitle")}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("appearance.theming.editor.presetsHint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {THEME_PRESETS.map((preset) => {
            const c = preset.colors;
            const selected = presetKey === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key, c)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
                  selected && "border-primary ring-1 ring-primary",
                )}
                data-testid={`theme-preset-${preset.key}`}
              >
                <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                  <span className="h-6 w-3 rounded-sm border border-black/10" style={{ backgroundImage: `linear-gradient(to bottom, ${c.topbarGradientToLight} 0 25%, ${c.sidebarBgTopLight} 25%, ${c.sidebarBgBottomLight})` }} />
                  <span className="h-6 w-3 rounded-sm border border-black/10" style={{ backgroundImage: `linear-gradient(to bottom, ${c.topbarGradientToDark} 0 25%, ${c.sidebarBgTopDark} 25%, ${c.sidebarBgBottomDark})` }} />
                  <span className="ml-0.5 h-3 w-3 rounded-full" style={{ backgroundColor: c.primaryLight }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">{t(`appearance.theming.presets.${preset.key}`)}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
        <div className="space-y-6">
          {THEME_FIELD_GROUPS.map((group) => (
            <section key={group.id} className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t(`appearance.theming.groups.${group.id}`)}</h4>
              <div className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                {group.fields.map((field) => (
                  <div key={field} className="grid gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-end">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-100">{fieldLabel(field)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t(`appearance.theming.fields.${field}.hint`)}</p>
                    </div>
                    <ColorPicker
                      label={t("appearance.theming.mode.light")}
                      value={form.colors[`${field}Light`]}
                      onChange={(hex) => setColor(`${field}Light`, hex)}
                    />
                    <ColorPicker
                      label={t("appearance.theming.mode.dark")}
                      value={form.colors[`${field}Dark`]}
                      onChange={(hex) => setColor(`${field}Dark`, hex)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="space-y-3" data-testid="theme-logo-section">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("appearance.logo.themeTitle")}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("appearance.logo.themeHint")}</p>
            </div>
            <div className="grid gap-3 rounded-md border border-gray-200 px-3 py-2.5 dark:border-gray-700 sm:grid-cols-2">
              {(["light", "dark"] as const).map((mode) => {
                const own = mode === "light" ? form.logoVariantLight : form.logoVariantDark;
                return (
                  <div key={mode} className="space-y-1.5">
                    <Label className="text-xs">{t(`appearance.logo.mode.${mode}`)}</Label>
                    <Select value={own ?? FOLLOW_MEDIA} onValueChange={(v) => setLogoVariant(mode, v)}>
                      <SelectTrigger data-testid={`theme-logo-${mode}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FOLLOW_MEDIA}>
                          {t("appearance.logo.followMedia", {
                            variant: t(`appearance.logo.variants.${mediaLogoVariants[mode]}`),
                          })}
                        </SelectItem>
                        <SelectItem value="dark_text">{t("appearance.logo.variants.dark_text")}</SelectItem>
                        <SelectItem value="light_text">{t("appearance.logo.variants.light_text")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
          <ThemeChromePreview colors={form.colors} mode="light" logoVariant={logoVariants.light} />
          <ThemeChromePreview colors={form.colors} mode="dark" logoVariant={logoVariants.dark} />
          {logoMismatches.length > 0 && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
              role="status"
              data-testid="theme-logo-warnings"
            >
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t("appearance.logo.mismatchTitle")}
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {logoMismatches.map((mode) => (
                  <li key={mode}>
                    {t("appearance.logo.mismatchItem", {
                      mode: t(`appearance.theming.mode.${mode}`),
                      variant: t(`appearance.logo.variants.${suggestedLogoVariant(form.colors, mode)}`),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {issues.length > 0 && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
              role="status"
              data-testid="theme-contrast-warnings"
            >
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t("appearance.theming.contrast.title")}
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {issues.map((issue) => (
                  <li key={`${issue.mode}-${issue.text}-${issue.background}`}>
                    {t("appearance.theming.contrast.item", {
                      text: fieldLabel(issue.text),
                      background: fieldLabel(issue.background),
                      mode: t(`appearance.theming.mode.${issue.mode}`),
                      ratio: issue.ratio.toFixed(1),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={togglePreview} data-testid="theme-preview-button">
          <Eye className="mr-2 h-4 w-4" />
          {previewing ? t("appearance.theming.editor.stopPreview") : t("appearance.theming.editor.preview")}
        </Button>
        <Button
          type="button"
          onClick={() => onSave({ ...form, name: trimmedName })}
          disabled={saving || !trimmedName}
          data-testid="theme-save-button"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isNew ? t("appearance.theming.editor.create") : t("common.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="mr-2 h-4 w-4" />
          {t("common.cancel")}
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto">{t("appearance.theming.editor.previewHint")}</p>
      </div>
    </div>
  );
}
