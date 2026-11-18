import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Image as ImageIcon,
  Images,
  Upload,
  RotateCcw,
  Type,
  Link2,
  CheckCircle2,
  Circle,
  XCircle,
  Monitor,
  PanelTop,
  Layers,
  Save,
  X,
  Trash2,
  Mail,
  Paintbrush,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import type { BrandingAssetRow } from "@/hooks/useBrandingAsset";
import { useBrandingSupportEmail } from "@/hooks/useBrandingAsset";
import type { LucideIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ACTIVE_THEME_QUERY_KEY } from "@/hooks/useActiveTheme";
import { isLogoVariant, type LogoVariant, type LogoVariants } from "@shared/theme-colors";
import { LogoVariantTiles, MEDIA_LOGO_VARIANTS_QUERY_KEY, useMediaLogoVariants } from "./logo-variants";
// Bundled CriteriaIQ graphic, reused across the app for the page watermark,
// the login background and the header's Company Logo until one is uploaded.
// Imported here so the Media page can preview the *actual* bundled graphic
// an admin would otherwise have to imagine.
import criteriaIqLogoBackgroundPath from "@assets/system/branding/criteriaiq-logo_white.png";

// ─── slot catalog (drives the UI; canonical defs live in shared/schema) ──────

type SlotId =
  | "login_logo"
  | "login_bg"
  | "company_logo"
  | "page_bg";

type SlotCategory = "logo" | "background";

interface SlotDef {
  id: SlotId;
  category: SlotCategory;
  labelKey: string;       // i18n key for the section title
  descKey: string;        // i18n key for the helper text under the title
  hasBundledDefault: boolean;  // true → the app renders SOMETHING (gradient, CSS watermark, etc.) when this slot isn't customized. false → the slot is empty until the admin uploads.
}

// Per user policy: the login logo ships no bundled image — a fresh install
// renders no brand wordmark on the sign-in screen until an admin uploads one.
// The Company Logo (header bar, right end) shows the faded CriteriaIQ
// graphic until the customer's own logo is uploaded.
const SLOTS: Record<SlotId, SlotDef> = {
  login_logo:             { id: "login_logo",             category: "logo",       labelKey: "media.slots.loginLogo.label",        descKey: "media.slots.loginLogo.desc",        hasBundledDefault: false },
  login_bg:               { id: "login_bg",               category: "background", labelKey: "media.slots.loginBg.label",          descKey: "media.slots.loginBg.desc",          hasBundledDefault: true  },
  company_logo:           { id: "company_logo",           category: "logo",       labelKey: "media.slots.companyLogo.label",      descKey: "media.slots.companyLogo.desc",      hasBundledDefault: true  },
  page_bg:                { id: "page_bg",                category: "background", labelKey: "media.slots.pageBg.label",           descKey: "media.slots.pageBg.desc",           hasBundledDefault: true  },
};

interface SlotGroup {
  id: string;
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  slotIds: SlotId[];
}

const GROUPS: SlotGroup[] = [
  {
    id: "login-screen",
    titleKey: "media.groups.loginScreen.title",
    descKey: "media.groups.loginScreen.desc",
    icon: Monitor,
    slotIds: ["login_logo", "login_bg"],
  },
  {
    id: "header",
    titleKey: "media.groups.header.title",
    descKey: "media.groups.header.desc",
    icon: PanelTop,
    slotIds: ["company_logo"],
  },
  {
    id: "page",
    titleKey: "media.groups.page.title",
    descKey: "media.groups.page.desc",
    icon: Layers,
    slotIds: ["page_bg"],
  },
];

const LIMITS = {
  logo: { mb: 2, accept: ".png,.jpg,.jpeg,.webp,.svg", mimes: "image/png,image/jpeg,image/webp,image/svg+xml" },
  background: { mb: 5, accept: ".png,.jpg,.jpeg,.webp,.svg", mimes: "image/png,image/jpeg,image/webp,image/svg+xml" },
} as const;

// What does the BUNDLED default look like for each slot? Drives the
// preview thumbnail in the Bundled-default state so admins see the
// actual graphic instead of an opaque "no preview" placeholder. Slot
// ids missing from this map fall through to the generic placeholder.
//
// Sources:
//   - login_bg: the AuthShell renders criteriaiq-logo_white.png at
//     5% opacity over a dark-blue gradient. The watermark IS the
//     visual asset admins recognise; the gradient is just the
//     backdrop colour. Preview the logo, not the gradient.
//   - company_logo: the header renders criteriaiq-logo_white.png at
//     35% opacity on the header gradient until a logo is uploaded.
//   - page_bg: `.page-background-logo` renders the same file at 5%
//     (light) / 10% (dark) centred behind every authenticated page.
type BundledPreview =
  | { kind: "gradient"; css: string; filename: string }
  | { kind: "image"; url: string; filename: string; opacityLight: number; opacityDark: number };

const BUNDLED_PREVIEWS: Partial<Record<SlotId, BundledPreview>> = {
  login_bg: {
    kind: "image",
    url: criteriaIqLogoBackgroundPath,
    filename: "criteriaiq-logo_white.png",
    opacityLight: 0.05,
    opacityDark: 0.1,
  },
  company_logo: {
    kind: "image",
    url: criteriaIqLogoBackgroundPath,
    filename: "criteriaiq-logo_white.png",
    opacityLight: 0.35,
    opacityDark: 0.35,
  },
  page_bg: {
    kind: "image",
    url: criteriaIqLogoBackgroundPath,
    filename: "criteriaiq-logo_white.png",
    opacityLight: 0.05,
    opacityDark: 0.1,
  },
};

// ─── shared status type ─────────────────────────────────────────────────────

