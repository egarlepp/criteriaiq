import { useState, useEffect } from "react";
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
  HelpCircle,
  Columns3,
  ListChecks,
  Wrench,
  X,
  Tag,
  Layers,
  RefreshCw,
  Download,
} from "lucide-react";

interface CriteriaImportDocumentationProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadTemplate?: () => void;
}

interface TagItem {
  name: string;
  description?: string;
  color?: string;
}

const sections = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "structure", label: "CSV Structure", icon: FileSpreadsheet },
  { id: "columns", label: "Column Reference", icon: Columns3 },
  { id: "tags", label: "Tags Reference", icon: Tag },
  { id: "validation", label: "Validation & Duplicates", icon: ListChecks },
  { id: "behavior", label: "Import Behavior", icon: RefreshCw },
  { id: "categories", label: "Categories Guide", icon: Layers },
  { id: "tips", label: "Tips & Troubleshooting", icon: Wrench },
];

export function CriteriaImportDocumentation({ isOpen, onClose, onDownloadTemplate }: CriteriaImportDocumentationProps) {
  const [activeSection, setActiveSection] = useState("overview");
  const [tags, setTags] = useState<TagItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetch('/api/tags').then(r => r.ok ? r.json() : []),
        fetch('/api/tags/system').then(r => r.ok ? r.json() : []),
      ]).then(([custom, system]) => {
        const seen = new Set<string>();
        const unique: TagItem[] = [];
        for (const tag of [...system, ...custom]) {
          const key = (tag.name || '').toLowerCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            unique.push(tag);
          }
        }
        setTags(unique);
      }).catch(() => setTags([]));
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[900px] w-full max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Validation Criteria Import Guide
          </DialogTitle>
          <DialogDescription>
            Step-by-step instructions for importing Solutions, Components, Value Mappings, Criteria, Outcomes, and Actions via CSV file.
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
              {activeSection === "overview" && <OverviewSection onDownloadTemplate={onDownloadTemplate} />}
              {activeSection === "structure" && <StructureSection />}
              {activeSection === "columns" && <ColumnsSection />}
              {activeSection === "tags" && <TagsSection tags={tags} />}
              {activeSection === "validation" && <ValidationSection />}
              {activeSection === "behavior" && <BehaviorSection />}
              {activeSection === "categories" && <CategoriesSection />}
              {activeSection === "tips" && <TipsSection />}
            </div>
          </ScrollArea>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Close
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

