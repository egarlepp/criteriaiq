import React, { Suspense, useEffect } from "react";
// Route chunks load via lazyWithReload (not React.lazy directly) so a stale
// chunk after a deploy — "Failed to fetch dynamically imported module" — does a
// one-time recovery reload instead of crashing into the error boundary.
import { lazyWithReload as lazy } from "@/lib/lazy-with-reload";
import { Switch, Route, useRoute, useLocation } from "wouter";
import { recordNavigationBreadcrumb } from "@/lib/breadcrumb-tracker";
import { isProfileEditorTab } from "@/components/accounts/profile-editor-types";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/sidebar";
import { PageLayout } from "@/components/layout/page-layout";
import ErrorBoundary from "@/components/errors/error-boundary";
import { GlobalErrorHandler } from "@/components/errors/global-error-handler";
import MFAEnforcementDialog from "@/components/security/MFAEnforcementDialog";
import { AuthShell } from "@/components/shared/AuthShell";
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { CelebrationOverlay } from "@/components/ui/CelebrationOverlay";
import { FlightDeckModal } from "@/components/flight-deck/FlightDeckModal";
import { ForcePasswordChangeCard } from "@/components/accounts/ForcePasswordChangeCard";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AdminRedirects } from "@/components/layout/admin-redirects";
import { DashboardProvider } from "@/contexts/dashboard-context";
import { PersonaProvider } from "@/contexts/PersonaContext";
import { Plus, Settings, Users, Target, CheckCircle, FolderOpen, BarChart3, Home, Brain, Activity, Mail, TrendingUp, Archive, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrandingAsset } from "@/hooks/useBrandingAsset";
import { ActiveThemeApplier } from "@/hooks/useActiveTheme";

/**
 * Admin-customizable subtle watermark behind every authenticated page.
 * Driven by the `page_bg` slot in Admin → Appearance → Media. Renders nothing
 * when no override is set — the existing `bg-gray-50 dark:bg-gray-900`
 * keeps the flat-color appearance for installs that haven't customized.
 */
// Old /profile links (Flight Deck checklist items, bookmarks) open My Settings
// on the requested tab; the sidebar owns the editor and reads ?profile=.
function ProfileRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    params.delete("tab");
    params.set("profile", isProfileEditorTab(tab) ? tab : "profile");
    setLocation(`/?${params.toString()}`, { replace: true });
  }, [setLocation]);
  return null;
}

// Reports moved from /analytics (Library and Calendar tabs) to /reports, where
// the calendar is part of the page. Old bookmarks and emailed links still work:
// /analytics?tab=calendar opens the calendar view, anything else the library.
// Report Builder was archived (archive/analytics-builders/), so /report-builder
// opens Reports too.
function ReportsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    setLocation(tab === "calendar" ? "/reports?view=calendar" : "/reports", { replace: true });
  }, [setLocation]);
  return null;
}

