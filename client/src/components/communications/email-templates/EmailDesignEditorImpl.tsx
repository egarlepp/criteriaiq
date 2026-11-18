import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { sanitizeEmailHtml } from '@/lib/safeHtml';
import { useDialogPortalContainer } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Code, Eye, Monitor, AlertTriangle, Variable, HelpCircle } from 'lucide-react';
import { ResizableModal } from '@/components/ui/ResizableModal';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { processHtmlWithVariables, SAMPLE_BODY_CONTENT } from '../utils';
// TinyMCE is self-hosted (copied to /tinymce/ by the Vite plugin) and loaded
// via scriptSrc on the <Editor> component. Static ES module imports are NOT
// used here because Rolldown (Vite 8) produces a single vendor-tinymce chunk
// where TinyMCE's plugins reference `tinymce` before the core module export
// is initialised, causing a TDZ ReferenceError at runtime.

type ViewMode = 'code' | 'visual';

interface EmailDesignEditorProps {
  value: string;
  onChange: (content: string) => void;
  height?: number;
  editorKey?: string | number;
  designVariables?: {
    logoSrc?: string;
    logoAlt?: string;
    logoWidth?: string;
    logoHeight?: string;
    graphic1?: string;
    graphic2?: string;
    graphic3?: string;
    headerBg?: string;
    rightTitle?: string;
    footerLine1?: string;
    footerLine2?: string;
  };
}

