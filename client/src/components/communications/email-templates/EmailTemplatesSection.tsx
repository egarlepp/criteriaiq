import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeEmailHtml } from "@/lib/safeHtml";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { ResizableModal } from "@/components/ui/ResizableModal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Mails, Mail, Edit as EditIcon, Trash as TrashIcon, Eye as EyeIcon, Copy, Variable, CopyPlus, Trash2, Save, SquarePen, ChevronDown, ChevronUp, FolderKanban, Users, User, Link, Headset, ClipboardList, Lock, BellRing, AlertTriangle, FileBarChart, Building2, Cloud, Brain, LifeBuoy, ShieldAlert, Sparkles, CircleCheck, AlarmClock, Newspaper, UserPlus, BadgeCheck, KeyRound, CalendarDays, Megaphone, UserCheck, ClipboardPenLine, Boxes, PackageCheck, X, FolderHeart, FolderCog, FolderLock, FolderClock } from "lucide-react";

// Icon mapping for variable categories
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Project Information": FolderKanban,
  "Team Members": Users,
  "User Information": User,
  "System Links": Link,
  "Support & Admin": Headset,
  "MAP — Phase Variables": ClipboardPenLine,
  "MAP — Step Variables": Boxes,
  "MAP — Task Variables": PackageCheck,
  "Assigned User": UserCheck,
  "System / Announcement": Megaphone,
  "Evaluation & Engagement": FileBarChart,
  "Dates & Formatting": CalendarDays,
};
import { EmailContentEditor } from "./EmailContentEditor";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import type { EmailTemplate, InsertEmailTemplate } from "../types";

const EMAIL_CATEGORIES = [
  "Authentication",
  "Project Notifications",
  "System Alerts",
  "Communication",
  "Reports",
  "MAP",
  "Customer Portal",
  "Salesforce",
  "AI Assessments",
  "Support",
  "Security",
];

const CATEGORY_META: Record<string, { icon: React.ElementType; description: string }> = {
  "Authentication":        { icon: Lock,          description: "Login, registration, password reset, MFA setup, account approval, and user welcome flows." },
  "Project Notifications": { icon: BellRing,      description: "Project creation, assignment, status changes, deadline alerts, and evaluation requests." },
  "System Alerts":         { icon: AlertTriangle, description: "System announcements, maintenance windows, critical errors, and scheduled job failures." },
  "Communication":         { icon: Mail,          description: "General-purpose and ad-hoc emails not tied to a specific automated workflow." },
  "Reports":               { icon: FileBarChart,  description: "Scheduled and on-demand report delivery, analytics summaries, and digest emails." },
  "MAP":                   { icon: ClipboardList, description: "Mutual Action Plan task assignments, phase completions, step updates, and overdue reminders." },
  "Customer Portal":       { icon: Building2,     description: "Customer-facing emails for portal access invitations, account activity, and document sharing." },
  "Salesforce":            { icon: Cloud,         description: "Sync failures, expired OAuth connections, broken record links, and field mapping alerts." },
  "AI Assessments":        { icon: Brain,         description: "AI risk analysis completion, score changes, assessment failures, and Risk Radar alerts." },
  "Support":               { icon: LifeBuoy,      description: "Support ticket creation, status updates, feature request acknowledgements, and resolutions." },
  "Security":              { icon: ShieldAlert,   description: "Account locking, suspicious login attempts, MFA changes, passkey registration, and security policy alerts." },
};

const EMAIL_TYPE_META: Record<string, { icon: React.ElementType; label: string }> = {
  "general":        { icon: Mail,          label: "General" },
  "project_update": { icon: FolderKanban,  label: "Project Update" },
  "notification":   { icon: BellRing,      label: "Notification" },
  "welcome":        { icon: Sparkles,      label: "Welcome" },
  "approval":       { icon: CircleCheck,   label: "Approval" },
  "alert":          { icon: AlertTriangle, label: "Alert" },
  "reminder":       { icon: AlarmClock,    label: "Reminder" },
  "digest":         { icon: Newspaper,     label: "Digest" },
  "invitation":     { icon: UserPlus,      label: "Invitation" },
  "assignment":     { icon: ClipboardList, label: "Assignment" },
  "completion":     { icon: BadgeCheck,    label: "Completion" },
  "password_reset": { icon: KeyRound,      label: "Password Reset" },
};

