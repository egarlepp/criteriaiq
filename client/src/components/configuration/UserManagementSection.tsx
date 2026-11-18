import { useRef, RefObject, useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SearchFiltersSection } from "@/components/ui/search-filters-section";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type UserManagementView = "users" | "roles" | "login-mgmt";

interface UserManagementSectionProps {
  hideFilters?: boolean;
  activeSubTab: UserManagementView;
  onSubTabChange: (value: UserManagementView) => void;
  renderUsersContent: (filterContainerRef: RefObject<HTMLDivElement | null>, filterReady: boolean) => React.ReactNode;
  renderRolesContent: (filterContainerRef: RefObject<HTMLDivElement | null>, filterReady: boolean) => React.ReactNode;
  renderLoginManagementContent?: () => React.ReactNode;
  // Filter state for counting
  searchTerm?: string;
  roleFilter?: string;
  healthFilter?: string;
  onClearFilters?: () => void;
}

export default function UserManagementSection({ 
  hideFilters = false,
  activeSubTab,
  onSubTabChange,
  renderUsersContent,
  renderRolesContent,
  renderLoginManagementContent,
  searchTerm = "",
  roleFilter = "all",
  healthFilter = "all",
  onClearFilters
}: UserManagementSectionProps) {
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [filterReady, setFilterReady] = useState(false);

  useEffect(() => {
    if (filterContainerRef.current) {
      setFilterReady(true);
    }
  }, []);

  const handleTabChange = (value: string) => {
    onSubTabChange(value as UserManagementView);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm && searchTerm.trim() !== "") count++;
    if (roleFilter && roleFilter !== "all") count++;
    if (healthFilter && healthFilter !== "all") count++;
    return count;
  }, [searchTerm, roleFilter, healthFilter]);

  const clearAllFilters = () => {
    onClearFilters?.();
  };

  return (
    <TooltipProvider>
      <div data-testid="user-management-section" className="space-y-4">
        
        {!hideFilters && activeSubTab !== "login-mgmt" && (
          <SearchFiltersSection
            activeFilterCount={activeFilterCount}
            onClearFilters={clearAllFilters}
          >
            <div ref={filterContainerRef} />
          </SearchFiltersSection>
        )}

        <Tabs value={activeSubTab} onValueChange={handleTabChange} className=" pt-0">
          {/* Views are the top tab bar (sidebar-nav-config.ts). */}
          <div>
            <TabsContent value="users" className="space-y-2">
              {renderUsersContent(filterContainerRef, filterReady)}
            </TabsContent>
            <TabsContent value="roles" className="space-y-2">
              {renderRolesContent(filterContainerRef, filterReady)}
            </TabsContent>
            {renderLoginManagementContent && (
              <TabsContent value="login-mgmt" className="space-y-2">
                {renderLoginManagementContent()}
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
