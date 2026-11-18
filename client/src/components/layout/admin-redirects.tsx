import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { adminRedirect } from "@/lib/admin-redirects";

/**
 * Sends URLs of Admin pages from before the single /admin page (/config,
 * /communications, /archive-management, About › Support & Features, Account
 * Management › Login Management) to where each page lives now. Renders
 * nothing; the old routes render nothing either, so there is no flash of the
 * old page.
 */
export function AdminRedirects() {
  const [pathname, setLocation] = useLocation();
  const search = useSearch();

  useEffect(() => {
    const target = adminRedirect(pathname, search ? `?${search}` : "", window.location.hash);
    if (target) setLocation(target, { replace: true });
  }, [pathname, search, setLocation]);

  return null;
}