const VARIABLE_CATEGORIES = {
  "Project Information": {
    "{{projectName}}": "Name of the project",
    "{{customerName}}": "Customer account name",
    "{{companyName}}": "Customer company name",
    "{{projectStatus}}": "Current project status",
    "{{startDate}}": "Project start date",
    "{{endDate}}": "Project end date",
    "{{businessObjective}}": "Project business objective",
    "{{technicalObjective}}": "Project technical objective",
    "{{customerObjective}}": "Customer's main objective",
    "{{projectId}}": "Project reference ID",
    "{{products}}": "Solutions/products being evaluated",
    "{{industry}}": "Customer industry vertical"
  },
  "Team Members": {
    "{{primaryEngineer}}": "Primary engineer name",
    "{{specialistEngineer}}": "Specialist engineer name",
    "{{primaryEngineerEmail}}": "Primary engineer email",
    "{{specialistEngineerEmail}}": "Specialist engineer email",
    "{{projectManagerEmail}}": "Workspace manager email",
    "{{projectManagerName}}": "Workspace manager full name",
    "{{projectTeamEmails}}": "All team member emails (comma-separated)",
    "{{projectStakeholdersEmails}}": "Stakeholder distribution list"
  },
  "User Information": {
    "{{userName}}": "User's full name",
    "{{firstName}}": "User's first name",
    "{{lastName}}": "User's last name",
    "{{userEmail}}": "User's email address",
    "{{userRole}}": "User's role",
    "{{customerEmail}}": "Customer contact email",
    "{{assignedUserEmail}}": "Email of the assigned user",
    "{{assignedUser.firstName}}": "Assigned user first name",
    "{{assignedUser.lastName}}": "Assigned user last name"
  },
  "System Links": {
    "{{dashboardUrl}}": "Link to dashboard",
    "{{projectUrl}}": "Link to project details",
    "{{resetUrl}}": "Password reset URL",
    "{{loginUrl}}": "Direct login URL",
    "{{accountSettingsUrl}}": "Account settings page URL"
  },
  "Support & Admin": {
    "{{supportEmail}}": "Support email address",
    "{{adminEmail}}": "System admin email",
    "{{workspaceName}}": "Name of this workspace instance",
    "{{workspaceUrl}}": "Base URL of this workspace"
  },
  "MAP — Phase Variables": {
    "{{phase.name}}": "Phase name",
    "{{phase.description}}": "Phase description",
    "{{phase.startDate}}": "Phase start date",
    "{{phase.targetDate}}": "Phase target completion date",
    "{{phase.status}}": "Phase current status",
    "{{phase.oldStatus}}": "Phase previous status",
    "{{phase.newStatus}}": "Phase new status after change",
    "{{phase.changedAt}}": "Timestamp of status change",
    "{{phase.totalSteps}}": "Total number of steps in phase",
    "{{phase.completedSteps}}": "Number of completed steps",
    "{{phase.remainingSteps}}": "Number of remaining steps",
    "{{phase.totalTasks}}": "Total tasks across all steps",
    "{{phase.remainingTasks}}": "Remaining tasks across all steps",
    "{{phase.daysRemaining}}": "Days until target completion",
    "{{phase.progressPercent}}": "Phase completion percentage",
    "{{phase.completedDate}}": "Date the phase was completed",
    "{{phase.duration}}": "Phase duration in days"
  },
  "MAP — Step Variables": {
    "{{step.name}}": "Step name",
    "{{step.description}}": "Step description",
    "{{step.startDate}}": "Step start date",
    "{{step.dueDate}}": "Step due date",
    "{{step.status}}": "Step current status",
    "{{step.oldStatus}}": "Step previous status",
    "{{step.newStatus}}": "Step new status after change",
    "{{step.changedAt}}": "Timestamp of step status change",
    "{{step.totalTasks}}": "Total tasks in this step",
    "{{step.completedTasks}}": "Number of completed tasks",
    "{{step.remainingTasks}}": "Number of remaining tasks",
    "{{step.estimatedHours}}": "Estimated hours for step",
    "{{step.actualHours}}": "Actual hours logged",
    "{{step.hoursSpent}}": "Total hours spent on step",
    "{{step.daysRemaining}}": "Days until step due date",
    "{{step.progressPercent}}": "Step completion percentage",
    "{{step.completedDate}}": "Date the step was completed"
  },
  "MAP — Task Variables": {
    "{{task.name}}": "Task name",
    "{{task.title}}": "Task title (alias for task.name)",
    "{{task.description}}": "Task description",
    "{{task.status}}": "Task current status",
    "{{task.previousStatus}}": "Task prior status",
    "{{task.dueDate}}": "Task due date",
    "{{daysUntilDue}}": "Days remaining until task due date",
    "{{assignedTo}}": "User assigned to this task",
    "{{completedBy.firstName}}": "First name of user who completed the task",
    "{{completedBy.lastName}}": "Last name of user who completed the task",
    "{{completedAt}}": "Timestamp when task was completed",
    "{{updatedBy.firstName}}": "First name of user who last updated the task",
    "{{updatedBy.lastName}}": "Last name of user who last updated the task",
    "{{updatedAt}}": "Timestamp of last update",
    "{{completionDate}}": "Formatted task completion date"
  },
  "Assigned User": {
    "{{assignedUser.firstName}}": "Assigned user's first name",
    "{{assignedUser.lastName}}": "Assigned user's last name",
    "{{assignedUserEmail}}": "Assigned user's email address",
    "{{changedBy.firstName}}": "First name of user who made the change",
    "{{changedBy.lastName}}": "Last name of user who made the change",
    "{{recipientUser.firstName}}": "Recipient user's first name",
    "{{recipientUser.lastName}}": "Recipient user's last name"
  },
  "System / Announcement": {
    "{{title}}": "Announcement title",
    "{{content}}": "Announcement body content",
    "{{severity}}": "Announcement severity level (Info, Warning, Critical)",
    "{{severityStyle}}": "Inline CSS style string based on severity"
  },
  "Evaluation & Engagement": {
    "{{requestedSolutions}}": "List of requested solutions",
    "{{submissionDate}}": "Date the evaluation request was submitted",
    "{{requestStatus}}": "Current status of the evaluation request"
  },
  "Dates & Formatting": {
    "{{currentDate}}": "Today's date (formatted)",
    "{{currentYear}}": "Current 4-digit year",
    "{{currentMonth}}": "Current month name",
    "{{dueDate}}": "Generic due date variable",
    "{{completionDate}}": "Generic completion date variable",
    "{{fiscalYear}}": "Current fiscal year (per System Settings Calendar)",
    "{{fiscalQuarter}}": "Current fiscal quarter Q1–Q4 (per System Settings Calendar)"
  }
};

interface EmailTemplatesSectionProps {
  activeTab: string;
}

