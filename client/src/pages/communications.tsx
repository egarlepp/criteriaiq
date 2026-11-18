import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import React, { useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from 'wouter';
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Mail, Mails, PencilRuler, Megaphone, TicketsPlane, Webhook } from "lucide-react";

import EmailDesignsSection from "@/components/communications/email-designs/EmailDesignsSection";
import EmailLogsSection from "@/components/communications/email-logs/EmailLogsSection";
import EmailTemplatesSection from "@/components/communications/email-templates/EmailTemplatesSection";
import { ConfigTabSkeleton } from "@/components/configuration/ConfigTabSkeleton";
import { redirectToSignIn } from "@/lib/sign-in-redirect";

// System Announcements, Flight Deck and Webhooks were the Configuration >
// Messaging & Alerts views. They stay admin-only and keep the
// `config.email-configuration` permission section, and are lazy-loaded so
// the email tabs don't pull in their editors. For admins they are preloaded
// once the page is idle, so opening one is as instant as the email tabs.
const loadAnnouncements = () => import("@/components/configuration/AnnouncementsManager");
const loadFlightDeck = () => import("@/components/configuration/FlightDeckRulesManager");
const loadWebhooks = () => import("@/components/communications/webhooks/WebhooksSection");
const AnnouncementsManager = lazy(() => loadAnnouncements().then((m) => ({ default: m.AnnouncementsManager })));
const FlightDeckRulesManager = lazy(() => loadFlightDeck().then((m) => ({ default: m.FlightDeckRulesManager })));
const WebhooksSection = lazy(loadWebhooks);

const ALLOWED_TABS = ['email-logs', 'email-templates', 'email-designs', 'system-announcements', 'flight-deck', 'webhooks'];
const ADMIN_TABS = ['system-announcements', 'flight-deck', 'webhooks'];

export default function Communications() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  
  const { canView: canViewSection } = usePermissions();

  // Tab state - Read from URL parameters
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const allowedTabs = ALLOWED_TABS;
    return tabParam && allowedTabs.includes(tabParam) 
      ? tabParam 
      : 'email-logs';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Listen for URL parameter changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const allowedTabs = ALLOWED_TABS;
    if (tabParam && allowedTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location]);

  // Listen for popstate events (triggered by sidebar navigation)
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ALLOWED_TABS.includes(tabParam)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle tab changes and update URL
  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
    // Update URL without triggering a page reload
    const newUrl = `/admin?tab=${tabValue}`;
    window.history.pushState(null, '', newUrl);
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading]);

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  // Tab menu items
  const tabItems = [
    {
      id: "email-logs",
      name: "Email Logs",
      icon: Mail,
      description: "Email Logs and Tracking"
    },
    {
      id: "email-templates",
      name: "Email Templates",
      icon: Mails,
      description: "Template Management and Variables"
    },
    {
      id: "email-designs",
      name: "Email Designs",
      icon: PencilRuler,
      description: "Manage reusable email designs"
    },
    {
      id: "system-announcements",
      name: "System Announcements",
      icon: Megaphone,
      description: "Broadcast in-app announcements"
    },
    {
      id: "flight-deck",
      name: "Flight Deck",
      icon: TicketsPlane,
      description: "Flight Deck rules and tips"
    },
    {
      id: "webhooks",
      name: "Webhooks",
      icon: Webhook,
      description: "Outbound webhooks"
    }
  ].filter(item => ADMIN_TABS.includes(item.id)
    ? user?.role === "Admin" && canViewSection("config.email-configuration")
    : canViewSection("communications." + item.id));

  const showsAdminTabs = tabItems.some(item => ADMIN_TABS.includes(item.id));
  useEffect(() => {
    if (!showsAdminTabs) return;
    const preload = () => { void loadAnnouncements(); void loadFlightDeck(); void loadWebhooks(); };
    const id = window.setTimeout(preload, 300);
    return () => window.clearTimeout(id);
  }, [showsAdminTabs]);

  useEffect(() => {
    if (tabItems.length > 0 && !tabItems.some(item => item.id === activeTab)) {
      handleTabChange(tabItems[0].id);
    }
  }, [tabItems.map(t => t.id).join(","), activeTab]);

  if (tabItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Mail className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Access Restricted</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You don't have permission to view any communications sections.</p>
      </div>
    );
  }

  return (
    <div data-testid="communications" className="space-y-0">
      <div className="max-w-full mx-auto space-y-6 h-full">     
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

          {/* Tab Content with standard spacing */}
          <div>
            <TabsContent value="email-logs" className="mt-0 space-y-6">
              <EmailLogsSection activeTab={activeTab} />
            </TabsContent>
            <TabsContent value="email-templates" className="mt-0 space-y-6">
              <EmailTemplatesSection activeTab={activeTab} />
            </TabsContent>
            <TabsContent value="email-designs" className="mt-0 space-y-6">
              <EmailDesignsSection activeTab={activeTab} />
            </TabsContent>
            <TabsContent value="system-announcements" className="mt-0 space-y-6">
              {activeTab === "system-announcements" && (
                <Suspense fallback={<ConfigTabSkeleton testId="communications-tab-loading" />}>
                  <AnnouncementsManager user={user ?? null} />
                </Suspense>
              )}
            </TabsContent>
            <TabsContent value="flight-deck" className="mt-0 space-y-6">
              {activeTab === "flight-deck" && (
                <Suspense fallback={<ConfigTabSkeleton testId="communications-tab-loading" />}>
                  <FlightDeckRulesManager user={user ?? null} />
                </Suspense>
              )}
            </TabsContent>
            <TabsContent value="webhooks" className="mt-0 space-y-6">
              {activeTab === "webhooks" && (
                <Suspense fallback={<ConfigTabSkeleton testId="communications-tab-loading" />}>
                  <WebhooksSection activeTab={activeTab} />
                </Suspense>
              )}
            </TabsContent>
          </div>
        </Tabs>

      </div>
    </div>
  );
}