function PageBackgroundLayer() {
  const asset = useBrandingAsset("page_bg");
  if (!asset.url) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none z-0 print:hidden"
      style={{
        backgroundImage: `url(${asset.url})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundSize: "cover",
        opacity: asset.opacity / 100,
      }}
    />
  );
}

const Setup = lazy(() => import("@/pages/setup"));
const Landing = lazy(() => import("@/pages/landing"));
const Overview = lazy(() => import("@/pages/overview"));
const CreateProject = lazy(() => import("@/pages/create-project"));
const EditProject = lazy(() => import("@/pages/edit-project"));
const EditTemplate = lazy(() => import("@/components/templates/EditTemplate"));
const Artifacts = lazy(() => import("@/pages/artifacts"));
const CustomerDashboard = lazy(() => import("@/pages/customer-dashboard"));
const Reports = lazy(() => import("@/pages/reports"));
const Tags = lazy(() => import("@/components/configuration/TagsManager"));
const SuccessCriteria = lazy(() => import("@/pages/success-criteria"));
const Admin = lazy(() => import("@/pages/admin"));
const Project = lazy(() => import("@/pages/project"));
const ProjectDetail = lazy(() => import("@/pages/project-detail"));
const ProjectAudit = lazy(() => import("@/components/project-detail/ProjectAudit"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const SsoError = lazy(() => import("@/pages/sso-error"));
const NotFound = lazy(() => import("@/pages/not-found"));
const About = lazy(() => import("@/pages/about"));
const GettingStarted = lazy(() => import("@/pages/getting-started"));
const AIRisk = lazy(() => import("@/components/ai-assessments/AIRiskManagement"));
const ErrorTest = lazy(() => import("@/components/errors/ErrorTest"));
const Templates = lazy(() => import("@/pages/templates"));
const SupportFeatures = lazy(() => import("@/components/support/SupportFeatures"));
const OutcomesDashboard = lazy(() => import("@/components/outcomes/OutcomesDashboard"));

function Router() {
  const { isAuthenticated, isLoading, user, isMfaRequired, hasCompleteMfa } = useAuth();

  const [location] = useLocation();

  // Record a navigation breadcrumb on every route change so the Error Audit
  // Log can show the page the user was on when an error fired.
  useEffect(() => {
    recordNavigationBreadcrumb(location);
  }, [location]);

  const [, isSetupRoute] = useRoute("/setup");

  if (isSetupRoute) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <Setup />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <Switch>
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/sso/error" component={SsoError} />
          <Route component={Landing} />
        </Switch>
      </Suspense>
    );
  }

  if (user?.forcePasswordChange) {
    // The force-password-change screen reuses the same chrome as the
    // login page (gradient + criteriaiq-logo_white watermark +
    // theme toggle + Get Help + language switcher + version footer)
    // so the operator never feels like they were dropped on a
    // different page. Same fix as task-432, applied to the sibling
    // pre-app blocking screen. See task-433.
    return (
      <AuthShell>
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <ForcePasswordChangeCard
            onComplete={() => {
              window.location.reload();
            }}
          />
        </div>
      </AuthShell>
    );
  }

  if (isMfaRequired) {
    // The MFA enforcement screen reuses the same chrome as the
    // login page (gradient + criteriaiq-logo_white watermark +
    // theme toggle + Get Help + language switcher + version footer)
    // so the operator never feels like they were dropped on a
    // different page. See task-432.
    return (
      <AuthShell>
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <MFAEnforcementDialog
            isOpen={true}
            onComplete={() => {
              window.location.reload();
            }}
          />
        </div>
      </AuthShell>
    );
  }

  const showAnnouncements = user && !['Customer', 'Partner', 'Guest'].includes(user.role || '');

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900 overflow-hidden relative print:block print:h-auto print:overflow-visible print:bg-white">
      <PageBackgroundLayer />
      <Sidebar user={user as any} />
      <main className="flex-1 flex flex-col overflow-hidden print:block print:overflow-visible">
        {/* One PageLayout for every route, outside the Suspense boundary, so
            the header, Admin menu and tab bar stay mounted while a page's code
            loads; only the page area shows the skeleton. Routes use children,
            not an inline component function, which made a new component type
            on every render and remounted the whole page, header included. */}
        <AdminRedirects />
        <PageLayout>
          <Suspense fallback={<PageSkeleton />}>
            <Switch>
              <Route path="/artifacts"><Artifacts /></Route>
              <Route path="/"><Overview /></Route>
              <Route path="/create"><CreateProject /></Route>
              <Route path="/create-project"><CreateProject /></Route>
              <Route path="/edit-project/:id">{(params) => <EditProject params={params} />}</Route>
              <Route path="/templates"><Templates /></Route>
              <Route path="/edit-template"><EditTemplate /></Route>
              <Route path="/success-criteria"><SuccessCriteria /></Route>
              <Route path="/project"><Project /></Route>
              <Route path="/project/:id"><ProjectDetail /></Route>
              <Route path="/project/:id/audit">{(params) => <ProjectAudit params={params} />}</Route>
              {/* Old Admin URLs; AdminRedirects sends them to /admin. */}
              <Route path="/archive-management">{null}</Route>
              <Route path="/account"><CustomerDashboard /></Route>
              <Route path="/account-portal"><CustomerDashboard /></Route>
              <Route path="/reports"><Reports /></Route>
              {/* Old Reports URLs and the archived Report Builder; ReportsRedirect sends them to /reports. */}
              <Route path="/analytics"><ReportsRedirect /></Route>
              <Route path="/report-builder"><ReportsRedirect /></Route>
              <Route path="/tags"><Tags /></Route>
              <Route path="/admin"><Admin /></Route>
              <Route path="/config">{null}</Route>
              <Route path="/communications">{null}</Route>
              <Route path="/ai-risk"><AIRisk /></Route>
              <Route path="/ai-risk-management"><AIRisk /></Route>
              <Route path="/outcomes-dashboard"><OutcomesDashboard /></Route>
              <Route path="/getting-started"><GettingStarted /></Route>
              <Route path="/about"><About /></Route>
              <Route path="/support-features"><SupportFeatures /></Route>
              <Route path="/error-test"><ErrorTest /></Route>
              <Route path="/profile"><ProfileRedirect /></Route>
              <Route><NotFound /></Route>
            </Switch>
          </Suspense>
        </PageLayout>
      </main>
      <AnnouncementBanner enabled={!!showAnnouncements} />
      <CelebrationOverlay />
      <FlightDeckModal />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary showDetails={false}>
      <ThemeProvider defaultTheme="light">
        <QueryClientProvider client={queryClient}>
          <ActiveThemeApplier />
          <PersonaProvider>
            <GlobalErrorHandler>
              <TooltipProvider>
                <DashboardProvider>
                  <Router />
                  <Toaster />
                </DashboardProvider>
              </TooltipProvider>
            </GlobalErrorHandler>
          </PersonaProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
