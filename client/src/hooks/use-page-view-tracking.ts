// Counts a page view each time the person moves to a different page, for
// Admin › Monitoring & Audit › Page Usage. A change of filters or in-page
// tabs that stays on the same page isn't another view. Nothing is sent while
// an Admin is in Persona View Mode, so those visits don't count as the
// persona's. Failures are ignored: a lost count must never bother anyone.
import { useEffect, useRef } from "react";
import { getPersonaActive } from "@/contexts/PersonaContext";
import { pageKeyForLocation } from "@/lib/page-view-key";

export function usePageViewTracking(pathname: string, search: string): void {
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const pageKey = pageKeyForLocation(pathname, search);
    if (!pageKey || pageKey === lastKey.current) return;
    lastKey.current = pageKey;
    if (getPersonaActive()) return;
    void fetch("/api/page-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pageKey }),
    }).catch(() => undefined);
  }, [pathname, search]);
}
