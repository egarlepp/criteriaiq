import { useSearch } from "wouter";
import { lazyWithReload as lazy } from "@/lib/lazy-with-reload";

// Every Admin page lives on /admin?tab=… (sidebar-nav-config.ts). The pages
// themselves are still the Configuration, Communications, Archive Management
// and Support Requests screens; this picks the one that renders the tab. Each
// keeps its own permission checks.
const Config = lazy(() => import("@/pages/config"));
const Communications = lazy(() => import("@/pages/communications"));
const ArchiveManagement = lazy(() => import("@/components/configuration/ArchiveManagement"));
const SupportRequestsAdmin = lazy(() => import("@/components/about/SupportRequestsAdmin"));

export const COMMUNICATIONS_TABS = [
  "email-logs",
  "email-templates",
  "email-designs",
  "system-announcements",
  "flight-deck",
  "webhooks",
] as const;

export type AdminHost = "config" | "communications" | "archive" | "support-requests" | "error-log";

/** The screen that renders an /admin tab. Anything else is a Configuration tab. */
export function adminHostFor(tab: string | null): AdminHost {
  if (tab && (COMMUNICATIONS_TABS as readonly string[]).includes(tab)) return "communications";
  if (tab === "archive") return "archive";
  if (tab === "support-requests" || tab === "error-log") return tab;
  return "config";
}

export default function AdminPage() {
  const search = useSearch();
  const host = adminHostFor(new URLSearchParams(search).get("tab"));
  switch (host) {
    case "communications":
      return <Communications />;
    case "archive":
      return <ArchiveManagement />;
    case "support-requests":
      return <SupportRequestsAdmin view="requests" />;
    case "error-log":
      return <SupportRequestsAdmin view="error-log" />;
    default:
      return <Config />;
  }
}
