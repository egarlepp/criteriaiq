// Resolves the right branded image URL + opacity for a given slot, picking
// light vs dark based on the current theme. Falls through to bundled
// defaults when the admin hasn't uploaded anything for a slot+mode pair.
//
// Two parallel queries because the login screen renders BEFORE auth, so we split:
//   /api/branding/public   — login-screen slots (login_logo, login_bg) + tagline; no auth
//   /api/branding/display  — in-app slots (company_logo, page_bg); any signed-in role
//
// The Admin › Appearance › Media page reads the full /api/branding/assets
// list itself and invalidates both queries after a change.

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/useAuth";

export type BrandingAssetSlot =
  | "login_logo"
  | "login_bg"
  | "company_logo"
  | "page_bg";

export type BrandingAssetMode = "light" | "dark";

const PUBLIC_SLOTS: BrandingAssetSlot[] = ["login_logo", "login_bg"];

export interface BrandingAssetRow {
  id: number;
  slot: BrandingAssetSlot;
  mode: BrandingAssetMode;
  url: string;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  opacity: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

interface PublicResponse {
  assets: BrandingAssetRow[];
  tagline: string | null;
  supportEmail?: string | null;
}

export interface BrandingAssetResolved {
  url: string | null;       // null when no override is set; consumer falls back to its bundled default
  opacity: number;          // 0–100; the stored value for background slots, or 100 elsewhere
  isLoading: boolean;
  isCustomized: boolean;
}

/**
 * Pre-auth read of login_logo / login_bg + tagline. Used by the landing page.
 * Safe to call from unauthenticated contexts.
 */
function usePublicBranding() {
  return useQuery<PublicResponse>({
    queryKey: ["/api/branding/public"],
    queryFn: async () => {
      const res = await fetch("/api/branding/public", { credentials: "include" });
      if (!res.ok) return { assets: [], tagline: null, supportEmail: null };
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

type DisplayAssetRow = Pick<BrandingAssetRow, "slot" | "mode" | "url" | "opacity">;

/** Signed-in read of the in-app slots (Company Logo, page background), for every role. */
function useDisplayBranding() {
  const { isAuthenticated } = useAuth();
  return useQuery<DisplayAssetRow[]>({
    queryKey: ["/api/branding/display"],
    queryFn: async () => {
      const res = await fetch("/api/branding/display", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Resolve a single branding slot for the current theme. Returns `url: null`
 * when no override is configured — the calling component then renders its
 * existing bundled default (a static `import` from
 * `client/src/assets/system/branding/`).
 */
export function useBrandingAsset(slot: BrandingAssetSlot): BrandingAssetResolved {
  const { theme } = useTheme();
  const mode: BrandingAssetMode = theme === "dark" ? "dark" : "light";
  const isPublic = PUBLIC_SLOTS.includes(slot);

  const publicQ = usePublicBranding();
  const displayQ = useDisplayBranding();

  const rows: DisplayAssetRow[] = isPublic
    ? (publicQ.data?.assets ?? [])
    : (displayQ.data ?? []);

  const match = rows.find((a) => a.slot === slot && a.mode === mode);

  if (!match) {
    return {
      url: null,
      opacity: 100,
      isLoading: isPublic ? publicQ.isLoading : displayQ.isLoading,
      isCustomized: false,
    };
  }

  return {
    url: match.url,
    opacity: match.opacity ?? 100,
    isLoading: false,
    isCustomized: true,
  };
}

/**
 * Returns the admin-overridden login tagline if one is set, otherwise null
 * — callers should fall back to `t('landing.tagline')`.
 */
export function useBrandingTagline(): {
  override: string | null;
  isLoading: boolean;
} {
  const publicQ = usePublicBranding();
  return {
    override: publicQ.data?.tagline ?? null,
    isLoading: publicQ.isLoading,
  };
}

/**
 * Returns the admin-configured support contact email, or null when none is
 * set (callers hide their contact links in that case). Public read — safe
 * from unauthenticated contexts. NOTE: needs a QueryClientProvider; the
 * top-level ErrorBoundary renders outside it and fetches directly instead.
 */
export function useBrandingSupportEmail(): {
  email: string | null;
  isLoading: boolean;
} {
  const publicQ = usePublicBranding();
  return { email: publicQ.data?.supportEmail ?? null, isLoading: publicQ.isLoading };
}

/**
 * Returns the admin-set URL the header's Company Logo links to, or null
 * when none is set (the logo renders without an `<a>` wrapper then). Stored
 * under the former sidebar-logo-link setting. Authenticated read — the
 * header is post-auth.
 */
export function useBrandingSidebarLogoUrl(): {
  url: string | null;
  isLoading: boolean;
} {
  const { isAuthenticated } = useAuth();
  const q = useQuery<{ url: string | null }>({
    queryKey: ["/api/branding/sidebar-logo-url"],
    queryFn: async () => {
      const res = await fetch("/api/branding/sidebar-logo-url", {
        credentials: "include",
      });
      if (!res.ok) return { url: null };
      return res.json();
    },
    enabled: !!isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return { url: q.data?.url ?? null, isLoading: q.isLoading };
}