type SlotStatus =
  | { kind: "customized"; filename: string }       // admin uploaded; URL reachable
  | { kind: "missing"; filename: string }          // admin uploaded; URL no longer reachable (404)
  | { kind: "bundled" }                            // no upload; app falls back to bundled default
  | { kind: "unconfigured" };                      // no upload AND no bundled default

// ─── main section ────────────────────────────────────────────────────────────

export function MediaSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const assetsQuery = useQuery<BrandingAssetRow[]>({
    queryKey: ["/api/branding/assets"],
    queryFn: async () => {
      const res = await fetch("/api/branding/assets", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const taglineQuery = useQuery<{ text: string | null }>({
    queryKey: ["/api/branding/tagline"],
    queryFn: async () => {
      const res = await fetch("/api/branding/tagline", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const companyLogoUrlQuery = useQuery<{ url: string | null }>({
    queryKey: ["/api/branding/sidebar-logo-url"],
    queryFn: async () => {
      const res = await fetch("/api/branding/sidebar-logo-url", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  // Solution icons — drives both the overview-row indicator (green check
  // with count when ≥1 is uploaded, red X when 0) and the manager card
  // below. Reads from the same /api/solution-icons endpoint the
  // Validation Criteria dropdown consumes, so what an admin sees here
  // matches what end-users get.
  const solutionIconsOverviewQuery = useQuery<Array<{ filename: string }>>({
    queryKey: ["/api/solution-icons"],
  });

  // Orphan scan — DB rows pointing at files that no longer exist on
  // disk. Surfaces as a banner above the overview list whenever count
  // > 0 so the admin can clean up dead "Missing" entries in one click.
  const orphansQuery = useQuery<{ count: number; orphans: { id: number; slot: string; mode: string; url: string }[] }>({
    queryKey: ["/api/branding/orphans"],
    queryFn: async () => {
      const res = await fetch("/api/branding/orphans", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const cleanupOrphansMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/branding/orphans/cleanup", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      showSuccessToast(
        t("common.success"),
        t("media.orphans.cleanupSuccess", { count: data.deleted }),
      );
      qc.invalidateQueries({ queryKey: ["/api/branding/orphans"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/assets"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/public"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/display"] });
    },
    onError: (err: any) => {
      showErrorToast(t("common.error"), err.message ?? t("media.orphans.cleanupFailed"));
    },
  });

  // Reachability map per (slot, mode). For each configured row, kick off
  // an Image() preload and remember whether it loads. We deliberately
  // do NOT use a HEAD fetch: the local `/api/files/*key` route is
  // registered as GET only (see server/routes/misc-routes.ts), so HEAD returns
  // 404 and EVERY freshly uploaded asset would falsely flip to
  // "Missing". `new Image()` follows the same path the actual
  // <img src> tag will use later, so the success/failure semantics
  // match exactly.
  const [reachable, setReachable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const rows = assetsQuery.data ?? [];
    if (rows.length === 0) return;
    let cancelled = false;
    const cleanup: Array<() => void> = [];
    rows.forEach((r) => {
      if (!r.url) return;
      const key = `${r.slot}:${r.mode}`;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setReachable(prev => ({ ...prev, [key]: true }));
      };
      img.onerror = () => {
        if (!cancelled) setReachable(prev => ({ ...prev, [key]: false }));
      };
      img.src = r.url;
      cleanup.push(() => { img.onload = null; img.onerror = null; });
    });
    return () => {
      cancelled = true;
      cleanup.forEach(fn => fn());
    };
  }, [assetsQuery.data]);

  const byKey = (slot: SlotId, mode: "light" | "dark"): BrandingAssetRow | undefined =>
    assetsQuery.data?.find((a) => a.slot === slot && a.mode === mode);

  const statusFor = (slot: SlotId, mode: "light" | "dark"): SlotStatus => {
    const row = byKey(slot, mode);
    if (row?.url) {
      const filename = filenameFromUrl(row.url);
      // Pessimistic until we know — assume reachable while the HEAD is in
      // flight so the admin doesn't see a transient red X on first load.
      const probeResult = reachable[`${slot}:${mode}`];
      if (probeResult === false) {
        return { kind: "missing", filename };
      }
      return { kind: "customized", filename };
    }
    return SLOTS[slot].hasBundledDefault ? { kind: "bundled" } : { kind: "unconfigured" };
  };

  const taglineCustomized = (taglineQuery.data?.text ?? "").trim().length > 0;
  const companyLogoUrlCustomized = (companyLogoUrlQuery.data?.url ?? "").trim().length > 0;


  return (
    <div className="space-y-4">
      {/* ─── Overview card (blue icon, per-slot configured-status summary) ─ */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Images} />
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center gap-2">
            <Images className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t("media.title")}
          </CardTitle>
          <CardDescription>{t("media.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          {/* Orphan banner — surfaces when DB rows point at files that
              are no longer reachable (deploy wiped the volume, upload
              partially failed, etc.). One click cleans them all up. */}
          {orphansQuery.data && orphansQuery.data.count > 0 ? (
            <div className="mb-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-sm text-amber-900 dark:text-amber-200 truncate">
                  {t("media.orphans.banner", { count: orphansQuery.data.count })}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-400 dark:border-amber-700"
                onClick={() => cleanupOrphansMutation.mutate()}
                disabled={cleanupOrphansMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {cleanupOrphansMutation.isPending
                  ? t("common.saving")
                  : t("media.orphans.cleanUp")}
              </Button>
            </div>
          ) : null}
          <div className="rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {(Object.keys(SLOTS) as SlotId[]).map((id) => {
              const slot = SLOTS[id];
              const light = statusFor(id, "light");
              const dark = statusFor(id, "dark");
              const rowState = combineStatusKinds(light.kind, dark.kind);
              // Inject the "Company logo link" row right after the Company
              // Logo — they are configured together.
              const isCompanyLogoRow = id === "company_logo";
              return (
                <Fragment key={id}>
                  <div className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusGlyph kind={rowState} />
                      <span className="truncate text-gray-900 dark:text-gray-100">{t(slot.labelKey)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 text-xs shrink-0">
                      <StatusLine modeKey="media.summary.lightPrefix" status={light} />
                      <StatusLine modeKey="media.summary.darkPrefix" status={dark} />
                    </div>
                  </div>
                  {isCompanyLogoRow ? (
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {companyLogoUrlCustomized ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                        )}
                        <span className="truncate text-gray-900 dark:text-gray-100">
                          {t("media.companyLogoUrl.title")}
                        </span>
                      </div>
                      <span
                        className={`text-xs shrink-0 ${
                          companyLogoUrlCustomized
                            ? "text-green-600 dark:text-green-400 font-medium"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                        title={companyLogoUrlQuery.data?.url ?? undefined}
                      >
                        {companyLogoUrlCustomized
                          ? truncate(companyLogoUrlQuery.data?.url ?? "", 40)
                          : t("media.summary.unconfigured")}
                      </span>
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
            {/* Solution icons row — same indicator language as the rest
                of the list, but the right-hand side surfaces the live
                count from /api/solution-icons. Green check with count
                when ≥1 icon is uploaded; red X when none. */}
            {(() => {
              const iconCount = solutionIconsOverviewQuery.data?.length ?? 0;
              const configured = iconCount > 0;
              return (
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {configured ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" aria-label={t("media.status.customized")} />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" aria-label={t("media.status.missing")} />
                    )}
                    <span className="truncate text-gray-900 dark:text-gray-100">{t("media.solutionIcons.title")}</span>
                  </div>
                  <span className={`text-xs shrink-0 ${configured ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}`}>
                    {t("media.solutionIcons.count", { count: iconCount })}
                  </span>
                </div>
              );
            })()}

            {/* Tagline row — single value, no light/dark split. */}
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {taglineCustomized ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                )}
                <span className="truncate text-gray-900 dark:text-gray-100">{t("media.tagline.title")}</span>
              </div>
              <span className={`text-xs shrink-0 ${taglineCustomized ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                {taglineCustomized
                  ? truncate(taglineQuery.data?.text ?? "", 40)
                  : t("media.summary.unconfigured")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Grouped slot cards: Login Screen, Header, Page Background ──── */}
      {GROUPS.map((group) => (
        <Card key={group.id} className="relative overflow-hidden">
          <DecorativeCardIcon icon={group.icon} />
          <CardHeader className="relative z-10">
            <CardTitle className="flex items-center gap-2 text-base">
              <group.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t(group.titleKey)}
            </CardTitle>
            <CardDescription>{t(group.descKey)}</CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 space-y-6">
            {group.slotIds.map((slotId, idx) => {
              const slot = SLOTS[slotId];
              return (
                <div key={slotId}>
                  {idx > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 -mx-6 mb-6" />
                  )}
                  <SlotSection
                    slot={slot}
                    lightRow={byKey(slot.id, "light")}
                    darkRow={byKey(slot.id, "dark")}
                    lightStatus={statusFor(slot.id, "light")}
                    darkStatus={statusFor(slot.id, "dark")}
                    isLoading={assetsQuery.isLoading}
                  />
                </div>
              );
            })}
            {/* Header group only: the URL the Company Logo links to. Lives in
                the same card so the logo and its link target are co-located. */}
            {group.id === "header" ? (
              <div>
                <div className="border-t border-gray-200 dark:border-gray-700 -mx-6 mb-6" />
                <CompanyLogoUrlSection
                  current={companyLogoUrlQuery.data?.url ?? null}
                  isLoading={companyLogoUrlQuery.isLoading}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {/* ─── CriteriaIQ logo version per mode ─────────────────────────────── */}
      <CriteriaIqLogoCard />

      {/* ─── Tagline override card ────────────────────────────────────────── */}
      <TaglineCard
        current={taglineQuery.data?.text ?? null}
        isLoading={taglineQuery.isLoading}
      />

      {/* ─── Support contact email card ───────────────────────────────────── */}
      <SupportEmailCard />

      {/* ─── Solution Icons admin card ─────────────────────────────────────
          Collection upload surface: list every icon under
          system/solution-icons/, allow upload of new PNG/WEBP icons (≤1 MB),
          delete on demand. Feeds the Solution Icon dropdown in Validation
          Criteria → Solutions and any project card that renders a solution
          chip. */}
      <SolutionIconsManagerCard />
    </div>
  );
}

// ─── overview row helpers ──────────────────────────────────────────────────

function StatusGlyph({ kind }: { kind: SlotStatus["kind"] }) {
  const { t } = useTranslation();
  // "Configured" status — covers admin-uploaded (customized), app-supplied
  // (bundled default). From an admin's perspective both mean "this
  // slot will render something at runtime"; the empty circle is reserved
  // for truly empty slots so the at-a-glance scan reads
  // "do I still need to act here?"
  if (kind === "customized" || kind === "bundled") {
    return (
      <CheckCircle2
        className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0"
        aria-label={
          kind === "customized" ? t("media.status.customized")
          : t("media.status.bundled")
        }
      />
    );
  }
  if (kind === "missing") {
    return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" aria-label={t("media.status.missing")} />;
  }
  return <Circle className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" aria-label={t("media.status.unconfigured")} />;
}

function StatusLine({ modeKey, status }: { modeKey: string; status: SlotStatus }) {
  const { t } = useTranslation();
  if (status.kind === "customized") {
    return (
      <span className="text-gray-500 dark:text-gray-400">
        {t(modeKey)}{" "}
        <span className="text-green-600 dark:text-green-400 font-medium" title={status.filename}>
          {truncate(status.filename, 28)}
        </span>
      </span>
    );
  }
  if (status.kind === "missing") {
    return (
      <span className="text-gray-500 dark:text-gray-400">
        {t(modeKey)}{" "}
        <span className="text-red-600 dark:text-red-400 font-medium" title={status.filename}>
          {t("media.summary.missing")}
        </span>
      </span>
    );
  }
  return (
    <span className="text-gray-500 dark:text-gray-400">
      {t(modeKey)}{" "}
      <span className="text-gray-500 dark:text-gray-400">
        {status.kind === "bundled" ? t("media.summary.bundled") : t("media.summary.unconfigured")}
      </span>
    </span>
  );
}

// Two modes per slot — pick the "worst" state for the row-level glyph so a
// half-configured slot doesn't read as fully customized. Order of badness:
// missing > customized > bundled > unconfigured. Customized + bundled both
// render the green check via StatusGlyph; the differentiation matters only
// for the per-mode text labels (which carry full detail).
function combineStatusKinds(a: SlotStatus["kind"], b: SlotStatus["kind"]): SlotStatus["kind"] {
  if (a === "missing" || b === "missing") return "missing";
  if (a === "customized" || b === "customized") return "customized";
  if (a === "bundled" || b === "bundled") return "bundled";
  return "unconfigured";
}

// ─── per-slot section (renders inside a group card; no outer Card) ──────────

interface SlotSectionProps {
  slot: SlotDef;
  lightRow: BrandingAssetRow | undefined;
  darkRow: BrandingAssetRow | undefined;
  lightStatus: SlotStatus;
  darkStatus: SlotStatus;
  isLoading: boolean;
}

function SlotSection({ slot, lightRow, darkRow, lightStatus, darkStatus, isLoading }: SlotSectionProps) {
  const { t } = useTranslation();
  const limit = LIMITS[slot.category];

  // ─── Mirror toggle ────────────────────────────────────────────────────────
  // "Use same file for light and dark mode" — admins frequently want one
  // logo for both themes. When ON, the Dark panel is replaced by a
  // mirror notice and the Light panel's upload/reset/opacity actions
  // are also applied to the Dark row. Initial state is derived from
  // the data: only ON when both modes point at the SAME non-empty URL.
  // Empty rows default to OFF so an unconfigured slot doesn't pretend a
  // mirror relationship that doesn't exist yet.
  const mirrorInferred = !!(
    lightRow?.url && darkRow?.url && lightRow.url === darkRow.url
  );
  const [mirror, setMirror] = useState<boolean>(mirrorInferred);

  return (
    <div>
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t(slot.labelKey)}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {t(slot.descKey)}
          {" "}
          <span className="text-gray-400 dark:text-gray-500">
            {slot.category === "logo"
              ? t("media.hint.logoLimit", { mb: limit.mb })
              : t("media.hint.bgLimit", { mb: limit.mb })}
          </span>
        </p>
      </div>

      {/* Mirror toggle — every section. */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
        <Checkbox
          checked={mirror}
          onCheckedChange={(v) => setMirror(Boolean(v))}
          aria-label={t("media.mirror.sameForBoth")}
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {t("media.mirror.sameForBoth")}
        </span>
      </label>

      {/* Panels */}
      {mirror ? (
        // Mirror on: render only the Light panel (which doubles as the
        // controller — uploads/resets fan out to dark). The Dark panel
        // becomes a short notice so admins can still see the dark
        // backdrop preview alongside.
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModePanel
            slot={slot}
            mode="light"
            current={lightRow}
            status={lightStatus}
            isLoading={isLoading}
            mirrorPartner="dark"
          />
          <MirrorNotice mode="dark" current={lightRow} isLoading={isLoading} slot={slot} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModePanel slot={slot} mode="light" current={lightRow} status={lightStatus} isLoading={isLoading} />
          <ModePanel slot={slot} mode="dark"  current={darkRow}  status={darkStatus}  isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}

// Read-only panel rendered in the Dark slot when mirror mode is on.
// Mirrors whatever the LIGHT controller renders (custom upload, bundled
// graphic, or bundled gradient) so admins see what the dark side will
// actually look like at runtime, plus the filename. Upload/reset
// controls are intentionally omitted — Light is the single point of
// control when mirror is on.
function MirrorNotice({
  mode,
  current,
  isLoading,
  slot,
}: {
  mode: "light" | "dark";
  current: BrandingAssetRow | undefined;
  isLoading: boolean;
  slot: SlotDef;
}) {
  const { t } = useTranslation();
  const bp = BUNDLED_PREVIEWS[slot.id];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900 opacity-90">
      <div className="flex items-center justify-between mb-3">
        <Label className="text-sm font-semibold">
          {mode === "light" ? t("media.mode.light") : t("media.mode.dark")}
        </Label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("media.mirror.mirroredNote")}
        </span>
      </div>
      <div
        className="rounded border border-dashed border-gray-300 dark:border-gray-600 h-32 flex items-center justify-center mb-3 overflow-hidden relative"
        style={{ backgroundColor: mode === "dark" ? "#0f172a" : "#f8fafc" }}
      >
        {isLoading ? (
          <span className="text-xs text-gray-400">{t("common.loading")}</span>
        ) : current?.url ? (
          // Custom upload — mirror the actual file.
          <img src={current.url} alt={t(slot.labelKey)} className="max-h-full max-w-full object-contain" />
        ) : bp?.kind === "gradient" ? (
          // Bundled gradient — render the gradient so the dark side
          // looks like what runtime will actually show (the gradient
          // is theme-agnostic).
          <div className="absolute inset-0" style={{ background: bp.css }} />
        ) : bp?.kind === "image" ? (
          // Bundled image — render the same white-logo-on-slate
          // treatment the Light panel uses. Keeps the two sides
          // visually identical, which is the whole point of mirror.
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: "#1e293b" }}
          >
            <img src={bp.url} alt={t("media.preview.bundled")} className="max-h-full max-w-full object-contain" style={{ opacity: 0.65 }} />
          </div>
        ) : (
          <span className="text-xs text-gray-400">{t("media.mirror.pendingUpload")}</span>
        )}
      </div>
      {/* Filename mirror — same string the Light panel renders below
          its preview, so the admin can confirm what's being applied
          to both modes from a single glance. */}
      {current?.url ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate" title={current.url}>
          {filenameFromUrl(current.url)}
        </p>
      ) : bp ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate" title={bp.filename}>
          {bp.filename}
        </p>
      ) : null}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("media.mirror.darkInherits")}
      </p>
    </div>
  );
}

// ─── per (slot, mode) panel ──────────────────────────────────────────────────

interface ModePanelProps {
  slot: SlotDef;
  mode: "light" | "dark";
  current: BrandingAssetRow | undefined;
  status: SlotStatus;
  isLoading: boolean;
  /** When set, any upload/reset/opacity action on this panel also fires
   *  against the named partner mode. Used by the mirror toggle so Light
   *  becomes the single point of control while Dark renders as a
   *  read-only mirror notice. */
  mirrorPartner?: "light" | "dark";
}

function ModePanel({ slot, mode, current, status, isLoading, mirrorPartner }: ModePanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
  const [imgBroken, setImgBroken] = useState(false);
  const limit = LIMITS[slot.category];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/branding/assets"] });
    qc.invalidateQueries({ queryKey: ["/api/branding/public"] });
    qc.invalidateQueries({ queryKey: ["/api/branding/display"] });
  };

  const uploadFile = async (file: File) => {
    if (file.size > limit.mb * 1024 * 1024) {
      showErrorToast(
        t("common.error"),
        t("media.errors.tooLarge", { mb: limit.mb }),
      );
      return;
    }
    setUploading(true);
    try {
      // POST to this panel's mode first.
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/branding/assets/${slot.id}/${mode}`,
        { method: "POST", body: form, credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Mirror to the partner mode if the toggle is on. We re-create
      // FormData because the first request consumed the original.
      // A failure in the mirror step shouldn't undo the first upload —
      // surface it, leave the admin to retry.
      if (mirrorPartner) {
        const mirrorForm = new FormData();
        mirrorForm.append("file", file);
        const mirrorRes = await fetch(
          `/api/branding/assets/${slot.id}/${mirrorPartner}`,
          { method: "POST", body: mirrorForm, credentials: "include" },
        );
        if (!mirrorRes.ok) {
          const body = await mirrorRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Mirror to ${mirrorPartner} failed (HTTP ${mirrorRes.status})`);
        }
      }
      showSuccessToast(t("common.success"), t("media.toasts.uploaded"));
      setImgBroken(false);
      invalidate();
    } catch (err: any) {
      showErrorToast(t("common.error"), err.message ?? t("media.errors.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const targets: Array<"light" | "dark"> = mirrorPartner ? [mode, mirrorPartner] : [mode];
      for (const m of targets) {
        const res = await fetch(`/api/branding/assets/${slot.id}/${m}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 204) {
          throw new Error(`HTTP ${res.status}`);
        }
      }
    },
    onSuccess: () => {
      showSuccessToast(t("common.success"), t("media.toasts.reset"));
      setImgBroken(false);
      invalidate();
    },
    onError: () => {
      showErrorToast(t("common.error"), t("media.errors.resetFailed"));
    },
  });

  const opacityMutation = useMutation({
    mutationFn: async (opacity: number) => {
      const targets: Array<"light" | "dark"> = mirrorPartner ? [mode, mirrorPartner] : [mode];
      for (const m of targets) {
        const res = await fetch(
          `/api/branding/assets/${slot.id}/${m}/opacity`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ opacity }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      invalidate();
    },
    onError: () => {
      showErrorToast(t("common.error"), t("media.errors.opacityFailed"));
    },
  });

  const previewOpacity =
    opacityDraft ?? current?.opacity ?? (slot.category === "background" ? 100 : 100);

  // Effective status: trust the top-level prop, but if the <img onError>
  // ever fired we promote the panel to "missing" regardless of what the
  // HEAD probe said (since the actual <img> couldn't render).
  const effective: SlotStatus = imgBroken && current
    ? { kind: "missing", filename: filenameFromUrl(current.url) }
    : status;

  const statusBadge = (() => {
    switch (effective.kind) {
      case "customized":
        return <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{t("media.status.customized")}</span>;
      case "missing":
        return <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1"><XCircle className="h-3 w-3" />{t("media.status.missing")}</span>;
      case "bundled":
        return <span className="text-xs text-gray-500 dark:text-gray-400">{t("media.status.bundled")}</span>;
      case "unconfigured":
      default:
        return <span className="text-xs text-gray-500 dark:text-gray-400">{t("media.status.unconfigured")}</span>;
    }
  })();

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <Label className="text-sm font-semibold">
          {mode === "light" ? t("media.mode.light") : t("media.mode.dark")}
        </Label>
        {statusBadge}
      </div>

      <div
        className="rounded border border-dashed border-gray-300 dark:border-gray-600 h-32 flex items-center justify-center mb-3 overflow-hidden relative"
        style={{
          backgroundColor: mode === "dark" ? "#0f172a" : "#f8fafc",
        }}
      >
        {isLoading ? (
          <span className="text-xs text-gray-400">{t("common.loading")}</span>
        ) : effective.kind === "customized" && current?.url ? (
          <img
            src={current.url}
            alt={t(slot.labelKey)}
            className="max-h-full max-w-full object-contain"
            style={{ opacity: previewOpacity / 100 }}
            onError={() => setImgBroken(true)}
          />
        ) : effective.kind === "missing" ? (
          <div className="flex flex-col items-center gap-1 text-center px-3">
            <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
              {t("media.preview.missing")}
            </span>
          </div>
        ) : effective.kind === "bundled" ? (
          (() => {
            const bp = BUNDLED_PREVIEWS[slot.id];
            if (!bp) {
              // Slot is conceptually "bundled" but we don't have a
              // canonical preview source — fall back to the generic
              // placeholder rather than render nothing.
              return (
                <div className="flex flex-col items-center gap-1 text-center px-3">
                  <ImageIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t("media.preview.bundled")}
                  </span>
                </div>
              );
            }
            if (bp.kind === "gradient") {
              // The gradient IS the preview — admins recognise the
              // login backdrop instantly. No overlay text needed.
              return (
                <div
                  className="absolute inset-0"
                  style={{ background: bp.css }}
                />
              );
            }
            // bp.kind === "image" — the bundled watermark is a WHITE
            // logo (criteriaiq-logo_white.png). The light-mode panel bg
            // is near-white so the watermark would be invisible there;
            // we force a dark slate backdrop for the preview area in
            // both modes so the actual graphic is recognisable. Runtime
            // opacity is 5-15% on the real surfaces; the preview shows
            // it at higher opacity so the admin can identify the
            // graphic.
            return (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: "#1e293b" }}
              >
                <img
                  src={bp.url}
                  alt={t("media.preview.bundled")}
                  className="max-h-full max-w-full object-contain"
                  style={{ opacity: 0.65 }}
                />
              </div>
            );
          })()
        ) : (
          <div className="flex flex-col items-center gap-1 text-center px-3">
            <Upload className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("media.preview.unconfigured")}
            </span>
          </div>
        )}
      </div>

      {/* Filename hint — for customized panels we show the actual stored
          filename so the admin can confirm what's there. For bundled
          panels we show the canonical bundled-asset name from the
          BUNDLED_PREVIEWS map. */}
      {effective.kind === "customized" && current?.url ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate" title={current.url}>
          {filenameFromUrl(current.url)}
        </p>
      ) : effective.kind === "missing" && current?.url ? (
        <p className="text-xs text-red-600 dark:text-red-400 mb-3 truncate" title={current.url}>
          {filenameFromUrl(current.url)}
        </p>
      ) : effective.kind === "bundled" && BUNDLED_PREVIEWS[slot.id] ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate" title={BUNDLED_PREVIEWS[slot.id]!.filename}>
          {BUNDLED_PREVIEWS[slot.id]!.filename}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept={limit.mimes}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
        }}
      />

      <div className="flex gap-2 mb-3">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4 mr-1" />
          {uploading
            ? t("common.saving")
            : current
              ? t("media.actions.replace")
              : t("media.actions.upload")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => resetMutation.mutate()}
          disabled={!current || resetMutation.isPending}
          title={t("media.actions.resetTooltip")}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {slot.category === "background" && current && effective.kind === "customized" ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">{t("media.opacity.label")}</Label>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {previewOpacity}%
            </span>
          </div>
          <Slider
            value={[previewOpacity]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => setOpacityDraft(v[0])}
            onValueCommit={(v) => {
              setOpacityDraft(null);
              opacityMutation.mutate(v[0]);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

// Best-effort filename pull from a (possibly signed) URL. We only show this
// for display, so a malformed URL just falls through to the raw string.
function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, "http://placeholder.local").pathname;
    const last = path.split("/").pop();
    return last && last.length > 0 ? decodeURIComponent(last) : url;
  } catch {
    return url;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ─── tagline override card ───────────────────────────────────────────────────

function TaglineCard({ current, isLoading }: { current: string | null; isLoading: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string>("");

  // Sync draft when the loaded value arrives.
  if (!isLoading && draft === "" && current && current.length > 0) {
    setDraft(current);
  }

  const saveMutation = useMutation({
    mutationFn: async (text: string | null) => {
      const res = await fetch("/api/branding/tagline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: (_d, text) => {
      showSuccessToast(
        t("common.success"),
        text === null ? t("media.toasts.taglineReset") : t("media.toasts.taglineSaved"),
      );
      qc.invalidateQueries({ queryKey: ["/api/branding/tagline"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/public"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/display"] });
    },
    onError: () => {
      showErrorToast(t("common.error"), t("media.errors.taglineFailed"));
    },
  });

  return (
    <Card className="relative overflow-hidden">
      <DecorativeCardIcon icon={Type} />
      <CardHeader className="relative z-10">
        <CardTitle className="text-base flex items-center gap-2">
          <Type className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("media.tagline.title")}
        </CardTitle>
        <CardDescription>{t("media.tagline.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 space-y-3">
        <Input
          value={draft}
          maxLength={500}
          placeholder={t("media.tagline.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isLoading}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(draft.trim().length === 0 ? null : draft.trim())}
            disabled={saveMutation.isPending || isLoading}
          >
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft("");
              saveMutation.mutate(null);
            }}
            disabled={saveMutation.isPending || isLoading || !current}
          >
            <X className="h-4 w-4 mr-1" />
            {t("media.tagline.clear")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── support contact email card ─────────────────────────────────────────────
// Shown on the error page and the About → Get Help "Email Support" option, and
// used as the {{supportEmail}} sample in email previews. Empty = those contact
// links are hidden.
interface ThemeLogoRow {
  name: string;
  isActive: boolean;
  logoVariantLight: string | null;
  logoVariantDark: string | null;
}

/**
 * Which bundled CriteriaIQ logo (navy text or white text) the sidebar shows in
 * light and dark mode, app-wide. A theme can override either mode.
 */
function CriteriaIqLogoCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { variants: saved, isLoading } = useMediaLogoVariants();
  const [draft, setDraft] = useState<LogoVariants | null>(null);
  const value = draft ?? saved;
  const dirty = draft !== null && (draft.light !== saved.light || draft.dark !== saved.dark);

  const themesQuery = useQuery<ThemeLogoRow[]>({ queryKey: ["/api/admin/themes"] });
  const activeTheme = themesQuery.data?.find((row) => row.isActive) ?? null;
  const overriddenModes = (["light", "dark"] as const).filter((mode) =>
    isLogoVariant(mode === "light" ? activeTheme?.logoVariantLight : activeTheme?.logoVariantDark),
  );

  const saveMutation = useMutation({
    mutationFn: async (next: LogoVariants) => apiRequest("PUT", "/api/branding/logo-variants", next),
    onSuccess: async () => {
      setDraft(null);
      showSuccessToast(t("common.success"), t("appearance.logo.toasts.saved"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: MEDIA_LOGO_VARIANTS_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ACTIVE_THEME_QUERY_KEY }),
      ]);
    },
    onError: (err: Error) => {
      showErrorToast(t("common.error"), err.message || t("appearance.logo.toasts.failed"));
    },
  });

  const setMode = (mode: "light" | "dark", variant: LogoVariant) => setDraft({ ...value, [mode]: variant });

  return (
    <Card className="relative overflow-hidden" data-testid="media-criteriaiq-logo">
      <DecorativeCardIcon icon={Paintbrush} />
      <CardHeader className="relative z-10">
        <CardTitle className="text-base flex items-center gap-2">
          <Paintbrush className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("appearance.logo.mediaTitle")}
        </CardTitle>
        <CardDescription>{t("appearance.logo.mediaDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode} className="space-y-1.5">
              <Label className="text-xs">{t(`appearance.logo.mode.${mode}`)}</Label>
              <LogoVariantTiles
                mode={mode}
                value={value[mode]}
                onChange={(variant) => setMode(mode, variant)}
                disabled={isLoading || saveMutation.isPending}
              />
            </div>
          ))}
        </div>
        {activeTheme && overriddenModes.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("appearance.logo.themeOverrides", {
              theme: activeTheme.name,
              modes: overriddenModes.map((mode) => t(`appearance.theming.mode.${mode}`)).join(", "),
            })}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(value)}
            disabled={!dirty || saveMutation.isPending || isLoading}
            data-testid="media-logo-save"
          >
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={!dirty || saveMutation.isPending}>
            <X className="h-4 w-4 mr-1" />
            {t("common.cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SupportEmailCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { email: current, isLoading } = useBrandingSupportEmail();
  const [draft, setDraft] = useState<string>("");

  // Sync draft when the loaded value arrives.
  if (!isLoading && draft === "" && current && current.length > 0) {
    setDraft(current);
  }

  const saveMutation = useMutation({
    mutationFn: async (email: string | null) => {
      const res = await fetch("/api/branding/support-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: (_d, email) => {
      showSuccessToast(
        t("common.success"),
        email === null ? t("media.supportEmail.toasts.cleared") : t("media.supportEmail.toasts.saved"),
      );
      qc.invalidateQueries({ queryKey: ["/api/branding/public"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/display"] });
    },
    onError: (err: Error) => {
      showErrorToast(t("common.error"), err.message || t("media.supportEmail.errors.saveFailed"));
    },
  });

  return (
    <Card className="relative overflow-hidden">
      <DecorativeCardIcon icon={Mail} />
      <CardHeader className="relative z-10">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("media.supportEmail.title")}
        </CardTitle>
        <CardDescription>{t("media.supportEmail.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 space-y-3">
        <Input
          type="email"
          value={draft}
          maxLength={254}
          placeholder={t("media.supportEmail.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isLoading}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(draft.trim().length === 0 ? null : draft.trim())}
            disabled={saveMutation.isPending || isLoading}
          >
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft("");
              saveMutation.mutate(null);
            }}
            disabled={saveMutation.isPending || isLoading || !current}
          >
            <X className="h-4 w-4 mr-1" />
            {t("media.supportEmail.clear")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Company Logo link URL section (renders inside the Header group card) ──

function CompanyLogoUrlSection({
  current,
  isLoading,
}: {
  current: string | null;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string>("");
  const [touched, setTouched] = useState<boolean>(false);

  // Sync draft when the loaded value arrives, but only until the admin
  // first interacts with the input — after that, the local draft is the
  // source of truth.
  if (!isLoading && !touched && draft === "" && current && current.length > 0) {
    setDraft(current);
  }

  const saveMutation = useMutation({
    mutationFn: async (url: string | null) => {
      const res = await fetch("/api/branding/sidebar-logo-url", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: (_d, url) => {
      showSuccessToast(
        t("common.success"),
        url === null ? t("media.companyLogoUrl.toasts.cleared") : t("media.companyLogoUrl.toasts.saved"),
      );
      qc.invalidateQueries({ queryKey: ["/api/branding/sidebar-logo-url"] });
    },
    onError: (err: any) => {
      showErrorToast(t("common.error"), err.message ?? t("media.companyLogoUrl.errors.saveFailed"));
    },
  });

  const trimmed = draft.trim();

  return (
    <div>
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          {t("media.companyLogoUrl.title")}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {t("media.companyLogoUrl.desc")}
        </p>
      </div>
      <div className="space-y-3">
        <Input
          value={draft}
          maxLength={2000}
          placeholder={t("media.companyLogoUrl.placeholder")}
          onChange={(e) => {
            setTouched(true);
            setDraft(e.target.value);
          }}
          disabled={isLoading}
          inputMode="url"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(trimmed.length === 0 ? null : trimmed)}
            disabled={saveMutation.isPending || isLoading}
          >
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft("");
              setTouched(true);
              saveMutation.mutate(null);
            }}
            disabled={saveMutation.isPending || isLoading || !current}
          >
            <X className="h-4 w-4 mr-1" />
            {t("media.companyLogoUrl.clear")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Solution Icons admin card ────────────────────────────────────────────
//
// Collection-style media manager: lists every icon stored under
// `system/solution-icons/` in the active storage provider, lets the admin
// upload a new one (≤1 MB; PNG / WEBP) and delete an existing one. Feeds
// the Solution Icon dropdown in Validation Criteria → Solutions which
// reads from `GET /api/solution-icons` — same endpoint, just reading
// from the new canonical location now.

interface SolutionIcon {
  filename: string;
  displayName: string;
  path: string;
  /** True when an admin has explicitly set a Solution Name via PATCH;
   *  false when displayName is filename-derived (fallback). Drives the
   *  row's "saved" indicator. */
  hasMetadata?: boolean;
}

function SolutionIconsManagerCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Local draft of each row's Solution Name input, keyed by filename.
  // Only diverges from the server-saved displayName while the admin
  // is mid-edit — Save flushes it via PATCH; the query invalidation
  // then refetches and the draft for that row is cleared on the next
  // render via the useEffect below.
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);

  const iconsQuery = useQuery<SolutionIcon[]>({
    queryKey: ["/api/solution-icons"],
  });

  const handleUpload = async (file: File) => {
    const allowedTypes = ["image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showErrorToast(t("media.solutionIcons.invalidType"), t("media.solutionIcons.invalidTypeHint"));
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      showErrorToast(t("media.solutionIcons.tooLarge"), t("media.solutionIcons.tooLargeHint"));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("asset", file);
      const res = await fetch("/api/admin/solution-icons/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || t("media.solutionIcons.uploadFailed"));
      }
      qc.invalidateQueries({ queryKey: ["/api/solution-icons"] });
      showSuccessToast(t("media.solutionIcons.uploaded"), t("media.solutionIcons.uploadedHint"));
    } catch (error: any) {
      showErrorToast(t("media.solutionIcons.uploadFailed"), error?.message ?? t("media.solutionIcons.uploadFailedHint"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      const res = await fetch(`/api/admin/solution-icons/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || t("media.solutionIcons.deleteFailed"));
      }
      qc.invalidateQueries({ queryKey: ["/api/solution-icons"] });
      showSuccessToast(t("media.solutionIcons.deleted"), t("media.solutionIcons.deletedHint"));
    } catch (error: any) {
      showErrorToast(t("media.solutionIcons.deleteFailed"), error?.message ?? t("media.solutionIcons.deleteFailedHint"));
    }
  };

  // Save the admin-edited Solution Name. Empty/whitespace clears the
  // metadata row server-side; the listing then falls back to a
  // filename-derived label.
  const handleSaveName = async (filename: string, draft: string) => {
    setSavingRow(filename);
    try {
      const res = await fetch(`/api/admin/solution-icons/${encodeURIComponent(filename)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || t("media.solutionIcons.saveNameFailed"));
      }
      qc.invalidateQueries({ queryKey: ["/api/solution-icons"] });
      setNameDrafts(prev => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
      showSuccessToast(t("media.solutionIcons.nameSaved"), t("media.solutionIcons.nameSavedHint"));
    } catch (error: any) {
      showErrorToast(t("media.solutionIcons.saveNameFailed"), error?.message ?? t("media.solutionIcons.saveNameFailedHint"));
    } finally {
      setSavingRow(null);
    }
  };

  const icons = iconsQuery.data ?? [];

  return (
    <Card className="relative overflow-hidden">
      <DecorativeCardIcon icon={ImageIcon} />
      <CardHeader className="relative z-10">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("media.solutionIcons.title")}
        </CardTitle>
        <CardDescription>{t("media.solutionIcons.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("media.solutionIcons.count", { count: icons.length })}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? t("media.solutionIcons.uploading") : t("media.solutionIcons.uploadButton")}
          </Button>
        </div>
        {icons.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            {t("media.solutionIcons.empty")}
          </p>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-200 dark:divide-gray-700">
            {icons.map((icon) => {
              // Effective input value: the in-flight draft if the admin
              // is mid-edit, otherwise the server's displayName. Lets
              // the user clear the field to "" without it snapping back
              // to the filename-derived fallback before they save.
              const draft = nameDrafts[icon.filename];
              const inputValue = draft !== undefined ? draft : (icon.hasMetadata ? icon.displayName : "");
              const dirty = draft !== undefined && draft !== (icon.hasMetadata ? icon.displayName : "");
              const isSaving = savingRow === icon.filename;
              return (
                <div
                  key={icon.filename}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900"
                >
                  <img
                    src={icon.path}
                    alt={icon.displayName}
                    className="h-10 w-10 object-contain shrink-0"
                  />
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" title={icon.filename}>
                      {icon.filename}
                    </div>
                    <Input
                      value={inputValue}
                      onChange={(e) => setNameDrafts(prev => ({ ...prev, [icon.filename]: e.target.value }))}
                      placeholder={t("media.solutionIcons.namePlaceholder")}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={!dirty || isSaving}
                    onClick={() => handleSaveName(icon.filename, draft ?? "")}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {isSaving ? t("media.solutionIcons.saving") : t("media.solutionIcons.saveName")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-600 dark:text-red-400 shrink-0"
                    onClick={() => handleDelete(icon.filename)}
                    title={t("media.solutionIcons.deleteTitle")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