function CollapsibleSection({
  label,
  icon: Icon,
  iconColor,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {count}
        </Badge>
        <ChevronDown
          className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>
      {expanded && (
        <div>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No items in this section
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// Email Template Preview Component
const EmailTemplatePreview = ({ template }: { template: EmailTemplate }) => {
  
  const [previewData, setPreviewData] = useState<{ subject: string; htmlContent: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const loadPreview = async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch(`/api/email-templates/${template.id}/preview`, {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to load preview');
        }

        const data = await response.json() as { subject: string; htmlContent: string };
        setPreviewData(data);
      } catch (error) {
        console.error("Error loading preview:", error);
        showErrorToast("Error", "Failed to load preview");
      } finally {
        setPreviewLoading(false);
      }
    };

    if (template?.id) {
      loadPreview();
    }
  }, [template?.id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccessToast("Copied", "Template content copied to clipboard");
  };

  const setPreviewDialogOpen = (open: boolean) => {
    // This will be handled by parent component
  };

  if (previewLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Failed to load preview</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="font-medium">Subject:</Label>
        <p className="text-sm border p-2 rounded mt-1 bg-gray-50">{previewData.subject}</p>
      </div>
      <div>
        <Label className="font-medium">Complete Email Content (with default design wrapper):</Label>
        <div className="border rounded mt-1 max-h-96 overflow-y-auto">
          <div
            style={{
              minHeight: '400px',
              fontSize: '14px',
              fontFamily: 'Arial, sans-serif'
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(previewData.htmlContent) }}
          />
        </div>
      </div>
      <div className="flex justify-between">
        <Button variant="default" onClick={() => copyToClipboard(previewData.htmlContent)} title="Copy the complete email HTML to clipboard">
          <Copy className="h-4 w-4 mr-2" />
          Copy Complete Email
        </Button>
      </div>
    </div>
  );
};

// Email Template Dialog Component
const EmailTemplateDialog = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  titleIcon,
  initialData,
  isLoading,
  categories,
  activeEmailDesigns
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  title: React.ReactNode;
  titleIcon?: React.ElementType;
  initialData?: EmailTemplate;
  isLoading: boolean;
  categories: string[];
  activeEmailDesigns: any[];
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  
  // Track if we've initialized the form to prevent multiple resets
  const initializedRef = useRef<boolean>(false);
  const dialogKeyRef = useRef<string>('');
  const hasSetDefaultDesignRef = useRef<boolean>(false);
  
  // Lazy initial state — hydrate from initialData on FIRST render so the
  // form never transitions through default values. The prior pattern used a
  // post-mount useEffect to set formData, which left a brief window where
  // controlled Selects (Category, Email Type, Email Design) had their `value`
  // prop transition from the initial default to the template's actual value.
  // Radix Select interpreted that transition as a user selection and fired
  // `onValueChange` with the "stale" value (often an empty string when the
  // template's value wasn't yet in the options list), which then overwrote
  // the just-hydrated `designId` back to null via the spread-from-prev
  // handler. With lazy init there's no transition: the controlled Selects
  // render their hydrated values on frame 1 and `onValueChange` never fires
  // until the user actually picks something.
  const [formData, setFormData] = useState<Partial<InsertEmailTemplate>>(() => {
    if (initialData) {
      let parsedRecipientTypes: string[] = [];
      if (Array.isArray(initialData.recipientType)) {
        parsedRecipientTypes = initialData.recipientType;
      } else if (typeof initialData.recipientType === 'string' && initialData.recipientType) {
        parsedRecipientTypes = initialData.recipientType.split(',').map(t => t.trim().toLowerCase());
      }
      const contentToEdit = initialData.emailContent || initialData.htmlContent || "";
      return {
        name: initialData.name || "",
        description: initialData.description || "",
        templateKey: initialData.templateKey || "",
        category: initialData.category || "Communication",
        subject: initialData.subject || "",
        emailContent: contentToEdit,
        variables: initialData.variables || [],
        isActive: initialData.isActive ?? true,
        isSystem: initialData.isSystem ?? false,
        emailSafeMode: initialData.emailSafeMode ?? true,
        includeProjectPdf: initialData.includeProjectPdf ?? false,
        emailType: initialData.emailType || "general",
        recipientTypes: parsedRecipientTypes.length ? parsedRecipientTypes : ["internal"],
        triggerEvents: initialData.triggerEvents || [],
        toRecipients: initialData.toRecipients || "",
        ccRecipients: initialData.ccRecipients || "",
        bccRecipients: initialData.bccRecipients || "",
        designId: initialData.designId ?? null,
      };
    }
    return {
      name: "",
      description: "",
      templateKey: "",
      category: "Communication",
      subject: "",
      emailContent: "",
      variables: [],
      isActive: true,
      isSystem: false,
      emailSafeMode: true,
      includeProjectPdf: false,
      emailType: "general",
      recipientTypes: [],
      triggerEvents: [],
      toRecipients: "",
      ccRecipients: "",
      bccRecipients: "",
      designId: null,
    };
  });

  // Update form when dialog opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      // Create a unique key for this dialog instance (edit mode uses template ID, create mode uses 'new')
      const currentKey = initialData ? `edit-${initialData.id}` : 'new';
      
      // Only initialize if this is a new dialog instance
      if (dialogKeyRef.current !== currentKey) {
        dialogKeyRef.current = currentKey;
        initializedRef.current = false;
        hasSetDefaultDesignRef.current = false;
      }
      
      // For edit mode: only initialize once
      if (initialData && initializedRef.current) {
        return;
      }
      
      // For create mode: allow setting default design ONLY if we haven't set it yet.
      // Look up the default by the `isDefault` flag rather than by name — the
      // v0.7.51 rebrand renamed it to "CriteriaIQ Default"
      // and a name-based lookup silently broke the auto-select on every fresh
      // template create. Falls back to the canonical name if no row has the flag.
      if (!initialData && initializedRef.current) {
        const defaultDesign =
          activeEmailDesigns.find(design => design.isDefault === true) ||
          activeEmailDesigns.find(design => design.name === 'CriteriaIQ Default');
        // Only set default design if we haven't already set it AND it's now available
        if (!hasSetDefaultDesignRef.current && defaultDesign) {
          setFormData(prev => ({ ...prev, designId: defaultDesign.id }));
          hasSetDefaultDesignRef.current = true;
        }
        return;
      }
      
      if (initialData) {
        // Parse recipient types from the saved data
        let parsedRecipientTypes: string[] = [];
        if (Array.isArray(initialData.recipientType)) {
          parsedRecipientTypes = initialData.recipientType;
        } else if (typeof initialData.recipientType === 'string' && initialData.recipientType) {
          parsedRecipientTypes = initialData.recipientType.split(',').map(t => t.trim().toLowerCase());
        }

        // Use emailContent if available, otherwise fall back to htmlContent for backward compatibility
        const contentToEdit = initialData.emailContent || initialData.htmlContent || "";

        setFormData({
          name: initialData.name || "",
          description: initialData.description || "",
          templateKey: initialData.templateKey || "",
          category: initialData.category || "Communication",
          subject: initialData.subject || "",
          emailContent: contentToEdit,
          variables: initialData.variables || [],
          isActive: initialData.isActive ?? true,
          isSystem: initialData.isSystem ?? false,
          emailSafeMode: initialData.emailSafeMode ?? true,
          includeProjectPdf: initialData.includeProjectPdf ?? false,
          emailType: initialData.emailType || "general",
          recipientTypes: parsedRecipientTypes.length ? parsedRecipientTypes : ["internal"],
          triggerEvents: initialData.triggerEvents || [],
          toRecipients: initialData.toRecipients || "",
          ccRecipients: initialData.ccRecipients || "",
          bccRecipients: initialData.bccRecipients || "",
          designId: initialData.designId || null,
        });
        initializedRef.current = true;
      } else {
        // Reset form for create mode — auto-select the design flagged
        // `isDefault: true`. Falls through to legacy names if no design has the
        // flag set (a pre-flag install).
        const defaultDesign =
          activeEmailDesigns.find(design => design.isDefault === true) ||
          activeEmailDesigns.find(design => design.name === 'CriteriaIQ Default');

        setFormData({
          name: "",
          description: "",
          templateKey: "",
          category: "Communication",
          subject: "",
          emailContent: "",
          variables: [],
          isActive: true,
          isSystem: false,
          emailSafeMode: true,
          includeProjectPdf: false,
          emailType: "general",
          recipientTypes: ["internal"],
          triggerEvents: [],
          toRecipients: "",
          ccRecipients: "",
          bccRecipients: "",
          designId: defaultDesign ? defaultDesign.id : null,
        });
        initializedRef.current = true;
        // Only mark as having set the default if we actually found and set a design
        if (defaultDesign) {
          hasSetDefaultDesignRef.current = true;
        }
      }
    } else {
      // Reset initialization flags when dialog closes
      initializedRef.current = false;
      dialogKeyRef.current = '';
      hasSetDefaultDesignRef.current = false;
    }
  }, [isOpen, initialData, activeEmailDesigns]);

  // Handle design selection - just update the designId, wrapping happens at preview/send time
  const handleDesignChange = (designId: string) => {
    const newDesignId = designId && designId !== "none" ? parseInt(designId) : null;
    setFormData(prev => ({
      ...prev,
      designId: newDesignId
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Convert recipientTypes array back to the expected format for submission
    const submissionData = {
      ...formData,
      recipientType: formData.recipientTypes && formData.recipientTypes.length > 0
        ? formData.recipientTypes.join(',')
        : 'internal'
    };
    onSubmit(submissionData as InsertEmailTemplate);
  };

  return (
    <ResizableModal
      open={isOpen}
      onOpenChange={onClose}
      title={title}
      titleIcon={titleIcon}
      initialSize={{ width: 800, height: 700 }}
      minSize={{ width: 600, height: 500 }}
      maxSize={{ width: 1400, height: 900 }}
      footer={
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" form="email-template-form" disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : "Save Template"}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-muted-foreground mb-4">
        Create and manage email templates with variables and designs. Email Content field is what is within the placeholder {"{BODY_TEXT_CONTENT}"}.
      </div>
      <form id="email-template-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Welcome Email"
                required
              />
            </div>
            <div>
              <Label htmlFor="templateKey">Template Key</Label>
              <Input
                id="templateKey"
                value={formData.templateKey || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, templateKey: e.target.value }))}
                placeholder="e.g., welcome-email"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of the template"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={formData.category || "Communication"} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => {
                    const meta = CATEGORY_META[category];
                    const Icon = meta?.icon;
                    return (
                      <TooltipProvider key={category} delayDuration={800}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <SelectItem value={category}>
                              <span className="flex items-center gap-2">
                                {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                                {category}
                              </span>
                            </SelectItem>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p>{meta?.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-4 pt-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive ?? true}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              {isAdmin && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isSystem"
                    checked={formData.isSystem ?? false}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isSystem: checked }))}
                  />
                  <Label htmlFor="isSystem">System</Label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Switch
                  id="emailSafeMode"
                  checked={formData.emailSafeMode ?? true}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, emailSafeMode: checked }))}
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label htmlFor="emailSafeMode" className="cursor-help">Button-Safe</Label>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>When enabled, TinyMCE uses inline styles for better email client compatibility. Disable only if you understand CSS classes in email.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Email Type and Recipient Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="emailType">Email Type</Label>
              <Select value={formData.emailType || "general"} onValueChange={(value) => setFormData(prev => ({ ...prev, emailType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EMAIL_TYPE_META).map(([value, { icon: Icon, label }]) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recipient Type (Multi-Select)</Label>
              <div className="flex gap-4 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recipientAdmin"
                    checked={formData.recipientTypes?.includes('admin') ?? false}
                    onCheckedChange={(checked) => {
                      const currentTypes = formData.recipientTypes || [];
                      if (checked) {
                        setFormData(prev => ({ ...prev, recipientTypes: [...currentTypes.filter(t => t !== 'admin'), 'admin'] }));
                      } else {
                        setFormData(prev => ({ ...prev, recipientTypes: currentTypes.filter(t => t !== 'admin') }));
                      }
                    }}
                  />
                  <Label htmlFor="recipientAdmin">Admin</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recipientInternal"
                    checked={formData.recipientTypes?.includes('internal') ?? false}
                    onCheckedChange={(checked) => {
                      const currentTypes = formData.recipientTypes || [];
                      if (checked) {
                        setFormData(prev => ({ ...prev, recipientTypes: [...currentTypes.filter(t => t !== 'internal'), 'internal'] }));
                      } else {
                        setFormData(prev => ({ ...prev, recipientTypes: currentTypes.filter(t => t !== 'internal') }));
                      }
                    }}
                  />
                  <Label htmlFor="recipientInternal">Internal</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recipientExternal"
                    checked={formData.recipientTypes?.includes('external') ?? false}
                    onCheckedChange={(checked) => {
                      const currentTypes = formData.recipientTypes || [];
                      if (checked) {
                        setFormData(prev => ({ ...prev, recipientTypes: [...currentTypes.filter(t => t !== 'external'), 'external'] }));
                      } else {
                        setFormData(prev => ({ ...prev, recipientTypes: currentTypes.filter(t => t !== 'external') }));
                      }
                    }}
                  />
                  <Label htmlFor="recipientExternal">External</Label>
                </div>
              </div>
            </div>
          </div>

          {/* Email Design Selection */}
          <div>
            <Label htmlFor="designId">Email Design (Optional)</Label>
            <Select value={formData.designId?.toString() || "none"} onValueChange={handleDesignChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select an email design" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Email Design Wrapper Template</SelectItem>
                {activeEmailDesigns.map((design: any) => (
                  <SelectItem key={design.id} value={design.id.toString()}>
                    {design.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Choose a reusable email design wrapper. The wrapper will be applied automatically when previewing or sending the email.</p>
          </div>

          {/* PDF Attachment Option */}
          <div className="flex items-center space-x-2 p-4 border-2 border-blue-300 rounded-lg bg-blue-50">
            <Checkbox
              id="includeProjectPdf"
              checked={formData.includeProjectPdf ?? false}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, includeProjectPdf: checked as boolean }))}
            />
            <div className="flex flex-col">
              <Label htmlFor="includeProjectPdf" className="text-sm font-medium text-blue-900">
                Include Project Details PDF
              </Label>
              <p className="text-xs text-blue-700">
                Automatically attach a PDF screenshot of the project details page when sending this email
              </p>
            </div>
          </div>

          {/* Email Recipients Section */}
          <div className="bg-gray-100 rounded-lg p-4 space-y-4">
            <div>
              <Label className="text-lg font-medium">Email Recipients (Use project role variables)</Label>
              <p className="text-sm text-muted-foreground">
                Use project role variables like {'{{primaryEngineerEmail}}'}, {'{{specialistEngineerEmail}}'}, {'{{customerEmail}}'}, etc.
                Separate multiple emails with semicolons (;)
              </p>
            </div>

            <div>
              <Label htmlFor="toRecipients">To</Label>
              <Input
                id="toRecipients"
                value={formData.toRecipients || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, toRecipients: e.target.value }))}
                placeholder="{{primaryEngineerEmail}};{{customerEmail}}"
              />
              <p className="text-sm text-muted-foreground mt-1">Primary recipients of the email</p>
            </div>

            <div>
              <Label htmlFor="ccRecipients">CC</Label>
              <Input
                id="ccRecipients"
                value={formData.ccRecipients || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, ccRecipients: e.target.value }))}
                placeholder="{{specialistEngineerEmail}};{{projectManagerEmail}}"
              />
              <p className="text-sm text-muted-foreground mt-1">Carbon copy recipients</p>
            </div>

            <div>
              <Label htmlFor="bccRecipients">BCC</Label>
              <Input
                id="bccRecipients"
                value={formData.bccRecipients || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, bccRecipients: e.target.value }))}
                placeholder="{{adminEmail}}"
              />
              <p className="text-sm text-muted-foreground mt-1">Blind carbon copy recipients</p>
            </div>
          </div>

          <div>
            <Label htmlFor="subject">Email Subject</Label>
            <Input
              id="subject"
              value={formData.subject || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="e.g., Welcome to {{projectName}}"
              required
            />
          </div>

          <div>
            <Label htmlFor="emailContent">Email Content</Label>
            <div className="mt-2 border rounded-md">
              <EmailContentEditor
                value={formData.emailContent || ""}
                onChange={(content) => setFormData(prev => ({ ...prev, emailContent: content }))}
                height={500}
                emailSafeMode={formData.emailSafeMode ?? true}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Create your email content using the rich text editor. You can insert variables using the "Insert Variable" button.
              {formData.designId && (
                <> The selected Email Design wrapper will be applied automatically when previewing or sending the email.</>
              )}
            </p>
          </div>
        </form>
    </ResizableModal>
  );
};

