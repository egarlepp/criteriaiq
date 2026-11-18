import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Users,
  Settings,
  HelpCircle,
  KeyRound,
  Mail,
  ClipboardList,
  Columns3,
  ListChecks,
  Wrench,
  X,
  ShieldCheck,
  Clock,
} from "lucide-react";

interface ImportUsersDocumentationProps {
  isOpen: boolean;
  onClose: () => void;
  validRoles?: string[];
  validDepartments?: string[];
  validRegions?: string[];
}

const DEFAULT_ROLES = [
  "Admin", "Manager", "se", "CX", "Engineer", "Support", "Services",
  "Sales", "Product", "Customer", "Guest", "Partner"
];

const DEFAULT_DEPARTMENTS = [
  "C-Level", "HR", "Finance", "Marketing", "Sales", "Operations",
  "Engineering", "Security", "Network", "R&D", "Support", "IT",
  "CX", "Services", "Product", "Other"
];

const DEFAULT_REGIONS = [
  "North America", "South America", "Europe", "Asia Pacific",
  "Middle East & Africa", "Global"
];

export function ImportUsersDocumentation({ isOpen, onClose, validRoles, validDepartments, validRegions }: ImportUsersDocumentationProps) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState("overview");
  const roles = validRoles && validRoles.length > 0 ? validRoles : DEFAULT_ROLES;
  const departments = validDepartments && validDepartments.length > 0 ? validDepartments : DEFAULT_DEPARTMENTS;
  const regions = validRegions && validRegions.length > 0 ? validRegions : DEFAULT_REGIONS;

  const sections = [
    { id: "overview", label: t("accounts.importDocs.sections.overview"), icon: BookOpen },
    { id: "prepare", label: t("accounts.importDocs.sections.prepare"), icon: FileSpreadsheet },
    { id: "columns", label: t("accounts.importDocs.sections.columns"), icon: Columns3 },
    { id: "validation", label: t("accounts.importDocs.sections.validation"), icon: ListChecks },
    { id: "passwords", label: t("accounts.importDocs.sections.passwords"), icon: KeyRound },
    { id: "approval", label: t("accounts.importDocs.sections.approval"), icon: ShieldCheck },
    { id: "emails", label: t("accounts.importDocs.sections.emails"), icon: Mail },
    { id: "after", label: t("accounts.importDocs.sections.after"), icon: Settings },
    { id: "tips", label: t("accounts.importDocs.sections.tips"), icon: Wrench },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[900px] w-full max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t("accounts.importDocs.guideTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("accounts.importDocs.guideDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[calc(85vh-120px)]">
          <nav className="w-52 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3 space-y-0.5 overflow-y-auto">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                    activeSection === section.id
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {section.label}
                </button>
              );
            })}
          </nav>

          <ScrollArea className="flex-1 p-6">
            <div className="max-w-[600px]">
              {activeSection === "overview" && <OverviewSection />}
              {activeSection === "prepare" && <PrepareSection />}
              {activeSection === "columns" && <ColumnsSection roles={roles} departments={departments} regions={regions} />}
              {activeSection === "validation" && <ValidationSection />}
              {activeSection === "passwords" && <PasswordsSection />}
              {activeSection === "approval" && <ApprovalSection />}
              {activeSection === "emails" && <EmailsSection />}
              {activeSection === "after" && <AfterImportSection />}
              {activeSection === "tips" && <TipsSection />}
            </div>
          </ScrollArea>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            {t("accounts.importDocs.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
      <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      {children}
    </h3>
  );
}

function StepNumber({ number }: { number: number }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">
      {number}
    </span>
  );
}

