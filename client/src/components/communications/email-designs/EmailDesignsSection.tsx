import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showInfoToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeEmailHtml } from "@/lib/safeHtml";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Plus, Mail, Edit, Eye, Copy, Trash2, PencilRuler, PencilLine, Variable, Image, ChevronDown, ChevronRight, Info, Save, SquarePen, CodeXml, X, ScanEye, FolderHeart, FolderCog, FolderLock, FolderClock, Star } from "lucide-react";
import { ResizableModal } from "@/components/ui/ResizableModal";
import { Textarea } from "@/components/ui/textarea";
import { EmailDesignEditor } from "@/components/communications/email-templates/EmailDesignEditor";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SortableTable, SortableTableHead, SortableTableHeader, SortableTableBody, SortableTableRow, SortableTableCell } from '@/components/ui/sortable-table';
import { useUrlSortState, makeComparator, stableSort } from '@/lib/sorting';
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { EmailDesign } from "../types";
import { getAssetPath, DEFAULT_DESIGN_VARIABLES, SAMPLE_BODY_CONTENT, processHtmlWithVariables, DEFAULT_EMAIL_DESIGN_TEMPLATE } from "../utils";

interface EmailDesignsSectionProps {
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

// Strip both the legacy `/attached_assets/uploads_email/` prefix and the
// new canonical `/api/files/system/email-assets/` prefix when displaying
// the bare filename in the form inputs — admins typed bare filenames before
// the migration and we don't want to break their muscle memory.
function stripEmailAssetPrefix(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/^\/attached_assets\/uploads_email\//, '')
    .replace(/^\/api\/files\/system\/email-assets\//, '');
}

export function EmailDesignDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  initialData,
  isLoading
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  title: string;
  initialData?: any;
  isLoading: boolean;
}) {
  
  const { userRole } = usePermissions();
  const isAdmin = userRole === 'Admin';
  const [formData, setFormData] = useState<any>({
    name: "",
    description: "",
    htmlRaw: "",
    isActive: true,
    isSystem: false,
    designVariables: { ...DEFAULT_DESIGN_VARIABLES }
  });

  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [isVariablesOpen, setIsVariablesOpen] = useState(false);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  // Storage config — drives the dynamic "Path:" display below the Logo
  // input so admins see where their assets actually live (Files DB, cloud
  // bucket, or local disk) instead of a hardcoded attached_assets/... path.
  const [storageProviderLabel, setStorageProviderLabel] = useState<string>('Storage');
  useEffect(() => {
    if (!isOpen) return;
    const fetchAssets = async () => {
      try {
        const assets = await apiRequest('GET', '/api/admin/email-assets');
        console.log('Fetched assets:', assets);
        setAvailableAssets(assets || []);
      } catch (error) {
        console.error('Error fetching assets:', error);
        setAvailableAssets([]);
      }
    };
    const fetchStorageConfig = async () => {
      try {
        const cfg: any = await apiRequest('GET', '/api/admin/storage/config');
        const provider = cfg?.activeProvider ?? 'local';
        const label =
          provider === 'db' ? `Database (${cfg?.filesDb?.dbName ?? 'files DB'})`
          : provider === 'gcs' ? 'Google Cloud Storage'
          : provider === 'aws' ? 'AWS S3'
          : provider === 'azure' ? 'Azure Blob'
          : 'Local disk';
        setStorageProviderLabel(label);
      } catch (error) {
        setStorageProviderLabel('Storage');
      }
    };
    fetchAssets();
    fetchStorageConfig();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        ...initialData,
        designVariables: initialData.designVariables || { ...DEFAULT_DESIGN_VARIABLES }
      });
    } else if (isOpen && !initialData) {
      setFormData({
        name: "",
        description: "",
        htmlRaw: DEFAULT_EMAIL_DESIGN_TEMPLATE,
        isActive: true,
        designVariables: { ...DEFAULT_DESIGN_VARIABLES }
      });
    }
  }, [isOpen, initialData?.id]);

  useEffect(() => {
    if (formData.htmlRaw) {
      const processed = processHtmlWithVariables(formData.htmlRaw, formData.designVariables, true);
      setPreviewHtml(processed);
    } else {
      setPreviewHtml('');
    }
  }, [formData.htmlRaw, formData.designVariables]);

  const handleAssetUpload = async (file: File) => {
    // Client-side mirror of the server allowlist. SVG is intentionally
    // omitted (most email clients silently drop inline SVG so allowing
    // it would let admins ship images that render in preview but
    // disappear in recipient inboxes). 2 MB matches EMAIL_ASSET_MAX_BYTES.
    const allowedTypes = ['image/gif', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showErrorToast("Invalid file type", "Only PNG, JPG, JPEG, WEBP, and GIF files are allowed");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      showErrorToast("File too large", "Maximum file size is 2MB");
      return;
    }

    setUploadingAsset(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('asset', file);

      const response = await fetch('/api/admin/email-assets/upload', {
        method: 'POST',
        credentials: 'include',
        body: formDataUpload,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || 'Upload failed');
      }

      const asset = await response.json();

      const refreshedAssets = await apiRequest('GET', '/api/admin/email-assets');
      setAvailableAssets(refreshedAssets || []);

      setFormData({
        ...formData,
        designVariables: {
          ...formData.designVariables,
          logoSrc: asset.name
        }
      });

      showSuccessToast("Success", "Asset uploaded successfully");
    } catch (error: any) {
      showErrorToast("Error", error?.message || "Failed to upload asset");
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.htmlRaw && !formData.htmlRaw.includes('{{BODY_TEXT_CONTENT}}')) {
      showWarningToast("Warning", "Your HTML design should include {{BODY_TEXT_CONTENT}} placeholder for email content to be inserted.");
      return;
    }

    onSubmit(formData);
  };

  return (
    <ResizableModal
      open={isOpen}
      onOpenChange={onClose}
      title={title}
      titleIcon={SquarePen}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Design Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Corporate Newsletter Design"
              disabled={formData.isSystem}
              className={formData.isSystem ? "bg-gray-100 cursor-not-allowed" : ""}
              required
            />
            {formData.isSystem && (
              <p className="text-xs text-blue-600 mt-1">System design name cannot be changed</p>
            )}
          </div>
          <div className="flex items-center space-x-4 pt-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive ?? true}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                disabled={formData.isSystem}
              />
              <Label htmlFor="isActive" className={formData.isSystem ? "text-gray-500" : ""}>Active</Label>
              {formData.isSystem && (
                <span className="text-xs text-blue-600 ml-2">(System design)</span>
              )}
            </div>
            
            {isAdmin && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="isSystem"
                  checked={formData.isSystem ?? false}
                  onCheckedChange={(checked) => setFormData({ ...formData, isSystem: checked })}
                />
                <Label htmlFor="isSystem">System</Label>
              </div>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="description">Description (Optional)</Label>
          <Input
            id="description"
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this email design"
            disabled={formData.isSystem}
            className={formData.isSystem ? "bg-gray-100 cursor-not-allowed" : ""}
          />
          {formData.isSystem && (
            <p className="text-xs text-blue-600 mt-1">System design description cannot be changed</p>
          )}
        </div>

        <Collapsible open={isVariablesOpen} onOpenChange={setIsVariablesOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center">
                <Image className="h-4 w-4 mr-2" />
                Logo & Graphics
              </div>
              {isVariablesOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">Available Assets ({availableAssets.length})</p>
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAssetUpload(file);
                  }}
                  style={{ display: 'none' }}
                  id="asset-upload"
                />
                <label htmlFor="asset-upload">
                  <Button type="button" variant="outline" size="sm" disabled={uploadingAsset} asChild>
                    <span>
                      {uploadingAsset ? 'Uploading...' : 'Upload New Asset'}
                    </span>
                  </Button>
                </label>
              </div>

              <div className="text-sm text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 p-2 rounded">
                <strong>Maximum file size:</strong> 2MB<br />
                <strong>Accepted formats:</strong> PNG, JPG, JPEG, WEBP, GIF<br />
                <strong>Stored in:</strong> {storageProviderLabel} → <code className="bg-white dark:bg-gray-900 dark:text-gray-100 px-1 rounded text-xs">system/email-assets/</code>
              </div>

              {availableAssets.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2 bg-white dark:bg-gray-900">
                  {availableAssets.map((asset: any, index) => (
                    <div
                      key={`${asset.folder || 'root'}-${asset.name}-${index}`}
                      className="border border-gray-200 dark:border-gray-700 rounded p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          designVariables: {
                            ...formData.designVariables,
                            logoSrc: asset.name
                          }
                        });
                        showInfoToast("Selected", `Asset selected: ${asset.name}`);
                      }}
                      title={`Click to select: ${asset.name}`}
                    >
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-12 object-contain"
                        onError={(e) => {
                          console.error('Failed to load asset image:', asset.url);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <p className="text-xs text-center mt-1 truncate text-gray-700 dark:text-gray-300">{asset.name}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No assets found in any folder</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Label>Logo</Label>
                <div className="relative group">
                  <button
                    type="button"
                    className="w-4 h-4 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center hover:bg-gray-400 transition-colors"
                    title="Logo filename in the email-assets storage area. Use {{LOGO_SRC}} variable in your HTML design."
                  >
                    ?
                  </button>
                </div>
              </div>
              <Input
                value={stripEmailAssetPrefix(formData.designVariables.logoSrc)}
                onChange={(e) => setFormData({
                  ...formData,
                  designVariables: { ...formData.designVariables, logoSrc: e.target.value }
                })}
                placeholder="Select from assets above or enter filename"
              />
              <p className="text-xs text-muted-foreground">
                {storageProviderLabel} → <code className="bg-gray-100 dark:bg-gray-800 dark:text-gray-200 px-1 rounded">system/email-assets/{stripEmailAssetPrefix(formData.designVariables.logoSrc) || 'filename'}</code>
              </p>
            </div>

            {/* Graphic 1/2/3 — drop-downs bound to the Available Assets
                list so admins pick from uploaded files instead of typing
                filenames. Special "(None)" sentinel maps to an empty
                value, which the email render path treats as "no graphic". */}
            <div className="grid grid-cols-3 gap-4">
              {([1, 2, 3] as const).map((slotNum) => {
                const fieldKey = `graphic${slotNum}` as 'graphic1' | 'graphic2' | 'graphic3';
                const currentBare = stripEmailAssetPrefix(formData.designVariables[fieldKey]);
                return (
                  <div key={slotNum} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Label>Graphic {slotNum}</Label>
                      <div className="relative group">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center hover:bg-gray-400 transition-colors"
                          title={`Choose an uploaded asset to embed in the design. Use {{GRAPHIC${slotNum}}} variable in your HTML.`}
                        >
                          ?
                        </button>
                      </div>
                    </div>
                    <Select
                      value={currentBare || '__none__'}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        designVariables: {
                          ...formData.designVariables,
                          [fieldKey]: value === '__none__' ? '' : value,
                        },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None — leave blank" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None — leave blank</SelectItem>
                        {availableAssets.map((asset: any) => (
                          <SelectItem key={asset.name} value={asset.name}>
                            {asset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Logo Alt Text</Label>
                <Input
                  value={formData.designVariables.logoAlt || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    designVariables: { ...formData.designVariables, logoAlt: e.target.value }
                  })}
                  placeholder="Solutions Engineering"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Width (px)</Label>
                  <Input
                    type="number"
                    value={formData.designVariables.logoWidth || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      designVariables: { ...formData.designVariables, logoWidth: e.target.value }
                    })}
                    placeholder="160"
                  />
                </div>
                <div>
                  <Label>Height (px)</Label>
                  <Input
                    type="number"
                    value={formData.designVariables.logoHeight || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      designVariables: { ...formData.designVariables, logoHeight: e.target.value }
                    })}
                    placeholder="48"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Label>Header Background Color</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Background color for the email header. Variable: {"{{HEADER_BG}}"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex space-x-2">
                  <Input
                    type="color"
                    value={formData.designVariables.headerBg || "#1e3a8a"}
                    onChange={(e) => setFormData({
                      ...formData,
                      designVariables: { ...formData.designVariables, headerBg: e.target.value }
                    })}
                    className="w-16"
                  />
                  <Input
                    value={formData.designVariables.headerBg || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      designVariables: { ...formData.designVariables, headerBg: e.target.value }
                    })}
                    placeholder="#1e3a8a"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Right Title</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Title text displayed on the right side of the header. Variable: {"{{RIGHT_TITLE}}"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  value={formData.designVariables.rightTitle || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    designVariables: { ...formData.designVariables, rightTitle: e.target.value }
                  })}
                  placeholder="CriteriaIQ"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Footer Line 1</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>First line of the email footer. Variable: {"{{FOOTER_LINE1}}"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                value={formData.designVariables.footerLine1 || ""}
                onChange={(e) => setFormData({
                  ...formData,
                  designVariables: { ...formData.designVariables, footerLine1: e.target.value }
                })}
                placeholder="This email was sent from the CriteriaIQ Technical Validation"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Footer Line 2</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Second line of the email footer. Variable: {"{{FOOTER_LINE2}}"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                value={formData.designVariables.footerLine2 || ""}
                onChange={(e) => setFormData({
                  ...formData,
                  designVariables: { ...formData.designVariables, footerLine2: e.target.value }
                })}
                placeholder="© your organization. All rights reserved."
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Informative Banner */}
        <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Include <code className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-blue-800 dark:text-blue-200 font-mono text-xs">{"{{BODY_TEXT_CONTENT}}"}</code> placeholder where you want email content to be inserted
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              This placeholder is required and will be replaced with the email template content when emails are sent.
            </p>
          </div>
        </div>
        <Separator className="my-2" />
        {/* Email Design Editor */}
        <div className="space-y-2">
            <Label htmlFor="htmlDesign">
                <CodeXml className="inline-block mr-1 h-5 w-5" aria-hidden="true" />
                Email Design HTML</Label>
              <CardDescription>
                Use email rich-text editor to create exterior design wrapper. Use the toolbar's "Insert Variable" button to Insert variables.
              </CardDescription>
            <EmailDesignEditor
              value={formData.htmlRaw || ""}
              onChange={(content) => setFormData({ ...formData, htmlRaw: content })}
              height={500}
              editorKey={initialData?.id || 'new'}
              designVariables={formData.designVariables}
            />
          {initialData?.isSystem && (
            <p className="text-xs text-blue-600 mt-1">System design HTML cannot be changed</p>
          )}
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            <Save className="h-4 w-4 mr-1" />
            {isLoading ? "Saving..." : "Save Design"}
          </Button>
        </div>
      </form>
    </ResizableModal>
  );
}

export default function EmailDesignsSection({ activeTab }: EmailDesignsSectionProps) {
  const { user } = useAuth();
  
  const queryClient = useQueryClient();
  const [selectedDesign, setSelectedDesign] = useState<any | null>(null);
  const [isCreateDesignDialogOpen, setIsCreateDesignDialogOpen] = useState(false);
  const [isEditDesignDialogOpen, setIsEditDesignDialogOpen] = useState(false);
  const [isPreviewDesignDialogOpen, setIsPreviewDesignDialogOpen] = useState(false);
  const [designPendingDefault, setDesignPendingDefault] = useState<any | null>(null);
  const [designPendingDelete, setDesignPendingDelete] = useState<any | null>(null);
  const [isContentVarsOpen, setIsContentVarsOpen] = useState(false);
  const [isUserVarsOpen, setIsUserVarsOpen] = useState(false);
  const [isBrandingVarsOpen, setIsBrandingVarsOpen] = useState(false);
  const [designSortConfig, handleDesignSort] = useUrlSortState('emailDesigns');
  const [myDesignsExpanded, setMyDesignsExpanded] = useState(true);
  const [otherDesignsExpanded, setOtherDesignsExpanded] = useState(true);
  const [systemDesignsExpanded, setSystemDesignsExpanded] = useState(true);
  const [inactiveDesignsExpanded, setInactiveDesignsExpanded] = useState(false);

  const { data: emailDesignsData = [], isLoading: designsLoading, error: designsError } = useQuery({
    queryKey: ['/api/email-designs'],
    queryFn: () => apiRequest('GET', '/api/email-designs'),
    enabled: activeTab === "email-designs",
    retry: 1,
    retryOnMount: false,
  });

  const emailDesigns = useMemo(() => {
    if (!emailDesignsData) return [];
    let designs = Array.isArray(emailDesignsData) ? emailDesignsData : [];

    if (designSortConfig) {
      const comparator = makeComparator(designSortConfig);
      designs = stableSort([...designs], comparator);
    }

    return designs;
  }, [emailDesignsData, designSortConfig]);

  // Section split: My / Other / System / Inactive.
  // The default-wrapper row is grouped under System even when isSystem=false.
  const myDesigns = useMemo(() =>
    emailDesigns.filter((d: any) => d.createdBy != null && String(d.createdBy) === String(user?.id) && d.isSystem === false && d.isDefault !== true && d.isActive !== false),
    [emailDesigns, user]);

  const otherDesigns = useMemo(() =>
    emailDesigns.filter((d: any) => d.isSystem === false && d.isDefault !== true && (d.createdBy == null || String(d.createdBy) !== String(user?.id)) && d.isActive !== false),
    [emailDesigns, user]);

  const systemDesigns = useMemo(() =>
    emailDesigns.filter((d: any) => (d.isSystem !== false || d.isDefault === true) && d.isActive !== false),
    [emailDesigns]);

  const inactiveDesigns = useMemo(() =>
    emailDesigns.filter((d: any) => d.isActive === false),
    [emailDesigns]);

  useEffect(() => {
    if (designsError && activeTab === "email-designs") {
      console.error('Error loading email designs:', designsError);
      showErrorToast("Email Designs Error", "Email designs table may not exist. Check database migration.");
    }
  }, [designsError, activeTab]);

  const createDesignMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/email-designs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs?active=true'] });
      setIsCreateDesignDialogOpen(false);
      showSuccessToast("Success", "Email design created successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create email design");
    },
  });

  const updateDesignMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest('PUT', `/api/email-designs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs?active=true'] });
      setIsEditDesignDialogOpen(false);
      setSelectedDesign(null);
      showSuccessToast("Success", "Email design updated successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update email design");
    },
  });

  const deleteDesignMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/email-designs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs?active=true'] });
      showSuccessToast("Success", "Email design deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete email design");
    },
  });

  const setDefaultDesignMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/email-designs/${id}/set-default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-designs?active=true'] });
      showSuccessToast("Default updated", "This design is now the default email wrapper");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to set default email design");
    },
  });

  const handleSortWithAnnouncement = (key: string) => {
    handleDesignSort(key);
  };

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={PencilLine} />
        <CardHeader className="relative z-10">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center text-2xl gap-2">
                <PencilLine className="h-4 w-4 text-primary" />
                <CardTitle className="tracking-tight font-bold flex items-center gap-2 text-[24px]">
                  Email Design Variables
                </CardTitle>
              </div>
            </div>
            <Button
              onClick={() => {
                console.log('Create Design button clicked');
                setIsCreateDesignDialogOpen(true);
              }}
              title="Create a new email design"
            >
              <PencilRuler className="h-4 w-4 mr-2" />
              Create Email Design
            </Button>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
              <div className="space-y-2">
                {/* Content Variables */}
                <Collapsible open={isContentVarsOpen} onOpenChange={setIsContentVarsOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <Variable className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Content Variables
                    </span>
                    {isContentVarsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 text-sm pt-2 px-1">
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{BODY_TEXT_CONTENT}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Main email content <span className="text-red-500 font-semibold">(required)</span></span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{projectName}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Project name</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{customerName}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Customer name</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{projectStatus}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Current project status</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* User & System Variables */}
                <Collapsible open={isUserVarsOpen} onOpenChange={setIsUserVarsOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <Variable className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      User & System Variables
                    </span>
                    {isUserVarsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 text-sm pt-2 px-1">
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{userName}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Recipient's full name</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{userEmail}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">User's email</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{dashboardUrl}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Link to dashboard</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{supportEmail}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Support contact email</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Design & Branding Variables */}
                <Collapsible open={isBrandingVarsOpen} onOpenChange={setIsBrandingVarsOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <Image className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Design & Branding Variables
                    </span>
                    {isBrandingVarsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 text-sm pt-2 px-1">
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{HEADER_BG}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Header background color (e.g. #1e3a8a)</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{LOGO_SRC}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Logo image filename or URL</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{LOGO_ALT}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Logo alt text</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{LOGO_WIDTH}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Logo width in pixels</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{LOGO_HEIGHT}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Logo height in pixels</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{RIGHT_TITLE}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Right-side header title text</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{FOOTER_LINE1}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Footer first line text</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/80 rounded">
                        <code className="font-mono text-blue-600 dark:text-blue-400">{'{{FOOTER_LINE2}}'}</code>
                        <span className="text-gray-600 dark:text-gray-400">Footer second line text</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="mt-4 mb-4 p-3 bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> The <code className="font-mono">{'{{BODY_TEXT_CONTENT}}'}</code> variable is required for email designs to work with templates.
                  Design & Branding variables are set per-design in the design editor. Other variables are injected automatically when emails are sent.
                </p>
              </div>

          {designsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading email designs...</p>
            </div>
          ) : emailDesigns.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Email Designs Found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first email design.
              </p>
              <Button onClick={() => setIsCreateDesignDialogOpen(true)} title="Create your first email design">
                <PencilRuler className="h-4 w-4 mr-2" />
                Create Email Design
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {([
                { key: 'my', label: 'My Designs', icon: FolderHeart, iconColor: 'text-rose-500', designs: myDesigns, expanded: myDesignsExpanded, onToggle: () => setMyDesignsExpanded(v => !v) },
                { key: 'other', label: 'Other Designs', icon: FolderCog, iconColor: 'text-amber-500', designs: otherDesigns, expanded: otherDesignsExpanded, onToggle: () => setOtherDesignsExpanded(v => !v) },
                { key: 'system', label: 'System Designs', icon: FolderLock, iconColor: 'text-blue-500', designs: systemDesigns, expanded: systemDesignsExpanded, onToggle: () => setSystemDesignsExpanded(v => !v) },
                { key: 'inactive', label: 'Inactive Designs', icon: FolderClock, iconColor: 'text-gray-400', designs: inactiveDesigns, expanded: inactiveDesignsExpanded, onToggle: () => setInactiveDesignsExpanded(v => !v) },
              ] as { key: string; label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string; designs: any[]; expanded: boolean; onToggle: () => void }[]).map(section => (
                <CollapsibleSection key={section.key} label={section.label} icon={section.icon} iconColor={section.iconColor} count={section.designs.length} expanded={section.expanded} onToggle={section.onToggle}>
                  <SortableTable>
                    <SortableTableHeader>
                      <SortableTableRow>
                        <SortableTableHead sortKey="name" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} tooltipText="Click to sort by name">Name</SortableTableHead>
                        <SortableTableHead sortKey="description" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} tooltipText="Click to sort by description">Description</SortableTableHead>
                        <SortableTableHead sortKey="createdAt" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} tooltipText="Click to sort by creation date">Date Created</SortableTableHead>
                        <SortableTableHead sortKey="createdBy" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} tooltipText="Click to sort by creator">Created By</SortableTableHead>
                        <SortableTableHead sortKey="isActive" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} tooltipText="Click to sort by status">Status</SortableTableHead>
                        <SortableTableHead sortKey="updatedAt" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} tooltipText="Click to sort by update date">Updated</SortableTableHead>
                        <SortableTableHead sortKey="actions" sortConfig={designSortConfig} onSort={(key) => handleSortWithAnnouncement(key)} className="text-center">Actions</SortableTableHead>
                      </SortableTableRow>
                    </SortableTableHeader>
                    <SortableTableBody>
                      {section.designs.map((design: any) => (
                        <SortableTableRow key={design.id}>
                          <SortableTableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{design.name}</span>
                              {design.isSystem && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800 text-xs">System</Badge>
                              )}
                              {design.isDefault && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800 text-xs flex items-center gap-1">
                                  <Star className="h-3 w-3" aria-hidden="true" />
                                  Default
                                </Badge>
                              )}
                            </div>
                          </SortableTableCell>
                          <SortableTableCell className="max-w-xs">
                            <div className="text-sm text-muted-foreground truncate" title={design.description}>{design.description || '-'}</div>
                          </SortableTableCell>
                          <SortableTableCell className="text-sm text-muted-foreground">{new Date(design.createdAt).toLocaleDateString()}</SortableTableCell>
                          <SortableTableCell className="text-sm text-muted-foreground">{design.createdBy || '-'}</SortableTableCell>
                          <SortableTableCell><Badge variant={design.isActive ? "default" : "secondary"}>{design.isActive ? "Active" : "Inactive"}</Badge></SortableTableCell>
                          <SortableTableCell className="text-sm text-muted-foreground">{new Date(design.updatedAt).toLocaleDateString()}</SortableTableCell>
                          <SortableTableCell className="text-center">
                            <ResponsiveTableActionsMenu
                              actions={[
                                { id: 'preview', label: 'Preview design', icon: Eye, onClick: () => { setSelectedDesign(design); setIsPreviewDesignDialogOpen(true); } },
                                { id: 'edit', label: 'Edit design', icon: Edit, onClick: () => { setSelectedDesign(design); setIsEditDesignDialogOpen(true); } },
                                {
                                  id: 'duplicate',
                                  label: design.isSystem ? 'Duplicate system design' : 'Duplicate design',
                                  icon: Copy,
                                  onClick: () => { const dup = { ...design, name: `${design.name} (Copy)`, id: undefined, isSystem: false, isDefault: false }; setSelectedDesign(dup); setIsEditDesignDialogOpen(true); }
                                },
                                {
                                  id: 'set-default',
                                  label: 'Set as default',
                                  icon: Star,
                                  onClick: () => setDesignPendingDefault(design),
                                  hidden: design.isDefault || design.isActive === false,
                                  separator: true,
                                },
                                { id: 'delete', label: 'Delete design', icon: Trash2, onClick: () => setDesignPendingDelete(design), variant: 'destructive', hidden: design.isSystem || design.isDefault, separator: true }
                              ]}
                            />
                          </SortableTableCell>
                        </SortableTableRow>
                      ))}
                    </SortableTableBody>
                  </SortableTable>
                </CollapsibleSection>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EmailDesignDialog
        isOpen={isCreateDesignDialogOpen}
        onClose={() => {
          console.log('Create dialog closed');
          setIsCreateDesignDialogOpen(false);
          setSelectedDesign(null);
        }}
        onSubmit={(data) => createDesignMutation.mutate(data)}
        title="Create Email Design"
        isLoading={createDesignMutation.isPending}
      />

      {selectedDesign && (
        <EmailDesignDialog
          key={`edit-design-${selectedDesign.id || 'new'}`}
          isOpen={isEditDesignDialogOpen}
          onClose={() => {
            console.log('Edit dialog closed');
            setIsEditDesignDialogOpen(false);
            setSelectedDesign(null);
          }}
          onSubmit={(data) => {
            if (selectedDesign?.id) {
              updateDesignMutation.mutate({
                id: selectedDesign.id,
                data
              });
            } else {
              createDesignMutation.mutate(data);
            }
          }}
          title={selectedDesign?.id ? "Edit Email Design" : "Create Email Design"}
          initialData={selectedDesign}
          isLoading={updateDesignMutation.isPending || createDesignMutation.isPending}
        />
      )}

      {selectedDesign && (
        <ResizableModal
          open={isPreviewDesignDialogOpen}
          onOpenChange={setIsPreviewDesignDialogOpen}
          title={`Design Preview: ${selectedDesign.name}`}
          titleIcon={Eye}
          initialSize={{ width: 1000, height: 700 }}
          minSize={{ width: 600, height: 400 }}
          maxSize={{ width: 1400, height: 1000 }}
          ariaDescribedById="design-preview-description"
          footer={
            <div className="flex justify-between w-full">
              <Button onClick={() => {
                navigator.clipboard.writeText(selectedDesign.htmlRaw);
                showSuccessToast("Copied", "Design HTML copied to clipboard");
              }}>
                <Copy className="h-4 w-4 mr-1" />
                Copy HTML
              </Button>
              <Button onClick={() => setIsPreviewDesignDialogOpen(false)}>
                <X className="h-4 w-4 mr-1" />
                Close
              </Button>
            </div>
          }
        >
          <div id="design-preview-description" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Preview of the email design with sample content
            </p>

            <div>
              <Label className="font-medium">
                <CodeXml className="inline-block mr-1 h-5 w-5" aria-hidden="true" />
                Raw HTML:
              </Label>
              <pre className="text-xs border p-2 rounded mt-1 bg-blue-50 max-h-32 overflow-y-auto">
                {selectedDesign.htmlRaw}
              </pre>
            </div>

            <div>
              <Label className="font-medium">
                <ScanEye className="inline-block mr-1 h-5 w-5" aria-hidden="true" />
                Preview with Sample Content:</Label>
              {/* Email designs render against a fixed 735px canvas — the
                  template's outer table uses width="735" + per-cell widths
                  to control the header/right-title split. Without a
                  matching min-width here the table shrinks to the dialog
                  width and the layout collapses (Right Title centers,
                  logo cell narrows). Min-width 735px + horizontal scroll
                  lets the table render at its intended size; the dialog
                  scrollbar handles overflow on narrow viewports. */}
              <div className="border rounded mt-1 max-h-96 overflow-auto">
                <div
                  style={{
                    minWidth: '735px',
                    minHeight: '400px',
                    fontSize: '14px',
                    fontFamily: 'Arial, sans-serif'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(processHtmlWithVariables(
                      selectedDesign.htmlRaw || '',
                      selectedDesign.designVariables || {},
                      true
                    ))
                  }}
                />
              </div>
            </div>
          </div>
        </ResizableModal>
      )}

      <ConfirmationDialog
        open={designPendingDefault !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDesignPendingDefault(null);
          }
        }}
        title="Set as default email design?"
        description={
          designPendingDefault
            ? `This will make "${designPendingDefault.name}" the wrapper for every system email that hasn't picked its own design. Continue?`
            : ""
        }
        confirmLabel="Set as default"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          if (designPendingDefault?.id) {
            setDefaultDesignMutation.mutate(designPendingDefault.id);
          }
          setDesignPendingDefault(null);
        }}
        onCancel={() => setDesignPendingDefault(null)}
      />

      <ConfirmationDialog
        open={designPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDesignPendingDelete(null);
          }
        }}
        title="Delete email design?"
        description={
          designPendingDelete
            ? `This will permanently delete "${designPendingDelete.name}". This action cannot be undone. Continue?`
            : ""
        }
        confirmLabel="Delete design"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (designPendingDelete?.id) {
            deleteDesignMutation.mutate(designPendingDelete.id);
          }
          setDesignPendingDelete(null);
        }}
        onCancel={() => setDesignPendingDelete(null)}
      />
    </div>
  );
}