export default function EmailTemplatesSection({ activeTab }: EmailTemplatesSectionProps) {
  
  const queryClient = useQueryClient();
  
  // State
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isTestEmailDialogOpen, setIsTestEmailDialogOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [templatePendingDelete, setTemplatePendingDelete] = useState<EmailTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterEmailType, setFilterEmailType] = useState<string>("all");
  const [filterRecipientType, setFilterRecipientType] = useState<string>("all");
  const [filterIncludePdf, setFilterIncludePdf] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  // Category sub-accordions are OPEN by default; we track only the ones the user
  // has explicitly COLLAPSED. Previously this defaulted closed, so a template
  // that moved into a section (e.g. toggling a template out of "System") landed
  // inside a collapsed category sub-accordion and appeared to vanish even though
  // the section count went up.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const [myTemplatesExpanded, setMyTemplatesExpanded] = useState(true);
  const [otherTemplatesExpanded, setOtherTemplatesExpanded] = useState(true);
  const [systemTemplatesExpanded, setSystemTemplatesExpanded] = useState(true);
  const [inactiveTemplatesExpanded, setInactiveTemplatesExpanded] = useState(false);
  const [expandedVariableCategories, setExpandedVariableCategories] = useState<Set<string>>(() => {
    const categoryNames = Object.keys(VARIABLE_CATEGORIES);
    return new Set(categoryNames.length > 0 ? [categoryNames[0]] : []);
  });
  
  const { user } = useAuth();

  // Filter calculation
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (filterCategory !== "all") count++;
    if (filterEmailType !== "all") count++;
    if (filterRecipientType !== "all") count++;
    if (filterIncludePdf !== "all") count++;
    return count;
  }, [searchTerm, filterCategory, filterEmailType, filterRecipientType, filterIncludePdf]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterCategory("all");
    setFilterEmailType("all");
    setFilterRecipientType("all");
    setFilterIncludePdf("all");
  };

  // Fetch email templates
  const { data: emailTemplatesData = [], isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ['/api/email-templates'],
    queryFn: () => apiRequest('GET', '/api/email-templates'),
    enabled: activeTab === "email-templates",
  });

  const emailTemplates = useMemo(() => {
    console.log('Email templates data received:', emailTemplatesData);
    if (!emailTemplatesData) {
      console.log('No email templates data');
      return [];
    }
    const templates = Array.isArray(emailTemplatesData) ? emailTemplatesData : [];
    console.log('Processed email templates:', templates.length, templates);
    return templates;
  }, [emailTemplatesData]);

  // Show error message if templates fail to load
  useEffect(() => {
    if (templatesError && activeTab === "email-templates") {
      console.error('Error loading email templates:', templatesError);
      showErrorToast("Error", "Failed to load email templates. Please try refreshing the page.");
    }
  }, [templatesError, activeTab]);

  // Fetch active email designs for dropdown in templates
  const { data: activeEmailDesignsData = [], isLoading: activeDesignsLoading, error: activeDesignsError } = useQuery({
    queryKey: ['/api/email-designs?active=true'],
    queryFn: () => apiRequest('GET', '/api/email-designs?active=true'),
    enabled: activeTab === "email-templates",
    retry: 1,
    retryOnMount: false,
  });

  const activeEmailDesigns = useMemo(() => {
    if (!activeEmailDesignsData) return [];
    return Array.isArray(activeEmailDesignsData) ? activeEmailDesignsData : [];
  }, [activeEmailDesignsData]);

  // Handle email designs errors
  useEffect(() => {
    if (activeDesignsError && activeTab === "email-templates") {
      console.error('Error loading active email designs:', activeDesignsError);
    }
  }, [activeDesignsError, activeTab]);

  // Template mutations
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/email-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
      setIsCreateDialogOpen(false);
      showSuccessToast("Success", "Email template created successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create email template");
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest('PUT', `/api/email-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
      setIsEditDialogOpen(false);
      setSelectedTemplate(null);
      showSuccessToast("Success", "Email template updated successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update email template");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/email-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
      showSuccessToast("Success", "Email template deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete email template");
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: ({ templateId, emailAddress }: { templateId: number; emailAddress: string }) =>
      apiRequest('POST', `/api/email-templates/${templateId}/send-test`, { emailAddress }),
    onSuccess: () => {
      setIsTestEmailDialogOpen(false);
      setTestEmailAddress("");
      setSelectedTemplate(null);
      showSuccessToast("Success", "Test email sent successfully! Check the Email Logs tab to see the result.");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to send test email");
    },
  });

  // Filter and sort email templates based on current filters
  const filteredEmailTemplates = useMemo(() => {
    console.log('Filtering templates, total:', emailTemplates.length);
    console.log('Email templates data:', emailTemplates);

    if (!Array.isArray(emailTemplates) || emailTemplates.length === 0) {
      console.log('No templates to filter');
      return [];
    }

    const filtered = emailTemplates.filter((template: EmailTemplate) => {
      console.log('Filtering template:', template.name, template);

      // Category filter
      if (filterCategory !== "all" && template.category !== filterCategory) {
        console.log('Filtered out by category:', template.category, 'vs', filterCategory);
        return false;
      }

      // Search filter
      if (searchTerm && !template.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !template.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
        console.log('Filtered out by search:', searchTerm);
        return false;
      }

      // Email Type filter
      if (filterEmailType !== "all" && template.emailType !== filterEmailType) {
        console.log('Filtered out by email type:', template.emailType, 'vs', filterEmailType);
        return false;
      }

      // Recipient Type filter
      if (filterRecipientType !== "all") {
        const selected = filterRecipientType.toLowerCase();
        let templateRecipientTypes: string[] = [];
        if (Array.isArray(template.recipientType)) {
          templateRecipientTypes = template.recipientType.map(t => (t || "").toLowerCase());
        } else if (typeof template.recipientType === 'string' && template.recipientType) {
          templateRecipientTypes = template.recipientType.split(',').map(type => type.trim().toLowerCase());
        }
        if (!templateRecipientTypes.includes(selected)) {
          console.log('Filtered out by recipient type:', templateRecipientTypes, 'vs', selected);
          return false;
        }
      }

      // Include PDF filter
      if (filterIncludePdf !== "all") {
        const hasPdf = template.includeProjectPdf === true;
        if (filterIncludePdf === "yes" && !hasPdf) {
          console.log('Filtered out by PDF filter (needs PDF)');
          return false;
        }
        if (filterIncludePdf === "no" && hasPdf) {
          console.log('Filtered out by PDF filter (no PDF)');
          return false;
        }
      }

      console.log('Template passed all filters:', template.name);
      return true;
    });

    console.log('Filtered templates count:', filtered.length);
    console.log('Filtered templates:', filtered.map(t => t.name));
    
    // Sort alphabetically by name
    const sorted = filtered.slice().sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
    
    return sorted;
  }, [emailTemplates, filterCategory, filterEmailType, filterRecipientType, filterIncludePdf, searchTerm]);

  // Section split: My / Other / System / Inactive (mirrors ProjectTemplatesTab logic)
  const myTemplates = useMemo(() =>
    filteredEmailTemplates.filter(t => t.createdBy != null && String(t.createdBy) === String(user?.id) && t.isSystem === false && t.isActive !== false),
    [filteredEmailTemplates, user]);

  const otherTemplates = useMemo(() =>
    filteredEmailTemplates.filter(t => t.isSystem === false && (t.createdBy == null || String(t.createdBy) !== String(user?.id)) && t.isActive !== false),
    [filteredEmailTemplates, user]);

  const systemTemplates = useMemo(() =>
    filteredEmailTemplates.filter(t => t.isSystem !== false && t.isActive !== false),
    [filteredEmailTemplates]);

  const inactiveTemplates = useMemo(() =>
    filteredEmailTemplates.filter(t => t.isActive === false),
    [filteredEmailTemplates]);

  // Derive per-section category groupings
  const templatesByCategoryFor = (sectionTemplates: EmailTemplate[]) => {
    const grouped: Record<string, EmailTemplate[]> = {};
    for (const template of sectionTemplates) {
      const cat = template.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(template);
    }
    return grouped;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccessToast("Copied", "Template content copied to clipboard");
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <SearchFiltersSection
        activeFilterCount={activeFilterCount}
        onClearFilters={clearAllFilters}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FilterLabel>Filter by Category</FilterLabel>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EMAIL_CATEGORIES.map((category) => {
                  const meta = CATEGORY_META[category];
                  const Icon = meta?.icon;
                  return (
                    <TooltipProvider key={category} delayDuration={800}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value={category}>
                            <span className="flex items-center gap-2">
                              {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                              {category}
                            </span>
                          </SelectItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>{meta?.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FilterLabel>Filter by Email Type</FilterLabel>
            <Select value={filterEmailType} onValueChange={setFilterEmailType}>
              <SelectTrigger>
                <SelectValue placeholder="All Email Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Email Types</SelectItem>
                {Object.entries(EMAIL_TYPE_META).map(([value, { icon: Icon, label }]) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FilterLabel>Filter by Recipient Type</FilterLabel>
            <Select value={filterRecipientType} onValueChange={setFilterRecipientType}>
              <SelectTrigger>
                <SelectValue placeholder="All Recipient Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Recipient Types</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Internal">Internal</SelectItem>
                <SelectItem value="External">External</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <FilterLabel>Include Project PDF</FilterLabel>
            <Select value={filterIncludePdf} onValueChange={setFilterIncludePdf}>
              <SelectTrigger>
                <SelectValue placeholder="All Templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Templates</SelectItem>
                <SelectItem value="yes">Yes - With PDF</SelectItem>
                <SelectItem value="no">No - Without PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SearchFiltersSection>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center text-[20px]">
            <div>
              <div className="flex items-center gap-2">
                <Mails className="h-5 w-5 text-primary" />
                <CardTitle className="tracking-tight font-bold text-[24px]"> Email Templates Library</CardTitle>
              </div>
            </div>
            <Button
              onClick={() => {
                try {
                  console.log('Create Template button clicked');
                  setIsCreateDialogOpen(true);
                } catch (error) {
                  console.error('Error opening create dialog:', error);
                  showErrorToast("Error", "Failed to open create template dialog");
                }
              }}
              title="Create a new email template"
            >
              <Mails className="h-4 w-4 mr-2" />
              Create Email Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
           {/* Email Templates List */}
          <div className="space-y-4">
            {templatesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading templates...</p>
              </div>
            ) : filteredEmailTemplates.length === 0 ? (
              <div className="text-center py-8">
                <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Email Templates Found</h3>
                <p className="text-muted-foreground mb-4">
                  {emailTemplates.length === 0
                    ? "Get started by creating your first email template."
                    : "No templates match your current filters. Try adjusting your search criteria."}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} title="Create your first email template">
                  <Mails className="h-4 w-4 mr-2" />
                  Create Email Template
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {([ 
                  { key: 'my', label: 'My Templates', icon: FolderHeart, iconColor: 'text-rose-500', templates: myTemplates, expanded: myTemplatesExpanded, onToggle: () => setMyTemplatesExpanded(v => !v) },
                  { key: 'other', label: 'Other Templates', icon: FolderCog, iconColor: 'text-amber-500', templates: otherTemplates, expanded: otherTemplatesExpanded, onToggle: () => setOtherTemplatesExpanded(v => !v) },
                  { key: 'system', label: 'System Templates', icon: FolderLock, iconColor: 'text-blue-500', templates: systemTemplates, expanded: systemTemplatesExpanded, onToggle: () => setSystemTemplatesExpanded(v => !v) },
                  { key: 'inactive', label: 'Inactive Templates', icon: FolderClock, iconColor: 'text-gray-400', templates: inactiveTemplates, expanded: inactiveTemplatesExpanded, onToggle: () => setInactiveTemplatesExpanded(v => !v) },
                ] as { key: string; label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string; templates: EmailTemplate[]; expanded: boolean; onToggle: () => void }[]).map(section => {
                  const sectionByCategory = templatesByCategoryFor(section.templates);
                  return (
                    <CollapsibleSection key={section.key} label={section.label} icon={section.icon} iconColor={section.iconColor} count={section.templates.length} expanded={section.expanded} onToggle={section.onToggle}>
                      <div className="grid grid-cols-2 gap-4 p-3 items-start">
                        {EMAIL_CATEGORIES
                          .filter(cat => (sectionByCategory[cat]?.length ?? 0) > 0)
                          .map(category => {
                            const meta = CATEGORY_META[category];
                            const CatSectionIcon = meta?.icon;
                            const catTemplates = sectionByCategory[category] || [];
                            const catKey = `${section.key}-${category}`;
                            const isOpen = !collapsedCategories.has(catKey);
                            return (
                              <div key={catKey} className="rounded-lg border border-l-4 border-l-blue-500 bg-muted/20 dark:bg-muted/10 overflow-hidden">
                                <button
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
                                  onClick={() => setCollapsedCategories(prev => {
                                    const next = new Set(prev);
                                    if (next.has(catKey)) next.delete(catKey);
                                    else next.add(catKey);
                                    return next;
                                  })}
                                >
                                  <div className="flex items-center gap-2">
                                    {CatSectionIcon && <CatSectionIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
                                    <span className="text-sm font-semibold">{category}</span>
                                    <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-1">{catTemplates.length}</Badge>
                                  </div>
                                  {isOpen
                                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                                </button>

                                {isOpen && (
                                  <div className="p-2 grid grid-cols-2 gap-2 border-t">
                                    {catTemplates.map((template: EmailTemplate) => {
                                      const isExpanded = expandedCardId === template.id;
                                      return (
                                        <Card
                                          key={`template-${template.id}`}
                                          className="relative border-l-4 border-l-blue-500 transition-all duration-200"
                                        >
                                          <div className="flex items-center justify-between p-3 gap-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Mails className={`h-4 w-4 shrink-0 ${template.isActive ? 'text-blue-600' : 'text-red-500'}`} />
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>{template.isActive ? 'Active Template' : 'Inactive Template'}</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                              <span className="text-sm font-medium truncate">{template.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              {!template.isActive && (
                                                <Badge variant="secondary" className="text-xs px-1.5 py-0">Inactive</Badge>
                                              )}
                                              {template.isSystem && (
                                                <Badge className="bg-black text-white hover:bg-gray-800 text-xs px-1.5 py-0">System</Badge>
                                              )}
                                              <ResponsiveTableActionsMenu
                                                actions={[
                                                  {
                                                    id: 'preview',
                                                    label: 'Preview email template',
                                                    icon: EyeIcon,
                                                    onClick: () => { setSelectedTemplate(template); setPreviewDialogOpen(true); }
                                                  },
                                                  {
                                                    id: 'edit',
                                                    label: 'Edit template',
                                                    icon: EditIcon,
                                                    onClick: () => {
                                                      try {
                                                        setSelectedTemplate(template);
                                                        setIsEditDialogOpen(true);
                                                      } catch (error) {
                                                        console.error('Error opening edit dialog:', error);
                                                        showErrorToast("Error", "Failed to open edit template dialog");
                                                      }
                                                    }
                                                  },
                                                  {
                                                    id: 'test',
                                                    label: 'Send test email',
                                                    icon: Mail,
                                                    onClick: () => { setSelectedTemplate(template); setIsTestEmailDialogOpen(true); }
                                                  },
                                                  {
                                                    id: 'delete',
                                                    label: template.isSystem ? "System templates cannot be deleted" : "Delete template",
                                                    icon: Trash2,
                                                    onClick: () => !template.isSystem && setTemplatePendingDelete(template),
                                                    variant: 'destructive',
                                                    disabled: template.isSystem,
                                                    separator: true
                                                  }
                                                ]}
                                              />
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-7 w-7 p-0"
                                                      onClick={() => setExpandedCardId(isExpanded ? null : template.id)}
                                                    >
                                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>{isExpanded ? 'Collapse details' : 'Expand details'}</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>
                                          </div>

                                          {isExpanded && (
                                            <div className="px-3 pb-3 pt-0 space-y-3 border-t">
                                              <p className="text-sm text-muted-foreground pt-3">{template.description}</p>
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Badge className="cursor-help text-xs bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 hover:bg-blue-100">
                                                        {(() => { const cm = CATEGORY_META[template.category]; const CI = cm?.icon; return (<span className="flex items-center gap-1">{CI && <CI className="h-3 w-3 shrink-0" />}{template.category}</span>); })()}
                                                      </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Category</p></TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                                {template.emailType && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge className="cursor-help text-xs bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700 hover:bg-orange-100">
                                                          {(() => { const tm = EMAIL_TYPE_META[template.emailType]; const TI = tm?.icon; const lbl = tm?.label ?? template.emailType.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); return (<span className="flex items-center gap-1">{TI && <TI className="h-3 w-3 shrink-0" />}{lbl}</span>); })()}
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent><p>Email Type</p></TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                                {template.recipientType && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge className="cursor-help text-xs bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700 hover:bg-purple-100">
                                                          <span className="flex items-center gap-1">
                                                            <Users className="h-3 w-3 shrink-0" />
                                                            {(() => { let r: string[] = []; if (Array.isArray(template.recipientType)) r = template.recipientType; else if (typeof template.recipientType === 'string' && template.recipientType) r = template.recipientType.split(',').map((t: string) => t.trim()); const d = r.map(t => { const l = t.toLowerCase(); if (l==='admin') return 'Admin'; if (l==='internal') return 'Internal'; if (l==='external') return 'External'; return null; }).filter(n => n !== null); return d.length > 0 ? d.join(', ') : 'None'; })()}
                                                          </span>
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent><p>Intended Recipients</p></TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                                {template.includeProjectPdf && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="default" className="text-xs cursor-help">PDF Attached</Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent><p>This template has "Include Project Details PDF" enabled in the form</p></TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                              </div>
                                              <div>
                                                <Label className="text-xs font-medium">Subject:</Label>
                                                <p className="text-sm text-muted-foreground">{template.subject}</p>
                                              </div>
                                            </div>
                                          )}
                                        </Card>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </CollapsibleSection>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      {/* Available Variables Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-2xl">
            <Variable className="h-5 w-5 mr-2 text-blue-600" />
            Available Template Variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(VARIABLE_CATEGORIES).map(([categoryName, variables], index) => {
              // Define color schemes for each section with dark mode support
              const colorSchemes = [
                {
                  bg: 'bg-blue-50 dark:bg-blue-950/80',
                  border: 'border-blue-200 dark:border-blue-800',
                  title: 'text-blue-800 dark:text-blue-300',
                  chevron: 'text-blue-600 dark:text-blue-400'
                },
                {
                  bg: 'bg-green-50 dark:bg-green-950/80',
                  border: 'border-green-200 dark:border-green-800',
                  title: 'text-green-800 dark:text-green-300',
                  chevron: 'text-green-600 dark:text-green-400'
                },
                {
                  bg: 'bg-purple-50 dark:bg-purple-950/80',
                  border: 'border-purple-200 dark:border-purple-800',
                  title: 'text-purple-800 dark:text-purple-300',
                  chevron: 'text-purple-600 dark:text-purple-400'
                },
                {
                  bg: 'bg-orange-50 dark:bg-orange-950/80',
                  border: 'border-orange-200 dark:border-orange-800',
                  title: 'text-orange-800 dark:text-orange-300',
                  chevron: 'text-orange-600 dark:text-orange-400'
                },
                {
                  bg: 'bg-rose-50 dark:bg-rose-950/80',
                  border: 'border-rose-200 dark:border-rose-800',
                  title: 'text-rose-800 dark:text-rose-300',
                  chevron: 'text-rose-600 dark:text-rose-400'
                },
                {
                  bg: 'bg-indigo-50 dark:bg-indigo-950/80',
                  border: 'border-indigo-200 dark:border-indigo-800',
                  title: 'text-indigo-800 dark:text-indigo-300',
                  chevron: 'text-indigo-600 dark:text-indigo-400'
                }
              ];

              const colorScheme = colorSchemes[index % colorSchemes.length];
              const isExpanded = expandedVariableCategories.has(categoryName);
              const variableCount = Object.keys(variables).length;
              const CategoryIcon = CATEGORY_ICONS[categoryName] || Variable;

              const toggleCategory = () => {
                setExpandedVariableCategories(prev => {
                  const next = new Set(prev);
                  if (next.has(categoryName)) {
                    next.delete(categoryName);
                  } else {
                    next.add(categoryName);
                  }
                  return next;
                });
              };

              return (
                <div key={categoryName} className={`p-4 rounded-lg border ${colorScheme.bg} ${colorScheme.border}`}>
                  <button 
                    onClick={toggleCategory}
                    className="w-full flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <CategoryIcon className={`h-5 w-5 ${colorScheme.title}`} />
                      <h4 className={`font-semibold text-sm capitalize tracking-wide ${colorScheme.title}`}>
                        {categoryName}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs bg-gray-900 text-white dark:bg-gray-900 dark:text-white">
                        {variableCount} variables
                      </Badge>
                      <ChevronDown 
                        className={`h-5 w-5 transition-transform duration-200 ${colorScheme.chevron} ${!isExpanded ? '-rotate-90' : ''}`}
                      />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mt-3">
                      {Object.entries(variables).map(([variable, description]) => (
                        <div key={variable} className="p-2 border rounded-lg bg-white dark:bg-gray-800 shadow-sm dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-100">
                              {variable}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(variable);
                              }}
                              title="Copy variable to clipboard"
                            >
                              <CopyPlus className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">{description as string}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {/* Dialogs */}
      {isCreateDialogOpen && (
        <EmailTemplateDialog
          isOpen={isCreateDialogOpen}
          onClose={() => {
            console.log('Closing create dialog');
            setIsCreateDialogOpen(false);
          }}
          onSubmit={(data) => {
            console.log('Submitting create template:', data);
            createTemplateMutation.mutate(data);
          }}
          title="Create Email Template"
          titleIcon={Mails}
          isLoading={createTemplateMutation.isPending}
          categories={EMAIL_CATEGORIES}
          activeEmailDesigns={activeEmailDesigns}
        />
      )}
      {selectedTemplate && isEditDialogOpen && (
        <EmailTemplateDialog
          // Key on selectedTemplate.id only. The prior `Date.now()` here was
          // re-computed on every parent render, which forced the dialog to
          // unmount and remount on every render of EmailTemplatesSection.
          // Each remount reset the dialog's `formData` to its initial state
          // (e.g. `designId: null`), so any parent re-render that landed
          // before the hydration useEffect could fire left the form
          // stuck with `designId = null` — the user-visible symptom was
          // "Email Design dropdown shows 'No Email Design Wrapper Template'
          // on every system template even though the DB has designId set".
          key={`edit-${selectedTemplate.id}`}
          isOpen={isEditDialogOpen}
          onClose={() => {
            console.log('Closing edit dialog');
            setIsEditDialogOpen(false);
            setSelectedTemplate(null);
          }}
          onSubmit={(data) => {
            console.log('Submitting edit template:', data);
            if (selectedTemplate?.id) {
              updateTemplateMutation.mutate({
                id: selectedTemplate.id,
                data
              });
            }
          }}
          title={
            <div className="flex items-center gap-2">
              <SquarePen className="h-5 w-5" />
              <span>Edit Email Template</span>
            </div>
          }
          initialData={selectedTemplate}
          isLoading={updateTemplateMutation.isPending}
          categories={EMAIL_CATEGORIES}
          activeEmailDesigns={activeEmailDesigns}
        />
      )}
      {/* Preview Dialog */}
      {selectedTemplate && (
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Template Preview: {selectedTemplate.name}</DialogTitle>
              <DialogDescription>
                This is how the email template will appear when sent (with legacy vendor branding and sample data)
              </DialogDescription>
            </DialogHeader>
            <EmailTemplatePreview template={selectedTemplate} />
          </DialogContent>
        </Dialog>
      )}
      {/* Test Email Dialog */}
      {selectedTemplate && (
        <Dialog open={isTestEmailDialogOpen} onOpenChange={setIsTestEmailDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send Test Email</DialogTitle>
              <DialogDescription>
                Send a test email using the "{selectedTemplate.name}" template to verify the email system and see how the template looks.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="testEmail">Email Address</Label>
                <Input
                  id="testEmail"
                  type="email"
                  placeholder="test@example.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the email address where you want to send the test email.
                </p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-1">Template Info:</h4>
                <p className="text-sm text-blue-700">Subject: {selectedTemplate.subject}</p>
                <p className="text-sm text-blue-700">Category: {selectedTemplate.category}</p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => {
                  setIsTestEmailDialogOpen(false);
                  setTestEmailAddress("");
                }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (testEmailAddress.trim()) {
                      sendTestEmailMutation.mutate({
                        templateId: selectedTemplate.id,
                        emailAddress: testEmailAddress.trim()
                      });
                    }
                  }}
                  disabled={!testEmailAddress.trim() || sendTestEmailMutation.isPending}
                >
                  {sendTestEmailMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-3 w-3 mr-2" />
                      Send Test Email
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmationDialog
        open={templatePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTemplatePendingDelete(null);
          }
        }}
        title="Delete email template?"
        description={
          templatePendingDelete
            ? `This will permanently delete "${templatePendingDelete.name}". This action cannot be undone. Continue?`
            : ""
        }
        confirmLabel="Delete template"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (templatePendingDelete?.id) {
            deleteTemplateMutation.mutate(templatePendingDelete.id);
          }
          setTemplatePendingDelete(null);
        }}
        onCancel={() => setTemplatePendingDelete(null)}
      />
    </div>
  );
}