export const EmailDesignEditor: React.FC<EmailDesignEditorProps> = ({
  value,
  onChange,
  height = 400,
  editorKey,
  designVariables = {}
}) => {
  const editorRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogContainer = useDialogPortalContainer();
  const { toast } = useToast();
  
  const [viewMode, setViewMode] = useState<ViewMode>('code');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [pendingModeSwitch, setPendingModeSwitch] = useState<ViewMode | null>(null);
  const [isButtonHelpOpen, setIsButtonHelpOpen] = useState(false);

  // Build variable items for the dropdown menu with Logo & Graphics category
  const buildVariableMenuItems = () => {
    const items: any[] = [];
    
    // Email Design Placeholder Category (mandatory for email designs)
    items.push({
      type: 'nestedmenuitem',
      text: 'Email Design Placeholder',
      getSubmenuItems: () => [
        {
          type: 'menuitem',
          text: '{{BODY_TEXT_CONTENT}} - Email content insertion point (required)',
          onAction: () => {
            if (editorRef.current) {
              editorRef.current.insertContent('{{BODY_TEXT_CONTENT}}');
            }
          }
        }
      ]
    });

    // Logo & Graphics Category
    const logoGraphicsVariables: Record<string, string> = {
      '{{LOGO_SRC}}': `Logo source URL (current: ${designVariables.logoSrc || 'not set'})`,
      '{{LOGO_ALT}}': `Logo alt text (current: ${designVariables.logoAlt || 'not set'})`,
      '{{LOGO_WIDTH}}': `Logo width in pixels (current: ${designVariables.logoWidth || 'not set'})`,
      '{{LOGO_HEIGHT}}': `Logo height in pixels (current: ${designVariables.logoHeight || 'not set'})`,
      '{{GRAPHIC1}}': `Additional graphic 1 URL (current: ${designVariables.graphic1 || 'not set'})`,
      '{{GRAPHIC2}}': `Additional graphic 2 URL (current: ${designVariables.graphic2 || 'not set'})`,
      '{{GRAPHIC3}}': `Additional graphic 3 URL (current: ${designVariables.graphic3 || 'not set'})`
    };

    items.push({
      type: 'nestedmenuitem',
      text: 'Logo & Graphics',
      getSubmenuItems: () => {
        return Object.entries(logoGraphicsVariables).map(([variable, description]) => ({
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

    // Design Styling Category
    const designStylingVariables: Record<string, string> = {
      '{{HEADER_BG}}': `Header background color (current: ${designVariables.headerBg || '#1e3a8a'})`,
      '{{RIGHT_TITLE}}': `Right-side header title (current: ${designVariables.rightTitle || 'CriteriaIQ'})`,
      '{{FOOTER_LINE1}}': `Footer line 1 (current: ${designVariables.footerLine1 || 'not set'})`,
      '{{FOOTER_LINE2}}': `Footer line 2 (current: ${designVariables.footerLine2 || 'not set'})`
    };

    items.push({
      type: 'nestedmenuitem',
      text: 'Design Styling',
      getSubmenuItems: () => {
        return Object.entries(designStylingVariables).map(([variable, description]) => ({
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
    
    return items;
  };

  // Memoize init config with better content preservation settings
  const initConfig = useMemo(() => {
    const baseConfig = {
      height: height,
      menubar: false,
      // skin / content_css are loaded from /tinymce/ (self-hosted via scriptSrc).
      // Do NOT set skin:false here — that was only needed when the CSS was
      // bundled as a module import; with scriptSrc TinyMCE fetches them itself.
      toolbar_mode: 'scrolling' as const,
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
      
      // Disable aggressive content filtering
      verify_html: false,
      allow_html_in_named_anchor: true,
      extended_valid_elements: '*[*]',
      valid_children: '+body[style],+a[div|h1|h2|h3|h4|h5|h6|p|#text]',
      custom_elements: '*[*]',
      
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
  }, [height, dialogContainer, designVariables]);

  // Teach the Dialog/Modal focus trap to ignore TinyMCE UI elements
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

  // Handle view mode switching with toast warning
  const handleModeSwitch = (newMode: ViewMode) => {
    if (viewMode === 'code' && newMode === 'visual') {
      // Warn user about potential content stripping
      setPendingModeSwitch(newMode);
      const { dismiss } = toast({
        title: 'Switch to Visual View?',
        description: 'Visual mode may strip complex HTML structures like nested tables, inline styles, and custom attributes. Your content will be simplified.',
        variant: 'warning',
        icon: AlertTriangle,
        action: (
          <div className="flex gap-2 w-full">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setViewMode(newMode);
                setPendingModeSwitch(null);
                dismiss();
              }}
              className="flex-1"
            >
              Continue
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingModeSwitch(null);
                dismiss();
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        ),
        duration: 10000
      });
    } else {
      setViewMode(newMode);
    }
  };

  // Handle preview
  const handlePreview = () => {
    const processed = processHtmlWithVariables(value, designVariables, true);
    setPreviewHtml(processed);
    setIsPreviewOpen(true);
  };

  // Insert variable in code view
  const insertVariableInCodeView = (variable: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newValue = before + variable + after;
      onChange(newValue);
      
      // Set cursor position after inserted variable
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        textarea.focus();
      }, 0);
    }
  };

  // Available variables for the dropdown, organized by group
  const variableGroups = [
    {
      label: 'Design & Branding',
      variables: [
        { value: '{{BODY_TEXT_CONTENT}}', label: 'Body Content' },
        { value: '{{HEADER_BG}}', label: 'Header Background' },
        { value: '{{LOGO_SRC}}', label: 'Logo Source' },
        { value: '{{LOGO_ALT}}', label: 'Logo Alt Text' },
        { value: '{{LOGO_WIDTH}}', label: 'Logo Width' },
        { value: '{{LOGO_HEIGHT}}', label: 'Logo Height' },
        { value: '{{RIGHT_TITLE}}', label: 'Right Title' },
        { value: '{{FOOTER_LINE1}}', label: 'Footer Line 1' },
        { value: '{{FOOTER_LINE2}}', label: 'Footer Line 2' },
      ],
    },
    {
      label: 'Content Variables',
      variables: [
        { value: '{{projectName}}', label: 'Project Name' },
        { value: '{{customerName}}', label: 'Customer Name' },
        { value: '{{projectStatus}}', label: 'Project Status' },
      ],
    },
    {
      label: 'User & System',
      variables: [
        { value: '{{userName}}', label: 'Recipient Full Name' },
        { value: '{{userEmail}}', label: 'User Email' },
        { value: '{{dashboardUrl}}', label: 'Dashboard URL' },
        { value: '{{supportEmail}}', label: 'Support Email' },
      ],
    },
  ];

  return (
    <div className="space-y-2">
      {/* View Mode Toggle and Controls */}
      <div className="flex items-center justify-between">
        {/* Toggle Buttons for Mode Switching */}
        <TooltipProvider>
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleModeSwitch('code')}
                  className={cn(
                    "rounded-r-none",
                    viewMode === 'code' && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  )}
                  aria-label="Code View"
                >
                  <Code className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Code View - Edit raw HTML</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleModeSwitch('visual')}
                  className={cn(
                    "rounded-l-none border-l-0",
                    viewMode === 'visual' && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  )}
                  aria-label="Visual View"
                >
                  <Monitor className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Visual View - WYSIWYG editor</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* Variable Dropdown and Preview Button (Code View Only) */}
        {viewMode === 'code' && (
          <div className="flex items-center gap-2">
            <Select onValueChange={(value) => insertVariableInCodeView(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Insert Variable..." />
              </SelectTrigger>
              <SelectContent>
                {variableGroups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </SelectLabel>
                    {group.variables.map((variable) => (
                      <SelectItem key={variable.value} value={variable.value}>
                        <div className="flex items-center gap-2">
                          <Variable className="h-4 w-4" />
                          <span>{variable.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePreview}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Preview Design</p>
                </TooltipContent>
              </Tooltip>
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
        )}
      </div>

      {/* Code View */}
      {viewMode === 'code' && (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-sm"
            style={{ height: `${height}px`, minHeight: `${height}px` }}
            placeholder="Enter your HTML email design here..."
          />
        </div>
      )}

      {/* Visual View (TinyMCE) */}
      {viewMode === 'visual' && (
        <Editor
          key={editorKey}
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
      )}

      {/* Preview Modal */}
      <ResizableModal
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        title="Email Design Preview"
        titleIcon={Eye}
      >
        <div className="p-4">
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              This preview shows your email design with sample data filled in. Variables are replaced with their current values.
            </p>
          </div>
          <div 
            className="border rounded p-4 bg-white overflow-auto"
            style={{ maxHeight: '600px' }}
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(previewHtml) }}
          />
        </div>
      </ResizableModal>

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
