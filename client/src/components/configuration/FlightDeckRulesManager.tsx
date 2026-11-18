import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from '@/lib/queryClient';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  AlertCircle, 
  Plus, 
  SquarePen, 
  Trash2, 
  Eye,
  EyeOff,
  CalendarDays,
  CalendarRange,
  Users,
  TicketsPlane,
  Clock,
  X,
  Settings2,
  Image,
  Layout,
  Gauge,
  AlertTriangle,
  Activity,
  BookOpen,
  Lightbulb,
  Check,
  CheckCircle,
  Circle,
  Sun,
  RefreshCw,
  Sparkles,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronsRightLeft,
  FolderOpen,
  Info,
  Upload,
  Loader2,
  GripVertical,
  Settings,
  Link,
  ExternalLink,
  RotateCcw,
  Lock,
  Sliders,
  ChevronDown,
  PieChart,
  BarChart3,
  Heart,
  Zap,
  DollarSign,
  Trophy,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  ShieldAlert,
  BrainCircuit
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table';
import { sortRows, useUrlSortState } from '@/lib/sorting';
import { Switch } from '@/components/ui/switch';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface User {
  role?: string;
  [key: string]: any;
}

interface FlightDeckRulesManagerProps {
  user: User | null;
}

interface FlightDeckConfig {
  id: number;
  name: string;
  targetRole: string | null;
  scenario: 'onboarding' | 'daily' | 'every_login' | 'weekly';
  selectedDays: number[] | null;
  startDate: string | null;
  endDate: string | null;
  isEnabled: boolean;
  priority: number;
  enabledWidgets: string[];
  headerText: string | null;
  tipDisplayLocation: 'none' | 'header' | 'philosophy_card';
  headerImageUrl: string | null;
  headerImageAlignment: 'left' | 'center' | 'right';
  useDefaultHeaderImage?: boolean;
  footerImageUrl: string | null;
  footerImageAlignment: 'left' | 'right';
  useDefaultFooterImage?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  createdByFirstName?: string;
  createdByLastName?: string;
}

interface FlightDeckTip {
  id: number;
  tipText: string;
  isActive: boolean;
  displayOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Role {
  id: number;
  name: string;
  displayName: string;
  color: string;
  icon?: string;
}

interface PageTab {
  id: string;
  label: string;
  subtabs?: { id: string; label: string }[];
}

interface AppPage {
  id: string;
  label: string;
  href: string;
  tabs?: PageTab[];
}

interface JumpstartItem {
  id: string;
  type: 'preset' | 'custom' | 'page' | 'external';
  key?: string;
  label: string;
  href?: string;
  pageId?: string;
  tabId?: string;
  subtabId?: string;
  tooltip?: string;
  enabled: boolean;
  isExternal?: boolean;
}

interface PhilosophyEntry {
  id: string;
  text: string;
  links?: { label: string; href: string }[];
}

interface JumpstartSettings {
  items: JumpstartItem[];
}

interface PhilosophySettings {
  mode: 'static' | 'rotate';
  entries: PhilosophyEntry[];
}

interface HealthPulseSettings {
  showProcessStatus: boolean;
  showCustomerSentiment: boolean;
  showDealUrgency: boolean;
  showPipelineValue: boolean;
  showWinRate: boolean;
  showWorkload: boolean;
}

interface RiskRadarSettings {
  showRiskCounts: boolean;
  showRankingCounts: boolean;
  highAlertLimit: number;
  showDeadlines: boolean;
  showPendingTcc: boolean;
  showTechnicalRisk: boolean;
}

interface WidgetSettings {
  jumpstart?: JumpstartSettings;
  philosophy?: PhilosophySettings;
  healthPulse?: HealthPulseSettings;
  riskRadar?: RiskRadarSettings;
  /** Per-widget "Show Expanded" toggle map (keyed by widget id from
   *  defaultWidgetOrder). When `true`, that widget renders expanded
   *  in the FlightDeckModal; when missing or `false`, it renders
   *  collapsed (title + chevron) so the admin can opt widgets into
   *  the layout without claiming scroll real-estate. */
  expanded?: Record<string, boolean>;
}

const defaultJumpstartItems: JumpstartItem[] = [
  { id: 'profile', type: 'preset', key: 'profile', label: 'Complete your profile', href: '/profile', enabled: true },
  { id: 'security', type: 'preset', key: 'security', label: 'Enable two-factor authentication', href: '/profile?tab=security', enabled: true },
  { id: 'firstProject', type: 'preset', key: 'firstProject', label: 'Create your first project', href: '/create', enabled: true },
  { id: 'firstMap', type: 'preset', key: 'firstMap', label: 'Add a Mutual Action Plan', href: '/templates?tab=map-library', enabled: true },
];

const defaultPhilosophyEntries: PhilosophyEntry[] = [
  { id: '1', text: 'Align People, Trust the Process, Validate the Product.' },
];

const defaultWidgetSettings: WidgetSettings = {
  jumpstart: { items: defaultJumpstartItems },
  philosophy: { mode: 'rotate', entries: defaultPhilosophyEntries },
  healthPulse: { showProcessStatus: true, showCustomerSentiment: true, showDealUrgency: true, showPipelineValue: true, showWinRate: true, showWorkload: true },
  riskRadar: { showRiskCounts: true, showRankingCounts: true, highAlertLimit: 3, showDeadlines: true, showPendingTcc: true, showTechnicalRisk: true },
  // All widgets default to COLLAPSED so a fresh rule renders compact.
  // Admins opt-in per-widget via the "Show Expanded" checkbox.
  expanded: {},
};

const appPages: AppPage[] = [
  // id stays 'overview' — saved Flight Deck rules reference it.
  { id: 'overview', label: 'Dashboard', href: '/' },
  { id: 'account-portal', label: 'Account Portal', href: '/account' },
  { id: 'create-project', label: 'Create Project', href: '/create' },
  { 
    id: 'projects-workspace', 
    label: 'Project Workspace', 
    href: '/project',
    tabs: [
      { id: 'validation', label: 'Projects' },
      { id: 'users', label: 'Team' },
      { id: 'customers', label: 'Accounts' },
      { id: 'project-board', label: 'Project Board' },
      { id: 'calendar', label: 'Project Schedules' },
      { id: 'templates', label: 'Project Templates' },
      { id: 'map', label: 'MAP Management' },
      { id: 'map-library', label: 'MAP Library' },
      { 
        id: 'artifacts', 
        label: 'Artifacts',
        subtabs: [
          { id: 'documents', label: 'Documents' },
          { id: 'links', label: 'Links' }
        ]
      }
    ]
  },
  { 
    id: 'validation-criteria', 
    label: 'Validation Criteria', 
    href: '/success-criteria',
    tabs: [
      { id: 'solutions', label: 'Solutions' },
      { id: 'components', label: 'Components' },
      { id: 'criteria', label: 'Criteria' },
      { id: 'outcomes', label: 'Expected Outcomes' },
      { id: 'actions', label: 'Actions Taken' },
      { id: 'templates', label: 'Template Builder' }
    ]
  },
  { 
    id: 'ai-risk', 
    label: 'AI Assessments', 
    href: '/ai-risk',
    tabs: [
      { id: 'overview', label: 'Assessment Overview' },
      { id: 'projects', label: 'Project Analysis' },
      { id: 'criteria', label: 'Assessment Criteria' }
    ]
  },
  { 
    id: 'communications', 
    label: 'Communications', 
    href: '/admin?tab=email-logs',
    tabs: [
      { id: 'email-logs', label: 'Email Logs' },
      { id: 'email-templates', label: 'Email Templates' },
      { id: 'email-designs', label: 'Email Designs' },
      { id: 'system-announcements', label: 'System Announcements' },
      { id: 'flight-deck', label: 'Flight Deck' },
      { 
        id: 'email-automation', 
        label: 'Email Automation',
        subtabs: [
          { id: 'overview', label: 'Overview' },
          { id: 'rules', label: 'Rules' },
          { id: 'schedules', label: 'Schedules' },
          { id: 'origins', label: 'Trigger Origins' },
          { id: 'diagnostics', label: 'Diagnostics' }
        ]
      },
      { id: 'webhooks', label: 'Webhooks' }
    ]
  },
  { 
    // id stays 'analytics' — saved Flight Deck rules reference it.
    id: 'analytics', 
    label: 'Reports', 
    href: '/reports'
  },
  { 
    id: 'configuration', 
    label: 'Configuration', 
    href: '/admin',
    tabs: [
      { id: 'configuration', label: 'Field Settings' },
      { id: 'map-automation', label: 'MAP Automation' },
      { id: 'compliance', label: 'Compliance' },
      { id: 'users', label: 'Users' },
      { id: 'roles', label: 'Roles' },
      { id: 'login-history', label: 'Login History' },
      { id: 'archives', label: 'Archives' },
      { 
        id: 'salesforce-configuration', 
        label: 'Integrations',
        subtabs: [
          { id: 'salesforce', label: 'Salesforce' },
          { id: 'ai-providers', label: 'AI Providers' },
          { id: 'n8n', label: 'n8n' },
          { id: 'sso', label: 'Single Sign-On' }
        ]
      }
    ]
  },
  { 
    id: 'getting-started', 
    label: 'Guide', 
    href: '/getting-started',
    tabs: []
  },
  { 
    id: 'about', 
    label: 'About', 
    href: '/about',
    tabs: [
      { id: 'introduction', label: 'Introduction' },
      { id: 'clear2close', label: 'Clear2Close' },
      { id: 'documentation', label: 'Documentation' },
      { id: 'support-features', label: 'Support & Features' }
    ]
  },
  { 
    id: 'profile', 
    label: 'Profile', 
    href: '/profile',
    tabs: [
      { id: 'account', label: 'Account' },
      { id: 'security', label: 'Security' },
      { id: 'preferences', label: 'Preferences' }
    ]
  },
];

const scenarioConfig = {
  onboarding: { 
    label: 'Onboarding', 
    description: 'First-time login only',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: Sparkles
  },
  daily: { 
    label: 'Daily', 
    description: 'Once per calendar day',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Sun
  },
  weekly: { 
    label: 'Weekly', 
    description: 'On selected days of the week',
    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    icon: CalendarRange
  },
  every_login: { 
    label: 'Every Login', 
    description: 'Show on every session',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    icon: RefreshCw
  },
};

const widgetConfig: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  health_pulse: { label: 'Health Pulse', icon: Gauge, description: 'Project status overview' },
  risk_radar: { label: 'Risk Radar', icon: AlertTriangle, description: 'Risk & ranking metrics' },
  resume_button: { label: 'Resume Button', icon: Activity, description: 'Continue last project' },
  jumpstart: { label: 'Jumpstart Checklist', icon: BookOpen, description: 'Onboarding progress' },
  philosophy: { label: 'Philosophy Card', icon: Lightbulb, description: '3Ps & tips of the day' },
  hygiene_alerts: { label: 'Hygiene Alerts', icon: BrainCircuit, description: 'Missing outcome intelligence' },
  whats_new: { label: "What's New!", icon: Zap, description: 'Latest version updates & changelog' },
};

