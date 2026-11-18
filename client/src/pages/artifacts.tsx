import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SubNavPopover } from "@/components/ui/sub-nav-popover";
import { FileText, Link } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { DocumentsSection, LinksSection } from "@/components/artifacts";
type ArtifactView = "documents" | "links";

export default function ArtifactsPage() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<ArtifactView>("documents");

  // Extract tab from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['documents', 'links'].includes(tabParam)) {
      setActiveView(tabParam as ArtifactView);
    }
  }, [location]);

  // Listen for navigation from sidebar accordion
  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ['documents', 'links'].includes(tabParam)) {
        setActiveView(tabParam as ArtifactView);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveView(value as ArtifactView);
    const newUrl = `/artifacts?tab=${value}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const toggleOptions = [
    {
      id: "documents" as const,
      label: "Documents",
      icon: FileText,
      description: "Manage project documents and shared resources"
    },
    {
      id: "links" as const,
      label: "Links",
      icon: Link,
      description: "Manage useful links and resources for projects"
    }
  ];

  // Memoize components to prevent unnecessary re-renders
  const componentsMap = useMemo(() => ({
    documents: <DocumentsSection key="documents" searchTerm="" selectedType="all" selectedSolution="all" />,
    links: <LinksSection key="links" searchTerm="" selectedType="all" selectedSolution="all" />
  }), []);

  const renderActiveSection = () => {
    return componentsMap[activeView] || componentsMap.documents;
  };



  const handleUploadDocument = () => {
    setActiveView("documents");
    // Use requestAnimationFrame for smoother transition
    requestAnimationFrame(() => {
      const trigger = document.querySelector('[data-upload-document]') as HTMLButtonElement;
      if (trigger) {
        trigger.click();
      }
    });
  };

  const handleCreateLink = () => {
    setActiveView("links");
    // Use requestAnimationFrame for smoother transition
    requestAnimationFrame(() => {
      const trigger = document.querySelector('[data-create-link]') as HTMLButtonElement;
      if (trigger) {
        trigger.click();
      }
    });
  };

  return (
    <TooltipProvider>
      <div data-testid="artifacts" className="space-y-4">
        {/* Tab Navigation - Success Criteria Standard */}
        <Tabs value={activeView} onValueChange={handleTabChange} className="pt-0">
          <SubNavPopover items={toggleOptions} activeId={activeView} onSelect={handleTabChange} title="Artifacts Navigation" />

          <div style={{ marginTop: '8px' }}>
            <TabsContent value="documents" className="space-y-4">
              {componentsMap.documents}
            </TabsContent>
            <TabsContent value="links" className="space-y-4">
              {componentsMap.links}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}