function OverviewSection({ onDownloadTemplate }: { onDownloadTemplate?: () => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={BookOpen}>Overview</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        The Validation Criteria Import feature allows administrators to bulk-import Solutions, Components, Criteria, Outcomes, and Actions from a single CSV file. This is ideal for initializing the criteria library, migrating from another system, or adding large batches of validation data.
      </p>

      <div className="space-y-3 mt-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">How it works:</h4>
        <div className="space-y-2.5">
          {[
            "Download the CSV template or prepare your own CSV file",
            "Fill in your validation data (category, name, description, solutions, tags)",
            "Upload the CSV file using drag-and-drop or the file browser",
            "Preview: review each row with its predicted status (New, Update, Skip, or Error)",
            "Select which rows to import — deselect any you want to exclude, or go back to fix your file",
            "Confirm the import and review the final summary of created, updated, and skipped entries",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <StepNumber number={i + 1} />
              <p className="text-sm text-gray-600 dark:text-gray-400 pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {onDownloadTemplate && (
        <div className="pt-2">
          <Button size="sm" onClick={onDownloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download CSV Template
          </Button>
        </div>
      )}

      <InfoBox>
        The import processes all six categories — <strong>Solutions, Components, Value Mappings, Criteria, Outcomes, and Actions</strong> — from a single CSV file. Each row is identified by its Category column.
      </InfoBox>
    </div>
  );
}

function StructureSection() {
  return (
    <div className="space-y-4">
      <SectionTitle icon={FileSpreadsheet}>CSV Structure</SectionTitle>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">File Format Requirements</h4>
        <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ml-4 list-disc">
          <li>Standard CSV format (comma-separated values)</li>
          <li>First row must be the header row with column names</li>
          <li>UTF-8 encoding recommended for special characters</li>
          <li>Text with commas must be enclosed in double quotes</li>
          <li>To include a literal double quote, use two double quotes (<code className="text-blue-600 dark:text-blue-400">""</code>)</li>
        </ul>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-4">Sample CSV Content</h4>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <pre className="text-[10px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre">
{`Category,Name,Description,Solutions,Abbreviation,Tags,Component
"Solution","Identity Governance","Centralized identity lifecycle and access certification","","IG","IGA,Compliance",""
"Component","Access Certification","Periodic access recertification module","Identity Governance","","",""
"Value Mapping","Risk Reduction","Reduce organizational risk exposure","Identity Governance","","",""
"Criteria","Privileged Access Review","Quarterly review of privileged accounts","Identity Governance","","PAM,Audit","Access Certification"
"Outcome","Privileged Access Recertified","All privileged accounts have documented quarterly reviews","Identity Governance","","",""
"Action","Schedule Quarterly Review","Configure recurring access certification campaigns","Identity Governance","","",""`}
          </pre>
        </div>
      </div>

      <InfoBox>
        Use the <strong>CSV template</strong> for a pre-formatted file with example rows for each category. This ensures your columns are in the correct order.
      </InfoBox>

      <InfoBox variant="warning">
        Make sure your CSV is saved with <strong>UTF-8 encoding</strong> to properly handle special characters. In Excel, use "Save As" &gt; "CSV UTF-8 (Comma delimited)".
      </InfoBox>
    </div>
  );
}

function ColumnsSection() {
  const columns = [
    { name: "Category", desc: "Type of entry", example: "Solution, Component, Value Mapping, Criteria, Outcome, or Action", required: true },
    { name: "Name", desc: "Display name of the entry", example: "Identity Governance", required: true },
    { name: "Description", desc: "Detailed description", example: "Centralized identity lifecycle and access certification", required: true },
    { name: "Solutions", desc: "Comma-separated solution names this entry belongs to", example: "Identity Governance,Cloud Security", required: false },
    { name: "Abbreviation", desc: "Short code (Solutions only)", example: "IG", required: false },
    { name: "Tags", desc: "Comma-separated tag names", example: "IGA,Compliance", required: false },
    { name: "Component", desc: "Component name to link (Criteria only)", example: "Access Certification", required: false },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={Columns3}>Column Reference</SectionTitle>

      <div className="border rounded-md overflow-hidden dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Column</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Required</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Description</th>
              <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Example</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name} className="border-t border-gray-100 dark:border-gray-700">
                <td className="p-2 font-mono text-blue-600 dark:text-blue-400">{col.name}</td>
                <td className="p-2">
                  {col.required ? (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-[10px]">Required</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-[10px]">Optional</Badge>
                  )}
                </td>
                <td className="p-2 text-gray-700 dark:text-gray-300">{col.desc}</td>
                <td className="p-2 text-gray-500 dark:text-gray-400 font-mono text-[10px]">{col.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Separator className="my-4" />

      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Column Details</h4>

      <div className="space-y-3">
        <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Category</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Must be one of: <code className="text-blue-600 dark:text-blue-400">Solution</code>, <code className="text-blue-600 dark:text-blue-400">Component</code>, <code className="text-blue-600 dark:text-blue-400">Value Mapping</code>, <code className="text-blue-600 dark:text-blue-400">Criteria</code>, <code className="text-blue-600 dark:text-blue-400">Outcome</code>, or <code className="text-blue-600 dark:text-blue-400">Action</code>. This determines how the row is processed.
            </p>
          </div>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Solutions</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Links Criteria, Outcomes, or Actions to existing Solutions. Use comma-separated names to link to multiple Solutions. Leave empty for Solution rows (they define Solutions themselves) or for entries that apply to all solutions.
            </p>
          </div>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Tags</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Comma-separated list of tag names to associate with the entry. Tags must already exist in the system. See the <strong>Tags Reference</strong> section for available tags.
            </p>
          </div>
        </div>
      </div>

      <InfoBox>
        The <strong>Abbreviation</strong> column only applies to Solutions. For Criteria, Outcomes, and Actions it is ignored.
      </InfoBox>
    </div>
  );
}

function TagsSection({ tags }: { tags: TagItem[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={Tag}>Tags Reference</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Tags help categorize and filter your validation criteria. When importing, use tag names in the <strong>Tags</strong> column (comma-separated). Tags must already exist in the system — the import will not create new tags.
      </p>

      {tags.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Available Tags ({tags.length})
          </h4>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge
                  key={tag.name}
                  variant="outline"
                  className="text-[10px] font-mono"
                  style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>

          <InfoBox>
            Tag names in your CSV are matched <strong>case-insensitively</strong>. For example, "security" will match a tag named "Security".
          </InfoBox>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-4 border border-gray-200 dark:border-gray-700 text-center">
          <Tag className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No tags found. Tags can be created in the Tags Management section.</p>
        </div>
      )}

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-4">How to Use Tags in CSV</h4>
      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
            <span>Single tag: <code className="text-blue-600 dark:text-blue-400">Security</code></span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
            <span>Multiple tags: <code className="text-blue-600 dark:text-blue-400">"Security,Compliance,Auditing"</code> (quote if using commas)</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
            <span>No tags: Leave the Tags column empty</span>
          </div>
        </div>
      </div>

      <InfoBox variant="warning">
        Tags that don't match any existing tag in the system will be <strong>silently skipped</strong>. Double-check your tag names against the list above.
      </InfoBox>
    </div>
  );
}

function ValidationSection() {
  return (
    <div className="space-y-4">
      <SectionTitle icon={ListChecks}>Validation & Duplicates</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        The import system validates each row and intelligently handles duplicates. Here's what gets checked during the import process.
      </p>

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Validation Checks</h4>
      <div className="space-y-2">
        {[
          { check: "Category validation", desc: "Must be one of: Solution, Component, Value Mapping, Criteria, Outcome, or Action" },
          { check: "Name required", desc: "Every row must have a non-empty Name value" },
          { check: "Description required", desc: "Every row must have a non-empty Description value" },
          { check: "Solution references", desc: "Solution names in the Solutions column must match existing or previously-imported Solutions" },
          { check: "Component references", desc: "Component names in the Component column must match existing or previously-imported Components" },
          { check: "Tag references", desc: "Tag names must match existing tags in the system" },
          { check: "CSV format", desc: "File must be valid CSV with the correct header columns" },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">{item.check}:</span>{" "}
              <span className="text-gray-600 dark:text-gray-400">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <Separator className="my-4" />

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Duplicate Handling</h4>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        The system detects duplicates by matching on <strong>Category + Name</strong>. Here's how each scenario is handled:
      </p>

      <div className="space-y-2 mt-2">
        <div className="flex items-start gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <div className="w-8 h-8 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">New Entry</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">If no matching entry exists, a new one is created with all provided data.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Existing Entry (Updated)</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">If a matching entry exists with different data, the description and solution associations may be updated.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Exact Duplicate (Skipped)</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">If a matching entry exists with identical data, it's counted as "skipped" — no changes are made.</p>
          </div>
        </div>
      </div>

      <InfoBox>
        The import summary shows counts for <strong>Created</strong>, <strong>Updated</strong>, and <strong>Skipped</strong> entries for each category, so you can verify exactly what changed.
      </InfoBox>
    </div>
  );
}

function BehaviorSection() {
  return (
    <div className="space-y-4">
      <SectionTitle icon={RefreshCw}>Import Behavior</SectionTitle>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        Understanding how the import processes your CSV helps you prepare your data correctly and set expectations for the results.
      </p>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Processing Order</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          The import processes categories in a specific order to ensure proper relationships:
        </p>
        <div className="space-y-2.5">
          {[
            "Solutions are processed first — they must exist before other items reference them",
            "Components are processed second — linked to their parent Solutions",
            "Value Mappings are processed third — linked to their parent Solutions",
            "Criteria are processed fourth — linked to Solutions and optionally to Components",
            "Outcomes are processed fifth — linked to their parent Solutions",
            "Actions are processed last — linked to their parent Solutions",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <StepNumber number={i + 1} />
              <p className="text-xs text-gray-600 dark:text-gray-400 pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Solution & Component Linking</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Components, Criteria, Outcomes, and Actions can be linked to one or more Solutions using the <strong>Solutions</strong> column. Criteria can also be linked to a specific Component using the <strong>Component</strong> column:
        </p>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 ml-4 list-disc">
          <li>Use exact Solution names, separated by commas</li>
          <li>Solutions referenced must exist in the system or be defined earlier in the same CSV</li>
          <li>Leave the Solutions column empty to create an unlinked entry (applies to all Solutions)</li>
          <li>Use the Component column to link a Criteria row to a specific Component by name</li>
          <li>Components referenced must exist in the system or be defined earlier in the same CSV</li>
          <li>Matching is case-insensitive</li>
        </ul>
      </div>

      <InfoBox variant="success">
        You can define new Solutions and Components and reference them in the same CSV file. Just make sure Solution rows appear before Components, and Component rows appear <strong>before</strong> any Criteria that reference them.
      </InfoBox>

      <InfoBox variant="warning">
        If a referenced Solution or Component name doesn't match any existing or newly-created entry, the linkage will be skipped but the entry will still be imported.
      </InfoBox>
    </div>
  );
}

function CategoriesSection() {
  const categories = [
    {
      name: "Solution",
      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      icon: Layers,
      desc: "Products or solution offerings that serve as the top-level grouping for your validation criteria.",
      example: "Identity Governance, Endpoint Protection, Cloud Security",
      fields: "Name, Description, Abbreviation (optional), Tags (optional)",
    },
    {
      name: "Component",
      color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
      icon: Layers,
      desc: "Sub-modules or functional areas within a Solution. Components are optional and provide a finer level of grouping for Criteria.",
      example: "Access Certification, Data Classifier, Policy Manager",
      fields: "Name, Description, Solutions (parent), Tags (optional)",
    },
    {
      name: "Value Mapping",
      color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
      icon: Layers,
      desc: "Defines why the validation is being conducted and maps business value to specific criteria. Helps solution engineers articulate the 'why' behind each validation.",
      example: "Risk Reduction, Compliance Assurance, Operational Efficiency",
      fields: "Name, Description, Solutions (to link), Tags (optional)",
    },
    {
      name: "Criteria",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      icon: ListChecks,
      desc: "Specific validation criteria or success metrics that need to be evaluated during technical validation.",
      example: "Privileged Access Review, Sensitive Data Discovery, Endpoint Threat Detection",
      fields: "Name, Description, Solutions (to link), Component (optional), Tags (optional)",
    },
    {
      name: "Outcome",
      color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      icon: CheckCircle2,
      desc: "Expected results or target outcomes that define what success looks like for each criteria.",
      example: "Privileged Access Recertified, Sensitive Data Catalogued, MTTR Under 15m",
      fields: "Name, Description, Solutions (to link), Tags (optional)",
    },
    {
      name: "Action",
      color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
      icon: Wrench,
      desc: "Specific steps or tasks required to achieve outcomes and satisfy validation criteria.",
      example: "Schedule Quarterly Access Review, Deploy Data Classification Rules",
      fields: "Name, Description, Solutions (to link), Tags (optional)",
    },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={Layers}>Categories Guide</SectionTitle>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Each row in your CSV must specify one of six categories. Here's what each category represents and how they relate to each other.
      </p>

      <div className="space-y-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.name} className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 flex items-center gap-2">
                <Badge className={`${cat.color} text-[10px]`}>{cat.name}</Badge>
                <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              </div>
              <div className="px-3 py-2 space-y-1.5">
                <p className="text-xs text-gray-700 dark:text-gray-300">{cat.desc}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  <strong>Examples:</strong> {cat.example}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  <strong>Fields used:</strong> {cat.fields}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-4">Hierarchy</h4>
      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 font-mono">
          <div>Solution (top level)</div>
          <div className="ml-4">├── Component (optional sub-module)</div>
          <div className="ml-8">│   └── Value Mapping (business value context)</div>
          <div className="ml-4">├── Value Mapping (business value context)</div>
          <div className="ml-4">├── Criteria (what to validate)</div>
          <div className="ml-4">├── Outcome (expected results)</div>
          <div className="ml-4">└── Action (steps to achieve)</div>
        </div>
      </div>

      <InfoBox>
        A single Criteria, Outcome, or Action can be linked to <strong>multiple Solutions</strong>. This is useful for cross-cutting concerns like compliance or security that apply across products.
      </InfoBox>
    </div>
  );
}

function TipsSection() {
  return (
    <div className="space-y-4">
      <SectionTitle icon={Wrench}>Tips & Troubleshooting</SectionTitle>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Common Issues</h4>

        {[
          {
            q: "\"Invalid file type\" error",
            a: "Make sure your file has a .csv extension. Excel files (.xlsx, .xls) are not supported. Use \"Save As\" in Excel and select CSV format.",
          },
          {
            q: "Solutions not linking correctly",
            a: "Check that Solution names in the Solutions column exactly match the Solution names (either already in the system or defined in the same CSV). Names are matched case-insensitively.",
          },
          {
            q: "Tags not being applied",
            a: "Tags must already exist in the system before import. Check the Tags Reference section for available tags. Non-matching tags are silently skipped.",
          },
          {
            q: "Everything shows as \"Skipped\"",
            a: "This means all entries already exist in the system with identical data. The import detects duplicates by Category + Name and skips exact matches.",
          },
          {
            q: "Commas in descriptions cause parsing errors",
            a: "Wrap any field containing commas in double quotes. For example: \"Advanced security analytics, monitoring, and reporting platform\"",
          },
          {
            q: "Special characters appear garbled",
            a: "Ensure your CSV is saved with UTF-8 encoding. In Excel, use \"Save As\" > \"CSV UTF-8 (Comma delimited)\".",
          },
        ].map((item, i) => (
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

      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Best Practices</h4>
      <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 ml-4 list-disc">
        <li>Start with the CSV template to ensure correct column formatting</li>
        <li>Define all Solutions before Criteria, Outcomes, and Actions in your CSV</li>
        <li>Use a small test import first to verify your data format</li>
        <li>Keep a backup of your CSV file before importing</li>
        <li>Review the import summary carefully — check Created, Updated, and Skipped counts</li>
        <li>Create any needed Tags in the system before importing (Configuration &gt; Tags Management)</li>
        <li>Use consistent naming conventions for Solutions to avoid duplicate entries</li>
        <li>When linking to multiple Solutions, ensure each name is separated by a comma with no extra spaces</li>
      </ul>
    </div>
  );
}