const defaultWidgetOrder = ['resume_button', 'health_pulse', 'risk_radar', 'hygiene_alerts', 'jumpstart', 'philosophy', 'whats_new'];

interface JumpstartSettingsPanelProps {
  items: JumpstartItem[];
  onItemsChange: (items: JumpstartItem[]) => void;
}

function JumpstartSettingsPanel({ items, onItemsChange }: JumpstartSettingsPanelProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItemPage, setNewItemPage] = useState<string>('');
  const [newItemTab, setNewItemTab] = useState<string>('');
  const [newItemSubtab, setNewItemSubtab] = useState<string>('');
  const [newItemLabel, setNewItemLabel] = useState<string>('');
  const [newItemTooltip, setNewItemTooltip] = useState<string>('');
  const [isAddPopoverOpen, setIsAddPopoverOpen] = useState(false);
  const [isExternalLink, setIsExternalLink] = useState(false);
  const [newExternalUrl, setNewExternalUrl] = useState<string>('');
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);
      onItemsChange(arrayMove(items, oldIndex, newIndex));
    }
  };

  const selectedPage = appPages.find(p => p.id === newItemPage);
  const selectedTab = selectedPage?.tabs?.find(t => t.id === newItemTab);

  const buildHref = (pageId: string, tabId?: string, subtabId?: string) => {
    const page = appPages.find(p => p.id === pageId);
    if (!page) return '/';
    
    const baseHref = page.href.split('?')[0];
    
    if (tabId) {
      let href = `${baseHref}?tab=${tabId}`;
      if (subtabId) {
        href += `&subtab=${subtabId}`;
      }
      return href;
    }
    return page.href;
  };

  const buildLabel = (pageId: string, tabId?: string, subtabId?: string) => {
    const page = appPages.find(p => p.id === pageId);
    if (!page) return 'Visit page';
    
    let label = `Visit ${page.label}`;
    if (tabId) {
      const tab = page.tabs?.find(t => t.id === tabId);
      if (tab) {
        label = `Visit ${page.label} → ${tab.label}`;
        if (subtabId) {
          const subtab = tab.subtabs?.find(s => s.id === subtabId);
          if (subtab) {
            label = `Visit ${page.label} → ${tab.label} → ${subtab.label}`;
          }
        }
      }
    }
    return label;
  };

  const handleAddItem = () => {
    if (isExternalLink) {
      if (!newExternalUrl || !newItemLabel) return;
      
      const newItem: JumpstartItem = {
        id: `external-${Date.now()}`,
        type: 'external',
        label: newItemLabel,
        href: newExternalUrl,
        tooltip: newItemTooltip || undefined,
        enabled: true,
        isExternal: true
      };

      onItemsChange([...items, newItem]);
    } else {
      if (!newItemPage) return;
      
      const newItem: JumpstartItem = {
        id: `page-${newItemPage}-${Date.now()}`,
        type: 'page',
        pageId: newItemPage,
        tabId: newItemTab || undefined,
        subtabId: newItemSubtab || undefined,
        label: newItemLabel || buildLabel(newItemPage, newItemTab, newItemSubtab),
        href: buildHref(newItemPage, newItemTab, newItemSubtab),
        tooltip: newItemTooltip || undefined,
        enabled: true
      };

      onItemsChange([...items, newItem]);
    }
    
    // Reset form
    setNewItemPage('');
    setNewItemTab('');
    setNewItemSubtab('');
    setNewItemLabel('');
    setNewItemTooltip('');
    setNewExternalUrl('');
    setIsExternalLink(false);
    setIsAddPopoverOpen(false);
  };

  const updateItem = (index: number, updates: Partial<JumpstartItem>) => {
    const newItems = [...items];
    newItems[index] = { ...items[index], ...updates };
    onItemsChange(newItems);
  };

  const removeItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <BookOpen className="h-4 w-4 text-sky-600" />
        <span className="font-medium">Checklist Items</span>
        <span className="text-xs text-muted-foreground ml-auto">Max 10 items</span>
      </div>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {items.map((item, index) => (
              <SortableChecklistItem
                key={item.id}
                item={item}
                index={index}
                editingItemId={editingItemId}
                setEditingItemId={setEditingItemId}
                updateItem={updateItem}
                removeItem={removeItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {items.length < 10 && (
        <div className="pt-2">
          <Popover open={isAddPopoverOpen} onOpenChange={setIsAddPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Checklist Item
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="start">
              <div className="space-y-4">
                <div className="font-medium text-sm flex items-center gap-2">
                  {isExternalLink ? (
                    <>
                      <ExternalLink className="h-4 w-4 text-sky-600" />
                      Add External Link
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4 text-sky-600" />
                      Add App Page Link
                    </>
                  )}
                </div>
                
                {/* Toggle between internal and external */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-2">
                    <Link className={`h-4 w-4 ${!isExternalLink ? 'text-sky-600' : 'text-gray-400'}`} />
                    <span className={`text-sm ${!isExternalLink ? 'font-medium' : 'text-muted-foreground'}`}>App Page</span>
                  </div>
                  <Switch
                    checked={isExternalLink}
                    onCheckedChange={(checked) => {
                      setIsExternalLink(checked);
                      setNewItemLabel('');
                      setNewItemPage('');
                      setNewItemTab('');
                      setNewItemSubtab('');
                      setNewExternalUrl('');
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${isExternalLink ? 'font-medium' : 'text-muted-foreground'}`}>External URL</span>
                    <ExternalLink className={`h-4 w-4 ${isExternalLink ? 'text-sky-600' : 'text-gray-400'}`} />
                  </div>
                </div>
                
                <div className="space-y-3">
                  {isExternalLink ? (
                    <>
                      {/* External URL input */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">External URL *</Label>
                        <Input
                          value={newExternalUrl}
                          onChange={(e) => setNewExternalUrl(e.target.value)}
                          placeholder="https://example.com/page"
                          type="url"
                        />
                        <p className="text-xs text-muted-foreground">Opens in a new tab</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* App page selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Page</Label>
                        <Select
                          value={newItemPage}
                          onValueChange={(value) => {
                            setNewItemPage(value);
                            setNewItemTab('');
                            setNewItemSubtab('');
                            const page = appPages.find(p => p.id === value);
                            if (page) {
                              setNewItemLabel(`Visit ${page.label}`);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a page..." />
                          </SelectTrigger>
                          <SelectContent>
                            {appPages.map(page => (
                              <SelectItem key={page.id} value={page.id}>
                                {page.label}
                                {page.tabs && page.tabs.length > 0 && (
                                  <span className="text-muted-foreground ml-1">({page.tabs.length} tabs)</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedPage?.tabs && selectedPage.tabs.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tab (optional)</Label>
                          <Select
                            value={newItemTab || '__none__'}
                            onValueChange={(value) => {
                              const actualValue = value === '__none__' ? '' : value;
                              setNewItemTab(actualValue);
                              setNewItemSubtab('');
                              if (actualValue) {
                                setNewItemLabel(buildLabel(newItemPage, actualValue));
                              } else {
                                setNewItemLabel(buildLabel(newItemPage));
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a tab..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No specific tab</SelectItem>
                              {selectedPage.tabs.map(tab => (
                                <SelectItem key={tab.id} value={tab.id}>
                                  {tab.label}
                                  {tab.subtabs && tab.subtabs.length > 0 && (
                                    <span className="text-muted-foreground ml-1">({tab.subtabs.length} subtabs)</span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {selectedTab?.subtabs && selectedTab.subtabs.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Subtab (optional)</Label>
                          <Select
                            value={newItemSubtab || '__none__'}
                            onValueChange={(value) => {
                              const actualValue = value === '__none__' ? '' : value;
                              setNewItemSubtab(actualValue);
                              if (actualValue) {
                                setNewItemLabel(buildLabel(newItemPage, newItemTab, actualValue));
                              } else {
                                setNewItemLabel(buildLabel(newItemPage, newItemTab));
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a subtab..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No specific subtab</SelectItem>
                              {selectedTab.subtabs.map(subtab => (
                                <SelectItem key={subtab.id} value={subtab.id}>
                                  {subtab.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs">Display Label *</Label>
                    <Input
                      value={newItemLabel}
                      onChange={(e) => setNewItemLabel(e.target.value)}
                      placeholder={isExternalLink ? "e.g., Visit our documentation" : "e.g., Complete your profile"}
                    />
                    <p className="text-xs text-muted-foreground">The text shown in the checklist</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Tooltip</Label>
                      <span className="text-xs text-muted-foreground">({newItemTooltip.length}/400)</span>
                    </div>
                    <Textarea
                      value={newItemTooltip}
                      onChange={(e) => {
                        if (e.target.value.length <= 400) {
                          setNewItemTooltip(e.target.value);
                        }
                      }}
                      placeholder="Optional helpful description (max 400 characters)"
                      className="min-h-[80px] text-sm resize-none"
                      maxLength={400}
                    />
                  </div>

                  {/* Target URL preview */}
                  {(newItemPage || newExternalUrl) && (
                    <div className="p-2 rounded bg-gray-100 dark:bg-gray-800 text-xs">
                      <span className="text-muted-foreground">Target URL: </span>
                      <span className="font-mono">
                        {isExternalLink ? newExternalUrl : buildHref(newItemPage, newItemTab, newItemSubtab)}
                      </span>
                      {isExternalLink && <ExternalLink className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setIsAddPopoverOpen(false);
                      setNewItemPage('');
                      setNewItemTab('');
                      setNewItemSubtab('');
                      setNewItemLabel('');
                      setNewItemTooltip('');
                      setNewExternalUrl('');
                      setIsExternalLink(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleAddItem}
                    disabled={isExternalLink ? (!newExternalUrl || !newItemLabel) : (!newItemPage || !newItemLabel)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

interface SortableChecklistItemProps {
  item: JumpstartItem;
  index: number;
  editingItemId: string | null;
  setEditingItemId: (id: string | null) => void;
  updateItem: (index: number, updates: Partial<JumpstartItem>) => void;
  removeItem: (index: number) => void;
}

function SortableChecklistItem({ item, index, editingItemId, setEditingItemId, updateItem, removeItem }: SortableChecklistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const getTypeLabel = () => {
    switch (item.type) {
      case 'preset': return 'Preset';
      case 'page': return 'Page Link';
      case 'external': return 'External Link';
      default: return 'Custom';
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
        <Switch
          checked={item.enabled}
          onCheckedChange={(checked) => updateItem(index, { enabled: checked })}
        />
        <div className="flex-1 min-w-0">
          {editingItemId === item.id ? (
            <Input
              value={item.label}
              onChange={(e) => updateItem(index, { label: e.target.value })}
              onBlur={() => setEditingItemId(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingItemId(null)}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <div 
              className="font-medium text-sm cursor-pointer hover:text-sky-600 transition-colors truncate"
              onClick={() => setEditingItemId(item.id)}
              title="Click to edit label"
            >
              {item.label}
              <SquarePen className="h-3 w-3 ml-1 inline-block opacity-50" />
            </div>
          )}
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {getTypeLabel()}
            {item.type === 'external' && <ExternalLink className="h-3 w-3" />}
            {item.href && (
              <>
                <span className="text-gray-400">•</span>
                <span className="truncate max-w-[180px]" title={item.href}>{item.href}</span>
              </>
            )}
          </div>
        </div>
        
        {item.tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-sky-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                {item.tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {(item.type === 'page' || item.type === 'custom' || item.type === 'external') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeItem(index)}
            className="shrink-0"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
      
      {(item.type === 'page' || item.type === 'custom' || item.type === 'external') && (
        <div className="px-3 pb-3 pt-0">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Tooltip</Label>
              <span className="text-xs text-muted-foreground">({(item.tooltip || '').length}/400)</span>
            </div>
            <Textarea
              value={item.tooltip || ''}
              onChange={(e) => {
                if (e.target.value.length <= 400) {
                  updateItem(index, { tooltip: e.target.value });
                }
              }}
              placeholder="Optional tooltip shown on hover (max 400 characters)"
              className="min-h-[60px] text-sm resize-none"
              maxLength={400}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface SortableWidgetItemProps {
  id: string;
  widget: { label: string; icon: React.ElementType; description: string };
  isEnabled: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  hasSettings: boolean;
  /** "Show Expanded" per-widget flag — when true the widget renders
   *  full-body in the runtime FlightDeckModal; when false (default)
   *  it renders as a collapsed title strip the user can click to
   *  expand. */
  showExpanded: boolean;
  onToggleExpanded: () => void;
}

function SortableWidgetItem({ id, widget, isEnabled, onToggle, onOpenSettings, hasSettings, showExpanded, onToggleExpanded }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const Icon = widget.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isEnabled
          ? 'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>
      <div 
        className="flex items-center gap-3 flex-1 cursor-pointer"
        onClick={onToggle}
      >
        <div className={`p-2 rounded-lg ${isEnabled ? 'bg-sky-100 dark:bg-sky-800' : 'bg-gray-100 dark:bg-gray-800'}`}>
          <Icon className={`h-4 w-4 ${isEnabled ? 'text-sky-600 dark:text-sky-400' : 'text-gray-500 dark:text-gray-400'}`} />
        </div>
        <div className="flex-1">
          <div className="font-medium">{widget.label}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{widget.description}</div>
        </div>
        {isEnabled ? (
          <CheckCircle className="h-5 w-5 text-sky-600" />
        ) : (
          <Circle className="h-5 w-5 text-gray-300" />
        )}
      </div>
      {/* Show Expanded toggle — saves to widgetSettings.expanded[id].
          stopPropagation so clicking the checkbox doesn't fire the
          row's enable-toggle. Tooltip explains the runtime effect. */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={showExpanded}
                onCheckedChange={onToggleExpanded}
                aria-label="Show this widget expanded by default"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Show Expanded</span>
            </label>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p className="text-xs">
              When checked, this widget renders fully expanded in the Flight Deck. When unchecked
              (default), it renders as a collapsed title strip the user clicks to expand. Lets
              admins save vertical space without disabling widgets.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {hasSettings && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings();
                }}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Settings className="h-4 w-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Configure widget</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

type ScenarioType = 'onboarding' | 'daily' | 'every_login' | 'weekly';
type HeaderAlignment = 'left' | 'center' | 'right';
type FooterAlignment = 'left' | 'right';

type TipDisplayLocation = 'none' | 'header' | 'philosophy_card';

interface FormState {
  name: string;
  targetRole: string;
  scenario: ScenarioType;
  selectedDays: number[];
  startDate: string;
  endDate: string;
  isEnabled: boolean;
  priority: number;
  enabledWidgets: string[];
  widgetOrder: string[];
  widgetSettings: WidgetSettings;
  headerText: string;
  tipDisplayLocation: TipDisplayLocation;
  headerImageUrl: string;
  headerImageAlignment: HeaderAlignment;
  useDefaultHeaderImage: boolean;
  footerImageUrl: string;
  footerImageAlignment: FooterAlignment;
  useDefaultFooterImage: boolean;
}

const ALL_ROLES_VALUE = '__all__';

const emptyFormState: FormState = {
  name: '',
  targetRole: ALL_ROLES_VALUE,
  scenario: 'daily',
  selectedDays: [],
  startDate: '',
  endDate: '',
  isEnabled: true,
  priority: 0,
  enabledWidgets: [],
  widgetOrder: [...defaultWidgetOrder],
  widgetSettings: { ...defaultWidgetSettings },
  headerText: '',
  tipDisplayLocation: 'none',
  headerImageUrl: '',
  headerImageAlignment: 'right',
  useDefaultHeaderImage: true,
  footerImageUrl: '',
  footerImageAlignment: 'left',
  useDefaultFooterImage: true,
};

const widgetsWithSettings = ['jumpstart', 'philosophy', 'health_pulse', 'risk_radar'];

// Available images from attached_assets folder. Bundled defaults only —
// the Internal-branded files that used to live under
// attached_assets/system/branding/ were removed so a fresh install
// ships no vendor branding. Admins upload their own imagery via
// Configuration → System Settings → Media and can wire those into
// Flight Deck rules afterwards.
const availableImages = [
  { path: '/attached_assets/system/branding/criteriaiq-logo-light.png', name: 'CriteriaIQ Logo Light' },
  { path: '/attached_assets/system/branding/criteriaiq-logo-dark.png', name: 'CriteriaIQ Logo Dark' },
];

export function FlightDeckRulesManager({ user }: FlightDeckRulesManagerProps) {
  const { t } = useTranslation();
  const [sortConfig, handleSort] = useUrlSortState('flightDeck');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FlightDeckConfig | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [previewConfigId, setPreviewConfigId] = useState<number | null>(null);
  const [formState, setFormState] = useState(emptyFormState);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [imagePickerField, setImagePickerField] = useState<'header' | 'footer'>('header');
  const [uploadingFlightDeckImage, setUploadingFlightDeckImage] = useState<'header' | 'footer' | null>(null);
  const [settingsDrawerWidget, setSettingsDrawerWidget] = useState<string | null>(null);

  // Upload a Flight Deck banner image. On success writes the resolved
  // /api/files/system/flight-deck/<name> URL into the relevant URL
  // field. 2 MB cap mirrors the server-side check.
  const uploadFlightDeckBanner = async (file: File, kind: 'header' | 'footer') => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      showErrorToast('Invalid file type', 'Only PNG, JPEG, WEBP, and SVG files are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showErrorToast('File too large', 'Maximum file size is 2MB');
      return;
    }
    setUploadingFlightDeckImage(kind);
    try {
      const formData = new FormData();
      formData.append('asset', file);
      const res = await fetch('/api/admin/flight-deck/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Upload failed');
      }
      const asset = await res.json();
      setFormState(prev =>
        kind === 'header'
          ? { ...prev, headerImageUrl: asset.url }
          : { ...prev, footerImageUrl: asset.url },
      );
      showSuccessToast('Image uploaded', `Banner saved to ${asset.gcsPath}`);
    } catch (error: any) {
      showErrorToast('Upload failed', error?.message ?? 'Could not upload banner');
    } finally {
      setUploadingFlightDeckImage(null);
    }
  };
  
  const queryClient = useQueryClient();
  

  // Fetch configurations
  const { data: configs = [], isLoading: isLoadingConfigs } = useQuery({
    queryKey: ['/api/admin/flight-deck-configs'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/flight-deck-configs');
    },
    enabled: user?.role === 'Admin',
  });

  // Fetch roles for targeting
  const { data: roles = [] } = useQuery({
    queryKey: ['/api/roles'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/roles');
    },
    enabled: user?.role === 'Admin',
  });

  // Fetch tips
  const { data: tips = [], isLoading: isLoadingTips } = useQuery<FlightDeckTip[]>({
    queryKey: ['/api/admin/flight-deck-tips'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/flight-deck-tips');
    },
    enabled: user?.role === 'Admin',
  });

  // State for tip editing
  const [isEditingTip, setIsEditingTip] = useState(false);
  const [editingTip, setEditingTip] = useState<FlightDeckTip | null>(null);
  const [newTipText, setNewTipText] = useState('');
  const [deleteTipId, setDeleteTipId] = useState<number | null>(null);

  // Create tip mutation
  const createTipMutation = useMutation({
    mutationFn: async (tipText: string) => {
      return await apiRequest('POST', '/api/admin/flight-deck-tips', { tipText, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-tips'] });
      setNewTipText('');
      showSuccessToast('Tip Added', 'New tip has been added.');
    },
    onError: (error: any) => {
      showErrorToast('Failed', error.message || 'Failed to add tip');
    },
  });

  // Update tip mutation
  const updateTipMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; tipText?: string; isActive?: boolean }) => {
      return await apiRequest('PUT', `/api/admin/flight-deck-tips/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-tips'] });
      setEditingTip(null);
      setIsEditingTip(false);
      showSuccessToast('Tip Updated', 'Tip has been updated.');
    },
    onError: (error: any) => {
      showErrorToast('Update Failed', error.message || 'Failed to update tip');
    },
  });

  // Delete tip mutation
  const deleteTipMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/flight-deck-tips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-tips'] });
      setDeleteTipId(null);
      showSuccessToast('Tip Deleted', 'Tip has been removed.');
    },
    onError: (error: any) => {
      showErrorToast('Delete Failed', error.message || 'Failed to delete tip');
    },
  });

  // Seed tips mutation
  const seedTipsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/flight-deck-tips/seed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-tips'] });
      showSuccessToast('Tips Seeded', 'Default tips have been added.');
    },
    onError: (error: any) => {
      showErrorToast('Seed Failed', error.message || 'Failed to seed tips');
    },
  });

  // Fetch preview data for specific config
  const { data: previewData, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['/api/admin/flight-deck-configs', previewConfigId, 'preview'],
    queryFn: async () => {
      return await apiRequest('GET', `/api/admin/flight-deck-configs/${previewConfigId}/preview`);
    },
    enabled: previewConfigId !== null,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/admin/flight-deck-configs', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-configs'] });
      setIsCreateDialogOpen(false);
      resetForm();
      showSuccessToast('Configuration Created', 'Flight Deck configuration has been created.');
    },
    onError: (error: any) => {
      showErrorToast('Creation Failed', error.message || 'Failed to create configuration');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PUT', `/api/admin/flight-deck-configs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-configs'] });
      setEditingConfig(null);
      resetForm();
      showSuccessToast('Configuration Updated', 'Flight Deck configuration has been updated.');
    },
    onError: (error: any) => {
      showErrorToast('Update Failed', error.message || 'Failed to update configuration');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/flight-deck-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-configs'] });
      setDeleteConfirmId(null);
      showSuccessToast('Configuration Deleted', 'Flight Deck configuration has been removed.');
    },
    onError: (error: any) => {
      showErrorToast('Deletion Failed', error.message || 'Failed to delete configuration');
    },
  });

  // Toggle enabled status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return await apiRequest('PUT', `/api/admin/flight-deck-configs/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flight-deck-configs'] });
    },
    onError: (error: any) => {
      showErrorToast('Update Failed', error.message || 'Failed to toggle configuration');
    },
  });

  const resetForm = () => {
    // New rules default to "Use CriteriaIQ logo" — admin opts in to a
    // custom banner explicitly by unchecking the checkbox.
    setFormState(emptyFormState);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (config: FlightDeckConfig) => {
    const enabledWidgets = config.enabledWidgets || [];
    const widgetOrder = enabledWidgets.length > 0 
      ? [...enabledWidgets, ...defaultWidgetOrder.filter(w => !enabledWidgets.includes(w))]
      : [...defaultWidgetOrder];
    
    setFormState({
      name: config.name,
      targetRole: config.targetRole || ALL_ROLES_VALUE,
      scenario: config.scenario,
      selectedDays: config.selectedDays || [],
      startDate: config.startDate ? format(parseISO(config.startDate), 'yyyy-MM-dd') : '',
      endDate: config.endDate ? format(parseISO(config.endDate), 'yyyy-MM-dd') : '',
      isEnabled: config.isEnabled,
      priority: config.priority,
      enabledWidgets,
      widgetOrder,
      widgetSettings: (config as any).widgetSettings || { ...defaultWidgetSettings },
      headerText: config.headerText || '',
      tipDisplayLocation: ((config as any).tipDisplayLocation as TipDisplayLocation) || 'none',
      headerImageUrl: config.headerImageUrl || '',
      headerImageAlignment: config.headerImageAlignment || 'right',
      // Honor the saved toggle when present; for legacy rows missing
      // the column, default to "use the CriteriaIQ logo" when the URL
      // is empty (matches the runtime fallback that's been the
      // behaviour all along).
      useDefaultHeaderImage:
        config.useDefaultHeaderImage !== undefined
          ? config.useDefaultHeaderImage
          : !config.headerImageUrl,
      footerImageUrl: config.footerImageUrl || '',
      footerImageAlignment: config.footerImageAlignment || 'left',
      useDefaultFooterImage:
        config.useDefaultFooterImage !== undefined
          ? config.useDefaultFooterImage
          : !config.footerImageUrl,
    });
    setEditingConfig(config);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleWidgetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setFormState(prev => {
        const oldIndex = prev.widgetOrder.indexOf(active.id as string);
        const newIndex = prev.widgetOrder.indexOf(over.id as string);
        const newOrder = arrayMove(prev.widgetOrder, oldIndex, newIndex);
        
        const newEnabledWidgets = newOrder.filter(w => prev.enabledWidgets.includes(w));
        
        return {
          ...prev,
          widgetOrder: newOrder,
          enabledWidgets: newEnabledWidgets,
        };
      });
    }
  };

  const handleSubmit = () => {
    if (formState.scenario === 'weekly' && formState.selectedDays.length === 0) {
      showErrorToast('Validation Error', 'Please select at least one day for the weekly scenario.');
      return;
    }
    
    const orderedEnabledWidgets = formState.widgetOrder.filter(w => formState.enabledWidgets.includes(w));
    
    const data = {
      ...formState,
      enabledWidgets: orderedEnabledWidgets,
      targetRole: formState.targetRole === ALL_ROLES_VALUE ? null : formState.targetRole,
      selectedDays: formState.scenario === 'weekly' ? formState.selectedDays : null,
      startDate: formState.startDate || null,
      endDate: formState.endDate || null,
      headerText: formState.headerText || null,
      headerImageUrl: formState.headerImageUrl || null,
      footerImageUrl: formState.footerImageUrl || null,
    };
    
    delete (data as any).widgetOrder;

    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleWidget = (widgetKey: string) => {
    setFormState(prev => {
      const isCurrentlyEnabled = prev.enabledWidgets.includes(widgetKey);
      const newEnabledWidgets = isCurrentlyEnabled
        ? prev.enabledWidgets.filter(w => w !== widgetKey)
        : [...prev.enabledWidgets, widgetKey];
      
      return {
        ...prev,
        enabledWidgets: newEnabledWidgets,
      };
    });
  };

  const getConfigStatus = (config: FlightDeckConfig): { label: string; color: string } => {
    if (!config.isEnabled) return { label: 'Disabled', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' };
    
    const now = new Date();
    if (config.startDate && isBefore(now, parseISO(config.startDate))) {
      return { label: 'Scheduled', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' };
    }
    if (config.endDate && isAfter(now, parseISO(config.endDate))) {
      return { label: 'Expired', color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' };
    }
    return { label: 'Active', color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' };
  };

  const sortedConfigs = sortRows(configs as FlightDeckConfig[], sortConfig, {
    targetRole: (c) => c.targetRole ?? '',
    scenario: (c) => scenarioConfig[c.scenario]?.label ?? c.scenario,
    priority: (c) => c.priority,
    widgets: (c) => (c.enabledWidgets || []).length,
    status: (c) => getConfigStatus(c).label,
    isEnabled: (c) => c.isEnabled,
  });

  if (user?.role !== 'Admin') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-red-700">Access Denied</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Only administrators can manage Flight Deck configurations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={TicketsPlane} />
        <CardHeader className="pb-4 relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TicketsPlane className="h-5 w-5 text-blue-600" />
                Flight Deck
              </CardTitle>
              <CardDescription>
                Configure role-based welcome modals with widgets, images, and targeting rules
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreateDialog} className="gap-2">
              <TicketsPlane className="h-4 w-4" />
              Create Configuration
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Configurations Table */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={TicketsPlane} />
        <CardContent className="pt-6 relative z-10">
          {isLoadingConfigs ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8">
              <TicketsPlane className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Configurations</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Create your first Flight Deck configuration to greet users.
              </p>
              <Button onClick={openCreateDialog} variant="outline" className="gap-2">
                <TicketsPlane className="h-4 w-4" />
                Create Configuration
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                    {t('flightDeck.table.colName')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="targetRole" sortConfig={sortConfig} onSort={handleSort}>
                    {t('flightDeck.table.colTarget')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="scenario" sortConfig={sortConfig} onSort={handleSort}>
                    {t('flightDeck.table.colScenario')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="priority" sortConfig={sortConfig} onSort={handleSort}>
                    {t('flightDeck.table.colPriority')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="widgets" sortConfig={sortConfig} onSort={handleSort}>
                    {t('flightDeck.table.colWidgets')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                    {t('flightDeck.table.colStatus')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="isEnabled" sortConfig={sortConfig} onSort={handleSort} align="center">
                    {t('flightDeck.table.colEnabled')}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} align="right">{t('flightDeck.table.colActions')}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConfigs.map((config: FlightDeckConfig) => {
                  const status = getConfigStatus(config);
                  const scenario = scenarioConfig[config.scenario];
                  return (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{config.name}</TableCell>
                      <TableCell>
                        {config.targetRole ? (
                          <Badge variant="outline">{config.targetRole}</Badge>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">All Roles</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={scenario.color}>{scenario.label}</Badge>
                      </TableCell>
                      <TableCell>{config.priority}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(config.enabledWidgets || []).slice(0, 3).map(w => {
                            const widget = widgetConfig[w as keyof typeof widgetConfig];
                            if (!widget) return null;
                            const Icon = widget.icon;
                            return (
                              <TooltipProvider key={w}>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <div className="p-1 bg-gray-100 dark:bg-gray-800 rounded">
                                      <Icon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>{widget.label}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })}
                          {(config.enabledWidgets || []).length > 3 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
                              +{(config.enabledWidgets || []).length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={status.color}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={config.isEnabled}
                          onCheckedChange={(checked) => 
                            toggleMutation.mutate({ id: config.id, isEnabled: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ResponsiveTableActionsMenu
                          actions={[
                            {
                              id: 'preview',
                              label: 'Preview Modal',
                              icon: Eye,
                              onClick: () => setPreviewConfigId(config.id)
                            },
                            {
                              id: 'edit',
                              label: 'Edit Configuration',
                              icon: SquarePen,
                              onClick: () => openEditDialog(config)
                            },
                            {
                              id: 'delete',
                              label: 'Delete Configuration',
                              icon: Trash2,
                              onClick: () => setDeleteConfirmId(config.id),
                              variant: 'destructive',
                              separator: true
                            }
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tips Management */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Daily Tips Management
              </CardTitle>
              <CardDescription>
                Manage the pool of tips that can be displayed in Flight Deck
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedTipsMutation.mutate()}
                disabled={seedTipsMutation.isPending}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${seedTipsMutation.isPending ? 'animate-spin' : ''}`} />
                Seed Defaults
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (newTipText.trim()) {
                    createTipMutation.mutate(newTipText.trim());
                  }
                }}
                disabled={!newTipText.trim() || createTipMutation.isPending}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Tip
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter a new tip for users..."
                value={newTipText}
                onChange={(e) => setNewTipText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTipText.trim()) {
                    createTipMutation.mutate(newTipText.trim());
                  }
                }}
                className="flex-1"
              />
            </div>
            {isLoadingTips ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : tips.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                <Lightbulb className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                <p className="text-sm">No tips yet. Add one above or seed the defaults.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {tips.map((tip) => (
                  <div
                    key={tip.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      tip.isActive 
                        ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700' 
                        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50 opacity-60'
                    }`}
                  >
                    <Switch
                      checked={tip.isActive}
                      onCheckedChange={(checked) => 
                        updateTipMutation.mutate({ id: tip.id, isActive: checked })
                      }
                      className="shrink-0"
                    />
                    {editingTip?.id === tip.id ? (
                      <Input
                        value={editingTip.tipText}
                        onChange={(e) => setEditingTip({ ...editingTip, tipText: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingTip.tipText.trim()) {
                            updateTipMutation.mutate({ id: tip.id, tipText: editingTip.tipText.trim() });
                          }
                          if (e.key === 'Escape') {
                            setEditingTip(null);
                          }
                        }}
                        className="flex-1"
                        autoFocus
                      />
                    ) : (
                      <p className="flex-1 text-sm">{tip.tipText}</p>
                    )}
                    <div className="flex gap-1 shrink-0">
                      {editingTip?.id === tip.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (editingTip.tipText.trim()) {
                                updateTipMutation.mutate({ id: tip.id, tipText: editingTip.tipText.trim() });
                              }
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTip(null)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTip(tip)}
                            className="h-8 w-8 p-0"
                          >
                            <SquarePen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTipId(tip.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Tip Confirmation Dialog */}
      <AlertDialog open={deleteTipId !== null} onOpenChange={(open) => !open && setDeleteTipId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tip? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTipId && deleteTipMutation.mutate(deleteTipId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingConfig} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingConfig(null);
          resetForm();
        }
      }}>
        <DialogContent 
          className="max-w-3xl max-h-[85vh] overflow-y-auto"
          onInteractOutside={(e) => {
            // Prevent Dialog from closing when clicking inside the Sheet (which portals to body)
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-dialog-content]') || target.closest('[role="dialog"]')) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            // Prevent Dialog from closing when clicking inside the Sheet
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-dialog-content]') || target.closest('[role="dialog"]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TicketsPlane className="h-5 w-5 text-sky-600" />
              {editingConfig ? 'Edit Configuration' : 'Create Configuration'}
            </DialogTitle>
            <DialogDescription>
              Configure when and how the Flight Deck modal appears for users.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pb-4 my-2.5">
              {/* Basic Settings */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Basic Settings
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Configuration Name *</Label>
                    <Input
                      id="name"
                      value={formState.name}
                      onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Engineer Daily Briefing"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="priority">Priority</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p>Controls which configuration takes precedence when multiple could apply to the same user.</p>
                            <p className="text-xs text-muted-foreground mt-1">Higher numbers are matched first. Only matters when configurations overlap (same scenario, similar roles or dates).</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="priority"
                      type="number"
                      value={formState.priority}
                      onChange={(e) => setFormState(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                      placeholder="Higher = matched first"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Targeting */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Targeting
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Target Role</Label>
                    <Select
                      value={formState.targetRole}
                      onValueChange={(value) => setFormState(prev => ({ ...prev, targetRole: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All Roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_ROLES_VALUE}>All Roles</SelectItem>
                        {(roles as Role[]).map((role) => (
                          <SelectItem key={role.id} value={role.name}>
                            {role.displayName || role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Scenario</Label>
                    <Select
                      value={formState.scenario}
                      onValueChange={(value: ScenarioType) => 
                        setFormState(prev => ({ ...prev, scenario: value, selectedDays: value === 'weekly' ? prev.selectedDays : [] }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {formState.scenario && (
                            <div className="flex items-center gap-2">
                              {(() => {
                                const Icon = scenarioConfig[formState.scenario].icon;
                                return <Icon className="h-4 w-4" />;
                              })()}
                              <span>{scenarioConfig[formState.scenario].label}</span>
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(scenarioConfig).map(([key, config]) => {
                          const Icon = config.icon;
                          return (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <div>
                                  <div>{config.label}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">{config.description}</div>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Day of Week Selection for Weekly Scenario */}
                {formState.scenario === 'weekly' && (
                  <div className="space-y-2 mt-4 p-3 rounded-lg border bg-teal-50/50 dark:bg-teal-900/10">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <CalendarRange className="h-4 w-4 text-teal-600" />
                        Select Days
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {formState.selectedDays.length === 0 
                          ? 'At least 1 day required' 
                          : `${formState.selectedDays.length} day${formState.selectedDays.length > 1 ? 's' : ''} selected`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 0, label: 'Sun' },
                        { value: 1, label: 'Mon' },
                        { value: 2, label: 'Tue' },
                        { value: 3, label: 'Wed' },
                        { value: 4, label: 'Thu' },
                        { value: 5, label: 'Fri' },
                        { value: 6, label: 'Sat' },
                      ].map((day) => {
                        const isSelected = formState.selectedDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              setFormState(prev => ({
                                ...prev,
                                selectedDays: isSelected 
                                  ? prev.selectedDays.filter(d => d !== day.value)
                                  : [...prev.selectedDays, day.value].sort((a, b) => a - b)
                              }));
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                              isSelected
                                ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-teal-400 hover:text-teal-600'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    {formState.selectedDays.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">Please select at least one day</p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Scheduling */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Scheduling (Optional)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <DatePickerInput
                      value={formState.startDate}
                      onChange={(value) => setFormState(prev => ({ ...prev, startDate: value }))}
                      placeholder="Select start date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <DatePickerInput
                      value={formState.endDate}
                      onChange={(value) => setFormState(prev => ({ ...prev, endDate: value }))}
                      placeholder="Select end date"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Widgets */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Layout className="h-4 w-4" />
                    Widgets
                  </h4>
                  <span className="text-xs text-muted-foreground">Drag to reorder display sequence</span>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleWidgetDragEnd}
                >
                  <SortableContext
                    items={formState.widgetOrder}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid grid-cols-1 gap-3">
                      {formState.widgetOrder.map((key) => {
                        const widget = widgetConfig[key];
                        if (!widget) return null;
                        const isEnabled = formState.enabledWidgets.includes(key);
                        const showExpanded = Boolean(formState.widgetSettings.expanded?.[key]);
                        return (
                          <SortableWidgetItem
                            key={key}
                            id={key}
                            widget={widget}
                            isEnabled={isEnabled}
                            onToggle={() => toggleWidget(key)}
                            onOpenSettings={() => setSettingsDrawerWidget(key)}
                            hasSettings={widgetsWithSettings.includes(key)}
                            showExpanded={showExpanded}
                            onToggleExpanded={() => {
                              setFormState(prev => ({
                                ...prev,
                                widgetSettings: {
                                  ...prev.widgetSettings,
                                  expanded: {
                                    ...(prev.widgetSettings.expanded ?? {}),
                                    [key]: !showExpanded,
                                  },
                                },
                              }));
                            }}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              <Separator />

              {/* Visual Configuration */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Visual Configuration
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="headerText">Custom Header Text</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p>Default greeting: "Good morning/afternoon/evening, {'{FirstName}'}!"</p>
                              <p className="text-xs text-muted-foreground mt-1">The greeting changes based on time of day.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-xs text-muted-foreground">(Optional)</span>
                    </div>
                    <Input
                      id="headerText"
                      value={formState.headerText}
                      onChange={(e) => setFormState(prev => ({ ...prev, headerText: e.target.value }))}
                      placeholder="Leave blank for default greeting"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="tipDisplayLocation">Tip Display Location</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p>Choose where to display daily tips:</p>
                            <ul className="text-xs text-muted-foreground mt-1 list-disc pl-4">
                              <li><strong>None:</strong> No tips shown</li>
                              <li><strong>Header:</strong> Shows below the date in the header area</li>
                              <li><strong>Philosophy Card:</strong> Shows in the Philosophy widget</li>
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={formState.tipDisplayLocation}
                      onValueChange={(value: TipDisplayLocation) => setFormState(prev => ({ ...prev, tipDisplayLocation: value }))}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Disabled)</SelectItem>
                        <SelectItem value="header">Header (Below Date)</SelectItem>
                        <SelectItem value="philosophy_card">Philosophy Card Widget</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="headerImageUrl">Header Image</Label>
                        <span className="text-xs text-muted-foreground">Max: 224 x 96 px</span>
                      </div>
                      {/* "Use CriteriaIQ logo" toggle — checked = the URL
                          field is cleared + disabled, and the FlightDeckModal
                          falls back to the active login_logo (or the bundled
                          CriteriaIQ logo) automatically picking light/dark per
                          the user's theme. Unchecking unlocks the URL + upload
                          affordances for a custom banner. */}
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <Checkbox
                          checked={formState.useDefaultHeaderImage}
                          onCheckedChange={(checked) => {
                            const useDefault = Boolean(checked);
                            setFormState(prev => ({
                              ...prev,
                              useDefaultHeaderImage: useDefault,
                              // Re-checking the box reverts to defaults
                              // by clearing any URL the admin had typed.
                              headerImageUrl: useDefault ? '' : prev.headerImageUrl,
                            }));
                          }}
                          className="mt-0.5"
                          id="fd-header-use-default"
                        />
                        <span className="text-xs text-muted-foreground leading-tight">
                          Use CriteriaIQ logo (auto light/dark)
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="headerImageUrl"
                          value={formState.headerImageUrl}
                          onChange={(e) => setFormState(prev => ({ ...prev, headerImageUrl: e.target.value }))}
                          placeholder="Upload an image or paste a URL"
                          className="flex-1"
                          disabled={formState.useDefaultHeaderImage}
                        />
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                          style={{ display: 'none' }}
                          id="fd-header-image-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFlightDeckBanner(file, 'header');
                            // Reset so re-uploading the same file fires onChange again.
                            e.target.value = '';
                          }}
                        />
                        <label htmlFor="fd-header-image-upload">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Upload an image (max 2 MB; PNG/JPEG/WEBP/SVG)"
                            disabled={formState.useDefaultHeaderImage || uploadingFlightDeckImage === 'header'}
                            asChild
                          >
                            <span className={formState.useDefaultHeaderImage ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}>
                              {uploadingFlightDeckImage === 'header'
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Upload className="h-4 w-4" />}
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Header Image Alignment</Label>
                      <ToggleGroup
                        type="single"
                        value={formState.headerImageAlignment}
                        onValueChange={(value: 'left' | 'center' | 'right') => 
                          value && setFormState(prev => ({ ...prev, headerImageAlignment: value }))
                        }
                        className="justify-start"
                      >
                        <ToggleGroupItem 
                          value="left" 
                          className="px-3 gap-1.5 border border-input data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                        >
                          <ArrowLeftToLine className="h-4 w-4" />
                          Left
                        </ToggleGroupItem>
                        <ToggleGroupItem 
                          value="center" 
                          className="px-3 gap-1.5 border border-input data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                        >
                          <ChevronsRightLeft className="h-4 w-4" />
                          Center
                        </ToggleGroupItem>
                        <ToggleGroupItem 
                          value="right" 
                          className="px-3 gap-1.5 border border-input data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                        >
                          <ArrowRightToLine className="h-4 w-4" />
                          Right
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="footerImageUrl">Footer Image</Label>
                        <span className="text-xs text-muted-foreground">Max: 160 x 48 px</span>
                      </div>
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <Checkbox
                          checked={formState.useDefaultFooterImage}
                          onCheckedChange={(checked) => {
                            const useDefault = Boolean(checked);
                            setFormState(prev => ({
                              ...prev,
                              useDefaultFooterImage: useDefault,
                              footerImageUrl: useDefault ? '' : prev.footerImageUrl,
                            }));
                          }}
                          className="mt-0.5"
                          id="fd-footer-use-default"
                        />
                        <span className="text-xs text-muted-foreground leading-tight">
                          Use CriteriaIQ logo (auto light/dark)
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="footerImageUrl"
                          value={formState.footerImageUrl}
                          onChange={(e) => setFormState(prev => ({ ...prev, footerImageUrl: e.target.value }))}
                          placeholder="Upload an image or paste a URL"
                          className="flex-1"
                          disabled={formState.useDefaultFooterImage}
                        />
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                          style={{ display: 'none' }}
                          id="fd-footer-image-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFlightDeckBanner(file, 'footer');
                            e.target.value = '';
                          }}
                        />
                        <label htmlFor="fd-footer-image-upload">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Upload an image (max 2 MB; PNG/JPEG/WEBP/SVG)"
                            disabled={formState.useDefaultFooterImage || uploadingFlightDeckImage === 'footer'}
                            asChild
                          >
                            <span className={formState.useDefaultFooterImage ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}>
                              {uploadingFlightDeckImage === 'footer'
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Upload className="h-4 w-4" />}
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Footer Image Alignment</Label>
                      <ToggleGroup
                        type="single"
                        value={formState.footerImageAlignment}
                        onValueChange={(value: 'left' | 'right') => 
                          value && setFormState(prev => ({ ...prev, footerImageAlignment: value }))
                        }
                        className="justify-start"
                      >
                        <ToggleGroupItem 
                          value="left" 
                          className="px-3 gap-1.5 border border-input data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                        >
                          <ArrowLeftToLine className="h-4 w-4" />
                          Left
                        </ToggleGroupItem>
                        <ToggleGroupItem 
                          value="right" 
                          className="px-3 gap-1.5 border border-input data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                        >
                          <ArrowRightToLine className="h-4 w-4" />
                          Right
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          <DialogFooter className="border-t pt-4 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingConfig(null);
                resetForm();
              }}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formState.name || createMutation.isPending || updateMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving...
                </>
              ) : editingConfig ? (
                <>
                  <TicketsPlane className="h-4 w-4" />
                  Update Configuration
                </>
              ) : (
                <>
                  <TicketsPlane className="h-4 w-4" />
                  Create Configuration
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Configuration Confirmation Dialog (Task #763): switched
          from a regular Dialog to AlertDialog so a stray click can't
          accidentally drop a Flight Deck configuration. Mirrors the Tip
          delete dialog above and the schema-migrations / login-history
          confirm pattern. */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this Flight Deck configuration? This will permanently remove it and any users assigned to it will fall back to the default. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Picker Dialog */}
      <Dialog open={isImagePickerOpen} onOpenChange={setIsImagePickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-sky-600" />
              Select {imagePickerField === 'header' ? 'Header' : 'Footer'} Image
            </DialogTitle>
            <DialogDescription>
              Choose an image from the available assets or enter a custom URL.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 py-4">
            {availableImages.map((image) => (
              <div
                key={image.path}
                className="group cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 p-2 hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => {
                  if (imagePickerField === 'header') {
                    setFormState(prev => ({ ...prev, headerImageUrl: image.path }));
                  } else {
                    setFormState(prev => ({ ...prev, footerImageUrl: image.path }));
                  }
                  setIsImagePickerOpen(false);
                }}
              >
                <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center overflow-hidden">
                  <img 
                    src={image.path} 
                    alt={image.name}
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '';
                      (e.target as HTMLImageElement).alt = 'Image not found';
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-center text-gray-600 dark:text-gray-400 truncate" title={image.name}>
                  {image.name}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImagePickerOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Widget Settings Drawer */}
      <Sheet modal={false} open={settingsDrawerWidget !== null} onOpenChange={(open) => !open && setSettingsDrawerWidget(null)}>
        <SheetContent 
          className="w-[450px] sm:w-[540px] overflow-y-auto"
          onOpenAutoFocus={(e) => {
            // Prevent focus conflict with parent Dialog by stopping propagation
            e.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-sky-600" />
              {settingsDrawerWidget && widgetConfig[settingsDrawerWidget]?.label} Settings
            </SheetTitle>
            <SheetDescription>
              Configure how this widget appears and behaves in Flight Deck.
            </SheetDescription>
          </SheetHeader>
          
          <div className="py-6 space-y-6">
            {/* Jumpstart Settings */}
            {settingsDrawerWidget === 'jumpstart' && (
              <JumpstartSettingsPanel 
                items={formState.widgetSettings.jumpstart?.items || defaultJumpstartItems}
                onItemsChange={(items) => {
                  setFormState(prev => ({
                    ...prev,
                    widgetSettings: {
                      ...prev.widgetSettings,
                      jumpstart: { items }
                    }
                  }));
                }}
              />
            )}

            {/* Philosophy Settings */}
            {settingsDrawerWidget === 'philosophy' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">Philosophy Entries</span>
                  <span className="text-xs text-muted-foreground ml-auto">Max 10 entries</span>
                </div>
                
                <div className="space-y-2">
                  <Label>Display Mode</Label>
                  <Select
                    value={formState.widgetSettings.philosophy?.mode || 'rotate'}
                    onValueChange={(value: 'static' | 'rotate') => {
                      setFormState(prev => ({
                        ...prev,
                        widgetSettings: {
                          ...prev.widgetSettings,
                          philosophy: {
                            ...prev.widgetSettings.philosophy!,
                            mode: value
                          }
                        }
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="static">Static (Show first entry)</SelectItem>
                      <SelectItem value="rotate">Rotate (Random daily)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {(formState.widgetSettings.philosophy?.entries || defaultPhilosophyEntries).map((entry, index) => (
                    <div key={entry.id} className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50 space-y-2">
                      <div className="flex items-start gap-2">
                        <Textarea
                          value={entry.text}
                          onChange={(e) => {
                            const newEntries = [...(formState.widgetSettings.philosophy?.entries || defaultPhilosophyEntries)];
                            newEntries[index] = { ...entry, text: e.target.value };
                            setFormState(prev => ({
                              ...prev,
                              widgetSettings: {
                                ...prev.widgetSettings,
                                philosophy: {
                                  ...prev.widgetSettings.philosophy!,
                                  entries: newEntries
                                }
                              }
                            }));
                          }}
                          placeholder="Enter philosophy text..."
                          className="min-h-[80px]"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newEntries = (formState.widgetSettings.philosophy?.entries || defaultPhilosophyEntries).filter((_, i) => i !== index);
                            setFormState(prev => ({
                              ...prev,
                              widgetSettings: {
                                ...prev.widgetSettings,
                                philosophy: {
                                  ...prev.widgetSettings.philosophy!,
                                  entries: newEntries.length > 0 ? newEntries : defaultPhilosophyEntries
                                }
                              }
                            }));
                          }}
                          disabled={(formState.widgetSettings.philosophy?.entries || defaultPhilosophyEntries).length <= 1}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {(formState.widgetSettings.philosophy?.entries || defaultPhilosophyEntries).length < 10 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const newEntry: PhilosophyEntry = {
                        id: `entry-${Date.now()}`,
                        text: ''
                      };
                      setFormState(prev => ({
                        ...prev,
                        widgetSettings: {
                          ...prev.widgetSettings,
                          philosophy: {
                            ...prev.widgetSettings.philosophy!,
                            entries: [...(prev.widgetSettings.philosophy?.entries || defaultPhilosophyEntries), newEntry]
                          }
                        }
                      }));
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Philosophy Entry
                  </Button>
                )}
              </div>
            )}

            {/* Health Pulse Settings */}
            {settingsDrawerWidget === 'health_pulse' && (
              <div className="space-y-4">
                <div className="pb-2 border-b space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">Display Options</span>
                  </div>
                  
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between h-auto py-2 px-3 text-left text-sm text-muted-foreground hover:text-foreground group"
                      >
                        <span className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          How Health Pulse Works
                        </span>
                        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-3">
                      <p className="text-muted-foreground">
                        Health Pulse provides a quick visual snapshot of your project portfolio health. 
                        All metrics are based on projects where you are the Primary Engineer.
                      </p>
                      
                      <div className="space-y-2">
                        <div className="font-medium">Metrics Explained:</div>
                        <ul className="text-muted-foreground space-y-1 ml-4 list-disc">
                          <li><strong>Project Status</strong> — 5 buckets based on Internal Status: Pending (Planning), Active (In Progress, Complete), TCC, Closed (Won/Lost/Cancelled), Stalled (On Hold)</li>
                          <li><strong>Customer Sentiment</strong> — 3 buckets: Smooth (On Time, Complete), Friction (Need Assistance, Delayed), At Risk (Evaluating Competitors)</li>
                          <li><strong>Deal Urgency</strong> — Counts projects by their Ranking field values</li>
                          <li><strong>Pipeline Value</strong> — Sum of Opportunity ACV for all non-closed projects</li>
                          <li><strong>Win Rate</strong> — Closed Won / (Closed Won + Closed Lost) as a percentage</li>
                          <li><strong>Workload</strong> — Count of all non-closed projects (active workload)</li>
                        </ul>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-emerald-500" />
                        Project Status Chart
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Stacked bar chart: Pending, Active, TCC, Closed, Stalled</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.healthPulse?.showProcessStatus ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            healthPulse: {
                              ...prev.widgetSettings.healthPulse!,
                              showProcessStatus: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Heart className="h-4 w-4 text-emerald-500" />
                        Customer Sentiment
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Badges showing Smooth, Friction, and At Risk counts</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.healthPulse?.showCustomerSentiment ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            healthPulse: {
                              ...prev.widgetSettings.healthPulse!,
                              showCustomerSentiment: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Zap className="h-4 w-4 text-emerald-500" />
                        Deal Urgency
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Badges showing project counts by Ranking field</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.healthPulse?.showDealUrgency ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            healthPulse: {
                              ...prev.widgetSettings.healthPulse!,
                              showDealUrgency: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        Pipeline Value
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Sum of Opportunity ACV for non-closed projects</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.healthPulse?.showPipelineValue ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            healthPulse: {
                              ...prev.widgetSettings.healthPulse!,
                              showPipelineValue: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-emerald-500" />
                        Win Rate
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Percentage of Closed Won vs total closed projects</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.healthPulse?.showWinRate ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            healthPulse: {
                              ...prev.widgetSettings.healthPulse!,
                              showWinRate: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-emerald-500" />
                        Workload Indicator
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Count of all non-closed projects (active workload)</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.healthPulse?.showWorkload ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            healthPulse: {
                              ...prev.widgetSettings.healthPulse!,
                              showWorkload: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Risk Radar Settings */}
            {settingsDrawerWidget === 'risk_radar' && (
              <div className="space-y-4">
                <div className="pb-2 border-b space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">Display Options</span>
                  </div>
                  
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between h-auto py-2 px-3 text-left text-sm text-muted-foreground hover:text-foreground group"
                      >
                        <span className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          How Risk Radar Works
                        </span>
                        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-3">
                      <p className="text-muted-foreground">
                        Risk Radar displays at-a-glance metrics about projects where you are the Primary Engineer. 
                        No complex formulas—it simply counts projects by their field values.
                      </p>
                      
                      <div className="space-y-2">
                        <div className="font-medium">Data Sources:</div>
                        <ul className="text-muted-foreground space-y-1 ml-4 list-disc">
                          <li><strong>Risk Level</strong> — From project's "Risk Level" field (Red, Yellow, Green)</li>
                          <li><strong>Ranking</strong> — From project's "Ranking" field (In Quarter, Burn It Down, etc.)</li>
                          <li><strong>Customer Status</strong> — Used to flag "Evaluating Competitors" projects</li>
                          <li><strong>Target Close Date</strong> — Used for deadline tracking</li>
                          <li><strong>Process/Internal Status</strong> — Used for completion tracking</li>
                        </ul>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="font-medium">High Alert List includes:</div>
                        <ul className="text-muted-foreground space-y-1 ml-4 list-disc">
                          <li>Projects with Red Risk level</li>
                          <li>Projects where customer is "Evaluating Competitors"</li>
                        </ul>
                      </div>
                      
                      <p className="text-xs text-muted-foreground italic">
                        Configure these fields in Configuration → Field Settings
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-emerald-500" />
                        Risk Level Counts
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Show Red & Yellow risk project counts</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.riskRadar?.showRiskCounts ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            riskRadar: {
                              ...prev.widgetSettings.riskRadar!,
                              showRiskCounts: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-emerald-500" />
                        Ranking Counts
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Show "In Quarter" & "Burn It Down" counts</div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.riskRadar?.showRankingCounts ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            riskRadar: {
                              ...prev.widgetSettings.riskRadar!,
                              showRankingCounts: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-emerald-500" />
                        Deadline Tracking
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Show projects ending today, this week, and overdue</div>
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-6">
                        Excludes: TCC, Closed Won, Closed Lost, Cancelled
                      </div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.riskRadar?.showDeadlines ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            riskRadar: {
                              ...prev.widgetSettings.riskRadar!,
                              showDeadlines: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-emerald-500" />
                        Pending TCC
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Show projects marked Complete but not yet TCC</div>
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-6">
                        Process Status = Complete, Internal Status ≠ TCC
                      </div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.riskRadar?.showPendingTcc ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            riskRadar: {
                              ...prev.widgetSettings.riskRadar!,
                              showPendingTcc: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <PieChart className="h-4 w-4 text-emerald-500" />
                        Technical Risk
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">Show risk distribution chart (Red/Yellow/Green)</div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 ml-6">
                        Visual breakdown of your portfolio risk levels
                      </div>
                    </div>
                    <Switch
                      checked={formState.widgetSettings.riskRadar?.showTechnicalRisk ?? true}
                      onCheckedChange={(checked) => {
                        setFormState(prev => ({
                          ...prev,
                          widgetSettings: {
                            ...prev.widgetSettings,
                            riskRadar: {
                              ...prev.widgetSettings.riskRadar!,
                              showTechnicalRisk: checked
                            }
                          }
                        }));
                      }}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>High Alert Project Limit</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[formState.widgetSettings.riskRadar?.highAlertLimit ?? 3]}
                        onValueChange={([value]) => {
                          setFormState(prev => ({
                            ...prev,
                            widgetSettings: {
                              ...prev.widgetSettings,
                              riskRadar: {
                                ...prev.widgetSettings.riskRadar!,
                                highAlertLimit: value
                              }
                            }
                          }));
                        }}
                        min={1}
                        max={10}
                        step={1}
                        className="flex-1"
                      />
                      <span className="w-8 text-center font-medium">
                        {formState.widgetSettings.riskRadar?.highAlertLimit ?? 3}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maximum number of high-risk projects to display in the alert list.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setSettingsDrawerWidget(null)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Preview Modal */}
      <Dialog open={previewConfigId !== null} onOpenChange={(open) => !open && setPreviewConfigId(null)}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl">
          {isLoadingPreview ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
            </div>
          ) : previewData?.config ? (
            <>
              {/* Preview Header */}
              <div className="relative p-8 bg-gradient-to-br from-sky-50/80 via-blue-50/50 to-transparent dark:from-sky-950/30 dark:via-blue-950/20 dark:to-transparent border-b border-sky-100 dark:border-sky-900/30">
                {/* Preview Badge - positioned left of the close X button */}
                <Badge className="absolute right-12 top-4 bg-amber-500 text-white hover:bg-amber-500">
                  Preview Mode
                </Badge>

                <div className={`flex items-center gap-6 ${
                  previewData.config.headerImageAlignment === 'left' ? 'flex-row' :
                  previewData.config.headerImageAlignment === 'right' ? 'flex-row-reverse' : 'flex-col'
                }`}>
                  {/* Header Image */}
                  {previewData.config.headerImageUrl && (
                    <div className={previewData.config.headerImageAlignment === 'center' ? 'mb-4' : ''}>
                      <img
                        src={previewData.config.headerImageUrl}
                        alt=""
                        className="h-24 max-w-56 w-auto object-contain"
                      />
                    </div>
                  )}

                  {/* Header Text */}
                  <div className={`flex-1 ${previewData.config.headerImageAlignment === 'center' ? 'text-center' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <TicketsPlane className="h-5 w-5 text-sky-600" />
                      <span className="text-sm font-medium text-sky-600 dark:text-sky-400">Flight Deck</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {previewData.config.headerText || `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${previewData.user?.firstName || 'there'}!`}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview Widgets */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-4">
                  {(previewData.config.enabledWidgets || []).length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Layout className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No widgets enabled for this configuration.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {(previewData.config.enabledWidgets || []).map((widgetKey: string) => (
                        <Card key={widgetKey} className="border-dashed">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              {widgetConfig[widgetKey]?.icon && (() => {
                                const Icon = widgetConfig[widgetKey].icon;
                                return <Icon className="h-5 w-5 text-sky-600" />;
                              })()}
                              <div className="flex-1">
                                <h4 className="font-medium">{widgetConfig[widgetKey]?.label || widgetKey}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{widgetConfig[widgetKey]?.description || 'Widget preview'}</p>
                              </div>
                              {(() => {
                                const dataKey = widgetKey === 'health_pulse' ? 'healthPulse' : widgetKey === 'risk_radar' ? 'riskRadar' : widgetKey === 'resume_button' ? 'resume' : widgetKey;
                                const widgetDataObj = previewData.data?.[dataKey];
                                
                                let hasActualData = false;
                                if (widgetKey === 'health_pulse' && widgetDataObj) {
                                  const hp = widgetDataObj as any;
                                  const ps = hp.processStatus;
                                  const cs = hp.customerStatus;
                                  const hasProcData = ps && (ps.pending > 0 || ps.active > 0 || ps.closed > 0 || ps.stalled > 0 || ps.tcc > 0);
                                  const hasCustData = cs && (cs.smooth > 0 || cs.friction > 0 || cs.atRisk > 0);
                                  const hasUrgencyData = hp.dealUrgency && Object.values(hp.dealUrgency).some((v: any) => v > 0);
                                  hasActualData = hasProcData || hasCustData || hasUrgencyData || (hp.pipelineValue && hp.pipelineValue > 0) || hp.winRate != null || (hp.workloadCount && hp.workloadCount > 0);
                                } else if (widgetKey === 'risk_radar' && widgetDataObj) {
                                  const rr = widgetDataObj as any;
                                  const hasRiskData = rr.riskCounts && (rr.riskCounts.red > 0 || rr.riskCounts.yellow > 0);
                                  const hasTechRisk = rr.technicalRiskCounts && (rr.technicalRiskCounts.red > 0 || rr.technicalRiskCounts.yellow > 0 || rr.technicalRiskCounts.green > 0);
                                  const hasRankData = rr.rankingCounts && (rr.rankingCounts.inQuarter > 0 || rr.rankingCounts.burnItDown > 0);
                                  const hasAlerts = rr.highAlertProjects && rr.highAlertProjects.length > 0;
                                  const hasDeadlines = rr.deadlineCounts && (rr.deadlineCounts.endingToday > 0 || rr.deadlineCounts.endingThisWeek > 0 || rr.deadlineCounts.overdue > 0);
                                  hasActualData = hasRiskData || hasTechRisk || hasRankData || hasAlerts || hasDeadlines || (rr.pendingTccCount && rr.pendingTccCount > 0);
                                } else {
                                  hasActualData = !!widgetDataObj;
                                }
                                
                                return hasActualData ? (
                                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                    Has Data
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
                                    No Data
                                  </Badge>
                                );
                              })()}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Footer */}
              {previewData.config.footerImageUrl && (
                <div className={`px-6 pb-4 flex ${previewData.config.footerImageAlignment === 'right' ? 'justify-end' : 'justify-start'}`}>
                  <img
                    src={previewData.config.footerImageUrl}
                    alt=""
                    className="h-12 max-w-40 w-auto object-contain"
                  />
                </div>
              )}

              <DialogFooter className="border-t p-4">
                <Button onClick={() => setPreviewConfigId(null)}>
                  <X className="h-4 w-4 mr-2" />
                  Close Preview
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Failed to load preview data.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
