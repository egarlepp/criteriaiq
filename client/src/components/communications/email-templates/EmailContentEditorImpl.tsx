import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { useDialogPortalContainer } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { HelpCircle } from 'lucide-react';
import { ResizableModal } from '@/components/ui/ResizableModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
// TinyMCE is self-hosted (copied to /tinymce/ by the Vite plugin) and loaded
// via scriptSrc on the <Editor> component. Static ES module imports are NOT
// used here because Rolldown (Vite 8) produces a single vendor-tinymce chunk
// where TinyMCE's plugins reference `tinymce` before the core module export
// is initialised, causing a TDZ ReferenceError at runtime.

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

interface EmailContentEditorProps {
  value: string;
  onChange: (content: string) => void;
  height?: number;
  emailSafeMode?: boolean;
}

export const EmailContentEditor: React.FC<EmailContentEditorProps> = ({
  value,
  onChange,
  height = 400,
  emailSafeMode = true
}) => {
  const editorRef = useRef<any>(null);
  const dialogContainer = useDialogPortalContainer();
  const [isButtonHelpOpen, setIsButtonHelpOpen] = useState(false);

  // Build variable items for the dropdown menu
  const buildVariableMenuItems = () => {
    const items: any[] = [];
    
    Object.entries(VARIABLE_CATEGORIES).forEach(([category, variables]) => {
      items.push({
        type: 'nestedmenuitem',
        text: category,
        getSubmenuItems: () => {
          return Object.entries(variables).map(([variable, description]) => ({
            type: 'menuitem',
            text: `${variable} - ${description}`,
            onAction: () => {
              if (editorRef.current) {
                editorRef.current.insertContent(variable);
              }
            }
          }));
        }
      });
    });
    
    return items;
  };

  // Memoize init config, conditionally adding ui_container/ui_mode for Dialog contexts
  // For ResizableModal (no dialogContainer), TinyMCE renders normally with focusin handler
  const initConfig = useMemo(() => {
    const baseConfig = {
      height: height,
      menubar: false,
      // skin / content_css are loaded from /tinymce/ (self-hosted via scriptSrc).
      toolbar_mode: 'scrolling' as const,
      inline_styles: emailSafeMode,
      plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'wordcount'
      ],
      toolbar: 'undo redo | formatselect | bold italic underline strikethrough | ' +
        'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
        'bullist numlist outdent indent | table | link image | ' +
        'insertvariable | removeformat | code',
      content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }',
      
      setup: (editor: any) => {
        editor.ui.registry.addMenuButton('insertvariable', {
          text: 'Insert Variable',
          icon: 'template',
          fetch: (callback: any) => {
            callback(buildVariableMenuItems());
          }
        });
      }
    };
    
    // Add ui_container and ui_mode only when Dialog context is available
    if (dialogContainer) {
      return {
        ...baseConfig,
        ui_container: dialogContainer,
        ui_mode: 'split' as const,
      };
    }
    
    return baseConfig;
  }, [height, dialogContainer, emailSafeMode]);

  // Teach the Dialog/Modal focus trap to ignore TinyMCE UI elements
  // This prevents Radix Dialog and ResizableModal focus traps from interfering with TinyMCE popups/menus
  useEffect(() => {
    const stopTrap = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('.tox, .tox-dialog, .tox-menu, .moxman-window, .tam-assetmanager-root')) {
        e.stopImmediatePropagation?.();
        e.stopPropagation();
      }
    };
    // Capture phase so we intercept before the Dialog/Modal's focus trap
    document.addEventListener('focusin', stopTrap, true);
    return () => document.removeEventListener('focusin', stopTrap, true);
  }, []);

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsButtonHelpOpen(true)}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Button Code Example</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* TinyMCE Editor */}
      <Editor
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        onInit={(_evt: any, editor: any) => {
          editorRef.current = editor;
        }}
        value={value}
        onEditorChange={(content: string) => {
          onChange(content);
        }}
        licenseKey='gpl'
        init={initConfig}
      />

      {/* Button Code Example Modal */}
      <ResizableModal
        open={isButtonHelpOpen}
        onOpenChange={setIsButtonHelpOpen}
        title="Email-Safe Button Code"
        titleIcon={HelpCircle}
      >
        <div className="p-4 space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Use this "bulletproof" button code that works across all email clients, including Outlook. 
              Replace <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">{'{{URL}}'}</code> with your actual URL and customize the button text.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Code to Copy:</Label>
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto border">
{`<!-- CTA: Reset Password -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
  <tr>
    <td align="left" style="mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{URL}}"
        style="height:44px;v-text-anchor:middle;width:240px;" arcsize="10%"
        fillcolor="#0f3796" strokecolor="#0f3796">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial, Helvetica, sans-serif;
                       font-size:16px;font-weight:bold;">
          Reset Password
        </center>
      </v:roundrect>
      <![endif]-->

      <!--[if !mso]><!-- -->
      <a href="{{URL}}" target="_blank"
         style="display:inline-block;background:#0f3796;color:#ffffff;
                padding:12px 24px;text-decoration:none;border-radius:6px;
                font-family:Arial, Helvetica, sans-serif;font-size:16px;
                font-weight:bold;line-height:20px;">
        Reset Password
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`}
            </pre>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Live Example:</Label>
            <div className="p-4 border rounded bg-white dark:bg-gray-900 text-center">
              <table role="presentation" cellSpacing="0" cellPadding="0" style={{ margin: '20px auto' }}>
                <tbody>
                  <tr>
                    <td align="left">
                      <a href="#" target="_blank"
                         style={{
                           display: 'inline-block',
                           background: '#0f3796',
                           color: '#ffffff',
                           padding: '12px 24px',
                           textDecoration: 'none',
                           borderRadius: '6px',
                           fontFamily: 'Arial, Helvetica, sans-serif',
                           fontSize: '16px',
                           fontWeight: 'bold',
                           lineHeight: '20px'
                         }}>
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              💡 <strong>Tip:</strong> This button uses VML (Vector Markup Language) for Outlook and standard HTML for other clients. 
              The <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'<!--[if mso]>'}</code> conditional ensures perfect rendering in all email clients.
            </p>
          </div>
        </div>
      </ResizableModal>
    </div>
  );
};
