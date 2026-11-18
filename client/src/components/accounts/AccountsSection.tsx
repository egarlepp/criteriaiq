import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";

import AccountDirectorySection from "./AccountDirectorySection";
import TeamUsersSection from "./TeamUsersSection";

// Login Management moved to Admin › Team & People.
type AccountsView = "accounts" | "team-users";

// Each view has its own permission (Role Management › Work › Account Management).
const VIEW_SECTIONS: Record<AccountsView, string> = {
  accounts: "project.customers",
  "team-users": "project.team-users",
};

export default function AccountsSection() {
  const [location] = useLocation();
  const { canView } = usePermissions();
  const allowedViews = (Object.keys(VIEW_SECTIONS) as AccountsView[]).filter((view) => canView(VIEW_SECTIONS[view]));
  const allowedKey = allowedViews.join(",");
  const [activeView, setActiveView] = useState<AccountsView>("accounts");

  useEffect(() => {
    const pick = () => {
      const subtabParam = new URLSearchParams(window.location.search).get('subtab');
      const requested = allowedViews.find((view) => view === subtabParam);
      setActiveView(requested ?? allowedViews[0] ?? "accounts");
    };
    pick();
    window.addEventListener('popstate', pick);
    return () => window.removeEventListener('popstate', pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allowedKey stands for allowedViews
  }, [location, allowedKey]);

  return (
    <TooltipProvider>
      <div data-testid="accounts-section" className="space-y-4">
        {/* The view is chosen from the sidebar / top tab bar via ?subtab=. */}
        <Tabs value={activeView} className="pt-0">
          <div>
            <TabsContent value="accounts" className="mt-0 space-y-4">
              <AccountDirectorySection />
            </TabsContent>
            <TabsContent value="team-users" className="mt-0 space-y-4">
              <TeamUsersSection />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
