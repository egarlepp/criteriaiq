import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupportFeatureDialog } from "@/components/support/support-feature-dialog";
import { ChangeLogContent } from "./ChangeLogDrawer";
import { InterimUpdatesList } from "./InterimUpdatesList";
import { useVersionUpdates } from "@/hooks/use-version-updates";
import { AppVersionInline } from "@/components/shared/AppVersionInline";
import { useBrandingSupportEmail } from "@/hooks/useBrandingAsset";
import {
  Binoculars,
  Clock,
  CalendarSync,
  CheckCircle2,
  Workflow,
  Users,
  Code,
  BarChart3,
  Settings,
  Building2,
  Zap,
  Activity,
  Lock,
  Crown,
  HelpCircle,
  Mail,
  MessageSquarePlus,
  X,
  UserStar,
  UserCheck,
  User,
  UserCog,
  UserPlus,
  UserSearch,
  UserLock,
  UserPen,
  PhoneCall,
  SquareTerminal,
  Compass,
  BookOpen,
  FileText,
  Monitor,
  Server,
  Database,
  Shield,
} from "lucide-react";

export const IntroductionTab = () => {
  const { t } = useTranslation();
  const [showHelpChoiceDialog, setShowHelpChoiceDialog] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const {
    data: versionData,
    isLoading: isVersionLoading,
    isError: isVersionError,
  } = useQuery<{ version: string }>({
    queryKey: ["/api/version"],
    staleTime: 0,
  });
  const version = versionData?.version ?? null;
  const hasResolvedVersion =
    !isVersionLoading || isVersionError || Boolean(version);
  const {
    data: versionUpdates,
    isLoading: isUpdatesLoading,
    isError: isUpdatesError,
    canView: canViewUpdates,
  } = useVersionUpdates();

  const handleGetHelpClick = () => {
    setShowHelpChoiceDialog(true);
  };

  // Admin-configured support email (Configuration → System Settings → Media).
  // When none is set, the "Email Support" option is hidden.
  const { email: supportEmail } = useBrandingSupportEmail();

  const handleEmailSupport = () => {
    setShowHelpChoiceDialog(false);
    if (!supportEmail) return;
    const subject = encodeURIComponent("Inquiry - CriteriaIQ Technical Validation");
    window.open(`mailto:${supportEmail}?subject=${subject}`, '_blank');
  };

  const handleSubmitRequest = () => {
    setShowHelpChoiceDialog(false);
    setShowSupportDialog(true);
  };

  return (
    <div className="space-y-4">
      {/* Header - "Floating Rail" with Global Gradient */}
      <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group">
        {/* 1. GLOBAL BACKGROUND GRADIENT */}
        <div
          className="dark:hidden absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(59,130,246,0.15) 60%, rgba(59,130,246,0.25) 100%)",
          }}
        />
        <div
          className="hidden dark:block absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(31,41,55,1) 0%, rgba(30,58,138,0.4) 70%, rgba(30,58,138,0.6) 100%)",
          }}
        />

        {/* 2. FLEX CONTAINER (Z-Index ensures it sits ON TOP of gradient) */}
        <div className="flex items-stretch h-24 relative z-10">
          {/* LEFT SIDE: Content */}
          <div className="flex-1 flex flex-col justify-center px-4">
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Binoculars data-title-icon className="h-6 w-6" />
                Introduction
              </CardTitle>
              <CardDescription>
                The CriteriaIQ application is
                designed to streamline technical validation project execution
                for internal engineers. It provides collaborative tracking,
                customer portals, and real-time progress monitoring
                capabilities. This comprehensive platform enables teams to
                manage project lifecycles from initial planning through
                successful completion, with robust access controls and detailed
                analytics.
              </CardDescription>
            </CardHeader>

            {/* Decorative Background Icon */}
            <Binoculars
              className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
              style={{ transform: "translateY(-50%) rotate(-12deg)" }}
            />
          </div>

          {/* RIGHT SIDE: The "Floating Rail" */}
          <div className="w-20 bg-[#1e3a8a] dark:bg-blue-900 rounded-lg flex items-center justify-center shadow-md text-white shrink-0 relative overflow-hidden ml-2 group-hover:shadow-lg transition-all duration-300">
            {/* Glass Gloss Effect */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
            <SquareTerminal className="h-8 w-8 text-blue-100" />
          </div>
        </div>
      </Card>
      {/* END Of Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock data-title-icon className="h-5 w-5" />
              <CardTitle className="text-2xl">
                Recent Updates
                {hasResolvedVersion && (
                  <>
                    {" ("}
                    <AppVersionInline
                      version={version}
                      isLoading={isVersionLoading}
                      isError={isVersionError}
                      neutralClassName=""
                      as="span"
                      testId="about-recent-updates-version"
                    />
                    {")"}
                  </>
                )}
              </CardTitle>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" className="flex items-center gap-2">
                  <CalendarSync className="h-4 w-4" />
                  {t("about.versionUpdates.majorReleaseChangeLog")}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[500px] sm:max-w-[500px] overflow-y-auto"
              >
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <CalendarSync className="h-5 w-5 text-[#2563eb] dark:text-blue-400" />
                    {t("about.versionUpdates.majorReleaseChangeLog")}
                  </SheetTitle>
                </SheetHeader>
                <ChangeLogContent />
              </SheetContent>
            </Sheet>
          </div>
        </CardHeader>
        {/* The release highlights (RecentUpdatesContent) stay on Flight Deck
            only; here the card lists this release's interim updates, which
            only internal users see. Outside users get the title and the
            Major Release Change Log button. */}
        {canViewUpdates && (
          <CardContent>
            <div data-testid="about-interim-updates">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t("about.versionUpdates.title")}
                </h3>
                {versionUpdates?.release && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t("about.versionUpdates.since", { release: versionUpdates.release })}
                  </span>
                )}
              </div>
              <InterimUpdatesList
                updates={versionUpdates?.updates}
                release={versionUpdates?.release}
                isLoading={isUpdatesLoading}
                isError={isUpdatesError}
              />
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Workflow data-title-icon className="h-5 w-5" />
            Key Capabilities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Collaborative Workspace
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Shared project tracking with real-time updates for
                    distributed teams and stakeholders.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg">
                  <Code className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Technical Validation Framework
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Structured validation criteria with hierarchical
                    organization and progress tracking.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Advanced Analytics
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Comprehensive reporting with custom reports, trend analysis,
                    and performance metrics.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded-lg">
                  <Settings className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Flexible Configuration
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Customizable workflows, templates, and validation criteria
                    adapted to your needs.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 dark:bg-indigo-900 p-2 rounded-lg">
                  <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Account Portal
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Dedicated customer interface with project visibility and
                    stakeholder collaboration.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-red-100 dark:bg-red-900 p-2 rounded-lg">
                  <Zap className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Real-Time Updates
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Live project status updates via WebSocket connections for
                    instant team coordination.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-cyan-100 dark:bg-cyan-900 p-2 rounded-lg">
                  <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Comprehensive Audit Trail
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Complete activity logging and change tracking for compliance
                    and accountability.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-pink-100 dark:bg-pink-900 p-2 rounded-lg">
                  <Lock className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Role-Based Access Control
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Granular permissions with MFA support ensuring secure access
                    management.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Users data-title-icon className="h-5 w-5" />
            User Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            {/* Column 1: Admin, Customer, Engineer, Guest */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-red-100 dark:bg-red-900 p-2 rounded-lg">
                  <UserStar className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Admin
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Full system administrator access
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-900 p-2 rounded-lg">
                  <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Customer
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    External customer access to assigned projects
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                  <UserCog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Engineer
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Solution Engineer with project management access
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                  <UserPlus className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Guest
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Limited read-only access
                  </p>
                </div>
              </div>
            </div>

            {/* Column 2: Sales, Services, Support, Leader */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-lg">
                  <UserPen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Sales
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Sales team access to projects and analytics
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded-lg">
                  <UserSearch className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Services
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Professional Services team access
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-cyan-100 dark:bg-cyan-900 p-2 rounded-lg">
                  <PhoneCall className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Support
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Customer Support team access
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 dark:bg-indigo-900 p-2 rounded-lg">
                  <Crown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Leader
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Leadership access to projects and reporting
                  </p>
                </div>
              </div>
            </div>

            {/* Column 3: CX, Product, Partner */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-pink-100 dark:bg-pink-900 p-2 rounded-lg">
                  <UserCheck className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    CX
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Customer Experience team access
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg">
                  <UserLock className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Product
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Product team access to analytics and feedback
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-amber-100 dark:bg-amber-900 p-2 rounded-lg">
                  <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Partner
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Partner organization access
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Code data-title-icon className="h-5 w-5" />
            Technology Stack
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <Monitor className="h-4 w-4" />
                Frontend
              </h4>
              <ul className="text-sm text-[#00050d] dark:text-gray-300 space-y-1">
                <li>• React 19 with TypeScript for type-safe development</li>
                <li>• Vite build system with HMR for fast local development</li>
                <li>• Tailwind CSS with shadcn/ui components</li>
                <li>• TanStack Query v5 for efficient data fetching</li>
                <li>• Wouter for lightweight routing</li>
                <li>• React Hook Form with Zod v4 validation</li>
                <li>• Tiptap &amp; TinyMCE for rich text editing</li>
                <li>• WebSocket integration for real-time updates</li>
                <li>• i18next for internationalization (6 languages)</li>
                <li>• Framer Motion for animations</li>
                <li>• Recharts for data visualization</li>
                <li>• DnD Kit for drag-and-drop interactions</li>
                <li>• react-grid-layout &amp; Gridstack for dashboard customization</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <Server className="h-4 w-4" />
                Backend
              </h4>
              <ul className="text-sm text-[#00050d] dark:text-gray-300 space-y-1">
                <li>• Node.js with Express 5 and TypeScript (ES modules)</li>
                <li>• Drizzle ORM with PostgreSQL dialect</li>
                <li>• Custom session-based auth with MFA (TOTP, WebAuthn, recovery codes)</li>
                <li>• AES-256-GCM encryption and rate limiting</li>
                <li>• WebSocket Manager (singleton, auto-reconnect)</li>
                <li>• Multer for secure file uploads</li>
                <li>• Nodemailer (SMTP) &amp; Microsoft Graph sendMail for email delivery</li>
                <li>• Salesforce CRM integration via jsforce</li>
                <li>• OpenAI API integration for AI features</li>
                <li>• jsPDF &amp; Puppeteer for PDF export and rendering</li>
                <li>• croner for scheduled task automation</li>
                <li>• Passport.js &amp; OpenID Connect for OAuth</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <Database className="h-4 w-4" />
                Database Design
              </h4>
              <ul className="text-sm text-[#00050d] dark:text-gray-300 space-y-1">
                <li>• PostgreSQL via self-hosted container deployment</li>
                <li>• Drizzle ORM with comprehensive schema definitions</li>
                <li>• Database-backed session storage</li>
                <li>• Custom boot-time SQL migration runner (numbered migrations/)</li>
                <li>• Schema snapshot lint gate enforces migration discipline</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-[#0550f0] dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4" />
                Security &amp; Authentication
              </h4>
              <ul className="text-sm text-[#00050d] dark:text-gray-300 space-y-1">
                <li>• Secure cookie-based sessions with CSRF protection</li>
                <li>• bcrypt password hashing</li>
                <li>• MFA: TOTP, SimpleWebAuthn v13 (passkeys), recovery codes</li>
                <li>• Role-based access control with sub-section permissions</li>
                <li>• Trusted device token management</li>
                <li>• Configurable rate limiting for authentication</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Activity data-title-icon className="h-5 w-5" />
            Getting Help
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <ul className="text-sm text-[#00050d] dark:text-gray-300 space-y-1">
              <li>• Review the Clear2Close tab for internal user guidance</li>
              <li>• Check the Documentation tab for technical details</li>
              <li>• Use the Language Translation tab for i18n management</li>
              <li>• Access Support Features tab for requests and roadmap</li>
            </ul>
            <Button onClick={handleGetHelpClick}>
              <HelpCircle className="h-4 w-4 mr-2" />
              Contact Support or Submit a Request
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Choice Dialog */}
      <Dialog open={showHelpChoiceDialog} onOpenChange={setShowHelpChoiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600" />
              How can we help you?
            </DialogTitle>
            <DialogDescription>
              Choose how you'd like to get support
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {supportEmail && (
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={handleEmailSupport}
            >
              <Mail className="h-5 w-5 mr-3 text-blue-600" />
              <div className="text-left">
                <div className="font-medium">Email Support</div>
                <div className="text-sm text-muted-foreground">
                  Open your email client to send us a message
                </div>
              </div>
            </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={handleSubmitRequest}
            >
              <MessageSquarePlus className="h-5 w-5 mr-3 text-green-600" />
              <div className="text-left">
                <div className="font-medium">Submit a Request</div>
                <div className="text-sm text-muted-foreground">
                  Report an issue or request a new feature
                </div>
              </div>
            </Button>
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button onClick={() => setShowHelpChoiceDialog(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Support Feature Dialog */}
      <SupportFeatureDialog
        open={showSupportDialog}
        onOpenChange={setShowSupportDialog}
        openedFromGetHelp={true}
        prefilledData={{ type: "issue" }}
        onSuccess={() => setShowSupportDialog(false)}
      />
    </div>
  );
};