function InfoBox({ children, variant = "info" }: { children: React.ReactNode; variant?: "info" | "warning" | "success" }) {
  const styles = {
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
  };
  const icons = {
    info: <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex gap-2 p-3 rounded-md border text-xs ${styles[variant]}`}>
      {icons[variant]}
      <div>{children}</div>
    </div>
  );
}

function OverviewSection() {
  const { t } = useTranslation();
  const steps = [
    t("accounts.importDocs.overview.step1"),
    t("accounts.importDocs.overview.step2"),
    t("accounts.importDocs.overview.step3"),
    t("accounts.importDocs.overview.step4"),
    t("accounts.importDocs.overview.step5"),
    t("accounts.importDocs.overview.step6"),
  ];
  return (
    <div className="space-y-4">
      <SectionTitle icon={BookOpen}>{t("accounts.importDocs.overview.title")}</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {t("accounts.importDocs.overview.intro")}
      </p>

      <div className="space-y-3 mt-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.overview.howItWorks")}</h4>
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <StepNumber number={i + 1} />
              <p className="text-sm text-gray-600 dark:text-gray-400 pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <InfoBox>
        <Trans
          i18nKey="accounts.importDocs.overview.batchLimit"
          components={{ strong: <strong /> }}
        />
      </InfoBox>
    </div>
  );
}

function PrepareSection() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <SectionTitle icon={FileSpreadsheet}>{t("accounts.importDocs.prepare.title")}</SectionTitle>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.prepare.option1Title")}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <Trans
            i18nKey="accounts.importDocs.prepare.option1Body"
            components={{ strong: <strong /> }}
          />
        </p>

        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-4">{t("accounts.importDocs.prepare.option2Title")}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("accounts.importDocs.prepare.option2Body")}
        </p>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("accounts.importDocs.prepare.acceptedHeader")}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div><code className="text-blue-600 dark:text-blue-400">firstName</code> or <code className="text-blue-600 dark:text-blue-400">first_name</code> or <code className="text-blue-600 dark:text-blue-400">first name</code></div>
            <div><code className="text-blue-600 dark:text-blue-400">lastName</code> or <code className="text-blue-600 dark:text-blue-400">last_name</code> or <code className="text-blue-600 dark:text-blue-400">last name</code></div>
            <div><code className="text-blue-600 dark:text-blue-400">email</code> or <code className="text-blue-600 dark:text-blue-400">email_address</code></div>
            <div><code className="text-blue-600 dark:text-blue-400">title</code> or <code className="text-blue-600 dark:text-blue-400">job_title</code> or <code className="text-blue-600 dark:text-blue-400">job title</code></div>
            <div><code className="text-blue-600 dark:text-blue-400">timezone</code> or <code className="text-blue-600 dark:text-blue-400">time_zone</code></div>
            <div><code className="text-blue-600 dark:text-blue-400">isActive</code> or <code className="text-blue-600 dark:text-blue-400">is_active</code> or <code className="text-blue-600 dark:text-blue-400">active</code></div>
          </div>
        </div>
      </div>

      <InfoBox>
        <Trans
          i18nKey="accounts.importDocs.prepare.skipInstructionRows"
          components={{ code: <code /> }}
        />
      </InfoBox>

      <InfoBox variant="warning">
        <Trans
          i18nKey="accounts.importDocs.prepare.utf8Note"
          components={{ strong: <strong /> }}
        />
      </InfoBox>
    </div>
  );
}

function ColumnsSection({ roles, departments, regions }: { roles: string[]; departments: string[]; regions: string[] }) {
  const { t } = useTranslation();
  const requiredColumns = [
    { name: "firstName", desc: t("accounts.importDocs.columns.required.firstName"), example: "Jane" },
    { name: "lastName", desc: t("accounts.importDocs.columns.required.lastName"), example: "Doe" },
    { name: "email", desc: t("accounts.importDocs.columns.required.email"), example: "jane.doe@company.com" },
    { name: "role", desc: t("accounts.importDocs.columns.required.role"), example: "Engineer" },
    { name: "title", desc: t("accounts.importDocs.columns.required.title"), example: "Solutions Engineer" },
    { name: "department", desc: t("accounts.importDocs.columns.required.department"), example: "Engineering" },
    { name: "region", desc: t("accounts.importDocs.columns.required.region"), example: "North America" },
  ];

  const optionalColumns = [
    { name: "timezone", desc: t("accounts.importDocs.columns.optional.timezone"), example: "America/New_York", default: "America/New_York" },
    { name: "isActive", desc: t("accounts.importDocs.columns.optional.isActive"), example: "true", default: "true" },
    { name: "receiveEmails", desc: t("accounts.importDocs.columns.optional.receiveEmails"), example: "true", default: "true" },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={Columns3}>{t("accounts.importDocs.columns.title")}</SectionTitle>

      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-[10px]">{t("accounts.importDocs.columns.requiredBadge")}</Badge>
        {t("accounts.importDocs.columns.requiredColumns")}
      </h4>
      <div className="border rounded-md overflow-hidden dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importDocs.columns.headerColumn")}</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importDocs.columns.headerDescription")}</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importDocs.columns.headerExample")}</th>
            </tr>
          </thead>
          <tbody>
            {requiredColumns.map((col) => (
              <tr key={col.name} className="border-t border-gray-100 dark:border-gray-700">
                <td className="p-2 font-mono text-blue-600 dark:text-blue-400">{col.name}</td>
                <td className="p-2 text-gray-700 dark:text-gray-300">{col.desc}</td>
                <td className="p-2 text-gray-500 dark:text-gray-400">{col.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5 mt-4">
        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-[10px]">{t("accounts.importDocs.columns.optionalBadge")}</Badge>
        {t("accounts.importDocs.columns.optionalColumns")}
      </h4>
      <div className="border rounded-md overflow-hidden dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importDocs.columns.headerColumn")}</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importDocs.columns.headerDescription")}</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importDocs.columns.headerDefault")}</th>
            </tr>
          </thead>
          <tbody>
            {optionalColumns.map((col) => (
              <tr key={col.name} className="border-t border-gray-100 dark:border-gray-700">
                <td className="p-2 font-mono text-blue-600 dark:text-blue-400">{col.name}</td>
                <td className="p-2 text-gray-700 dark:text-gray-300">{col.desc}</td>
                <td className="p-2 text-gray-500 dark:text-gray-400">{col.default}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Separator className="my-4" />

      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("accounts.importDocs.columns.validDropdownValues")}</h4>

      <div className="space-y-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("accounts.importDocs.columns.rolesLabel")}</p>
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => (
              <Badge key={r} variant="outline" className="text-[10px] font-mono">{r}</Badge>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("accounts.importDocs.columns.departmentsLabel")}</p>
          <div className="flex flex-wrap gap-1">
            {departments.map((d) => (
              <Badge key={d} variant="outline" className="text-[10px] font-mono">{d}</Badge>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("accounts.importDocs.columns.regionsLabel")}</p>
          <div className="flex flex-wrap gap-1">
            {regions.map((r) => (
              <Badge key={r} variant="outline" className="text-[10px] font-mono">{r}</Badge>
            ))}
          </div>
        </div>
      </div>

      <InfoBox>
        <Trans
          i18nKey="accounts.importDocs.columns.caseInsensitiveNote"
          components={{ strong: <strong /> }}
        />
      </InfoBox>
    </div>
  );
}

function ValidationSection() {
  const { t } = useTranslation();
  const items = [
    { check: t("accounts.importDocs.validation.checks.requiredFields"), desc: t("accounts.importDocs.validation.checks.requiredFieldsDesc") },
    { check: t("accounts.importDocs.validation.checks.emailFormat"), desc: t("accounts.importDocs.validation.checks.emailFormatDesc") },
    { check: t("accounts.importDocs.validation.checks.duplicateSystem"), desc: t("accounts.importDocs.validation.checks.duplicateSystemDesc") },
    { check: t("accounts.importDocs.validation.checks.duplicateFile"), desc: t("accounts.importDocs.validation.checks.duplicateFileDesc") },
    { check: t("accounts.importDocs.validation.checks.roleValidation"), desc: t("accounts.importDocs.validation.checks.roleValidationDesc") },
    { check: t("accounts.importDocs.validation.checks.departmentValidation"), desc: t("accounts.importDocs.validation.checks.departmentValidationDesc") },
    { check: t("accounts.importDocs.validation.checks.regionValidation"), desc: t("accounts.importDocs.validation.checks.regionValidationDesc") },
    { check: t("accounts.importDocs.validation.checks.columnHeaders"), desc: t("accounts.importDocs.validation.checks.columnHeadersDesc") },
  ];
  return (
    <div className="space-y-4">
      <SectionTitle icon={ListChecks}>{t("accounts.importDocs.validation.title")}</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <Trans
          i18nKey="accounts.importDocs.validation.intro"
          components={{ strong: <strong /> }}
        />
      </p>

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.validation.whatGetsChecked")}</h4>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">{item.check}:</span>{" "}
              <span className="text-gray-600 dark:text-gray-400">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <InfoBox variant="warning">
        <Trans
          i18nKey="accounts.importDocs.validation.previewNote"
          components={{ strong: <strong /> }}
        />
      </InfoBox>
    </div>
  );
}

function PasswordsSection() {
  const { t } = useTranslation();
  const steps = [
    t("accounts.importDocs.passwords.step1"),
    t("accounts.importDocs.passwords.step2"),
    t("accounts.importDocs.passwords.step3"),
    t("accounts.importDocs.passwords.step4"),
    t("accounts.importDocs.passwords.step5"),
  ];
  return (
    <div className="space-y-4">
      <SectionTitle icon={KeyRound}>{t("accounts.importDocs.passwords.title")}</SectionTitle>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.passwords.defaultPasswordTitle")}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <Trans
            i18nKey="accounts.importDocs.passwords.defaultPasswordIntro"
            components={{ strong: <strong /> }}
          />
        </p>
        <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ml-4 list-disc">
          <li>{t("accounts.importDocs.passwords.bullet1")}</li>
          <li>{t("accounts.importDocs.passwords.bullet2")}</li>
          <li>{t("accounts.importDocs.passwords.bullet3")}</li>
          <li>{t("accounts.importDocs.passwords.bullet4")}</li>
        </ul>
      </div>

      <Separator />

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.passwords.forcedChangeTitle")}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <Trans
            i18nKey="accounts.importDocs.passwords.forcedChangeIntro"
            components={{ strong: <strong /> }}
          />
        </p>
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <StepNumber number={i + 1} />
              <p className="text-xs text-gray-600 dark:text-gray-400 pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <InfoBox variant="success">
        <Trans
          i18nKey="accounts.importDocs.passwords.securityNote"
          components={{ strong: <strong /> }}
        />
      </InfoBox>

      <InfoBox variant="warning">
        <Trans
          i18nKey="accounts.importDocs.passwords.shareSecurelyNote"
          components={{ strong: <strong /> }}
        />
      </InfoBox>
    </div>
  );
}

function ApprovalSection() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <SectionTitle icon={ShieldCheck}>{t("accounts.importDocs.approval.title")}</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {t("accounts.importDocs.approval.intro")}
      </p>

      {/* Three approval scenarios with color-coded indicators */}
      <div className="space-y-3">
        {/* Scenario 1: Domain Allow List */}
        <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4" />
            {t("accounts.importDocs.approval.domainAllowListTitle")}
          </div>
          <p className="text-xs text-green-700 dark:text-green-300 pl-6">
            {t("accounts.importDocs.approval.domainAllowListDesc")}
          </p>
        </div>

        {/* Scenario 2: Access Code */}
        <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-200">
            <KeyRound className="h-4 w-4" />
            {t("accounts.importDocs.approval.accessCodeTitle")}
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 pl-6">
            {t("accounts.importDocs.approval.accessCodeDesc")}
          </p>
        </div>

        {/* Scenario 3: Manual Approval Required */}
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <Clock className="h-4 w-4" />
            {t("accounts.importDocs.approval.manualTitle")}
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 pl-6">
            {t("accounts.importDocs.approval.manualDesc")}
          </p>
        </div>
      </div>

      <InfoBox>
        {t("accounts.importDocs.approval.whereToFind")}
      </InfoBox>
    </div>
  );
}

function EmailsSection() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <SectionTitle icon={Mail}>{t("accounts.importDocs.emails.title")}</SectionTitle>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        <Trans
          i18nKey="accounts.importDocs.emails.intro"
          components={{ strong: <strong /> }}
        />
      </p>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-start gap-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.emails.uncheckedLabel")}</span>{" "}
            <span className="text-gray-600 dark:text-gray-400">{t("accounts.importDocs.emails.uncheckedDesc")}</span>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <X className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.emails.checkedLabel")}</span>{" "}
            <span className="text-gray-600 dark:text-gray-400">{t("accounts.importDocs.emails.checkedDesc")}</span>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <KeyRound className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.emails.accessCodeInEmailLabel")}</span>{" "}
            <span className="text-gray-600 dark:text-gray-400">{t("accounts.importDocs.emails.accessCodeInEmailDesc")}</span>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <Mail className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.emails.templateSelectionLabel")}</span>{" "}
            <span className="text-gray-600 dark:text-gray-400">{t("accounts.importDocs.emails.templateSelectionDesc")}</span>
          </div>
        </div>
      </div>

      <InfoBox>
        <Trans
          i18nKey="accounts.importDocs.emails.batchNote"
          components={{ strong: <strong /> }}
        />
      </InfoBox>
    </div>
  );
}

function AfterImportSection() {
  const { t } = useTranslation();
  const items = [
    {
      title: t("accounts.importDocs.after.updateSpecializationsTitle"),
      desc: t("accounts.importDocs.after.updateSpecializationsDesc"),
      icon: Users,
    },
    {
      title: t("accounts.importDocs.after.sharePasswordTitle"),
      desc: t("accounts.importDocs.after.sharePasswordDesc"),
      icon: KeyRound,
    },
    {
      title: t("accounts.importDocs.after.verifySettingsTitle"),
      desc: t("accounts.importDocs.after.verifySettingsDesc"),
      icon: Shield,
    },
    {
      title: t("accounts.importDocs.after.reviewResultsTitle"),
      desc: t("accounts.importDocs.after.reviewResultsDesc"),
      icon: ClipboardList,
    },
  ];
  return (
    <div className="space-y-4">
      <SectionTitle icon={Settings}>{t("accounts.importDocs.after.title")}</SectionTitle>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        {t("accounts.importDocs.after.intro")}
      </p>

      <div className="space-y-3">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-start gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TipsSection() {
  const { t } = useTranslation();
  const issues = [
    { q: t("accounts.importDocs.tips.missingColumnsQ"), a: t("accounts.importDocs.tips.missingColumnsA") },
    { q: t("accounts.importDocs.tips.emailExistsQ"), a: t("accounts.importDocs.tips.emailExistsA") },
    { q: t("accounts.importDocs.tips.duplicateInFileQ"), a: t("accounts.importDocs.tips.duplicateInFileA") },
    { q: t("accounts.importDocs.tips.invalidValueQ"), a: t("accounts.importDocs.tips.invalidValueA") },
    { q: t("accounts.importDocs.tips.wontUploadQ"), a: t("accounts.importDocs.tips.wontUploadA") },
    { q: t("accounts.importDocs.tips.garbledQ"), a: t("accounts.importDocs.tips.garbledA") },
  ];
  return (
    <div className="space-y-4">
      <SectionTitle icon={Wrench}>{t("accounts.importDocs.tips.title")}</SectionTitle>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.tips.commonIssues")}</h4>

        {issues.map((item, i) => (
          <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{item.q}</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-xs text-gray-600 dark:text-gray-400">{item.a}</p>
            </div>
          </div>
        ))}
      </div>

      <Separator className="my-4" />

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("accounts.importDocs.tips.bestPractices")}</h4>
      <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 ml-4 list-disc">
        <li>{t("accounts.importDocs.tips.bp1")}</li>
        <li>{t("accounts.importDocs.tips.bp2")}</li>
        <li>{t("accounts.importDocs.tips.bp3")}</li>
        <li>{t("accounts.importDocs.tips.bp4")}</li>
        <li>{t("accounts.importDocs.tips.bp5")}</li>
        <li>{t("accounts.importDocs.tips.bp6")}</li>
      </ul>
    </div>
  );
}
