// Views of Admin › Appearance (`/admin?tab=appearance&subtab=<view>`).
// Listed as sidebar children in sidebar-nav-config.ts.
export const APPEARANCE_SUB_TABS = ["theming", "media"] as const;

export type AppearanceSubTab = (typeof APPEARANCE_SUB_TABS)[number];

export function isAppearanceSubTab(value: string | null | undefined): value is AppearanceSubTab {
  return (APPEARANCE_SUB_TABS as readonly string[]).includes(value ?? "");
}
