import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from '@/lib/queryClient';
import { 
  AlertCircle, 
  Plus, 
  SquarePen, 
  Trash2, 
  Eye,
  EyeOff,
  Bell,
  Mail,
  CalendarDays,
  Users,
  UsersRound,
  Info,
  AlertTriangle,
  XCircle,
  Megaphone,
  Clock,
  X,
  Sparkles,
  User,
  PartyPopper,
  Wrench
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import { MaintenanceWindowDialog, MaintenanceWindowSummary } from './MaintenanceWindowDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table';
import { sortRows, useUrlSortState } from '@/lib/sorting';
import { Switch } from '@/components/ui/switch';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { TiptapEditor } from '@/components/rich-text/TiptapEditor';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TeamTargetsPicker } from "@/components/teams/team-targets-picker";
import { EMPTY_TEAM_TARGETS, parseTargetIds, type TeamTargets } from "@shared/teams";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";

interface User {
  role?: string;
  [key: string]: any;
}

interface AnnouncementsManagerProps {
  user: User | null;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  targetRoles: string[] | null;
  targetUserIds: string[] | null;
  targetTeamIds?: number[] | null;
  targetSubteamIds?: number[] | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
  sendEmail: boolean;
  emailTemplateId: number | null;
  celebrationEffect: string | null;
  celebrationConfig: Record<string, any> | null;
  celebrationOnClick?: 'first' | 'every';
  celebrationOnLogin?: 'first' | 'every';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  createdByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface TargetUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Role {
  id: number;
  name: string;
  displayName: string;
  color: string;
  icon?: string;
}

interface EmailTemplate {
  id: number;
  name: string;
  templateKey: string;
  category: string;
  subject: string;
  isActive: boolean;
}

const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };

const severityConfig = {
  info: { 
    label: 'Info', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Info 
  },
  warning: { 
    label: 'Warning', 
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    icon: AlertTriangle 
  },
  critical: { 
    label: 'Critical', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: XCircle 
  },
};

export function AnnouncementsManager({ user }: AnnouncementsManagerProps) {
  const { t } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<Announcement | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [rolesPopoverOpen, setRolesPopoverOpen] = useState(false);
  const [sortConfig, handleSort] = useUrlSortState('announcements');
  
  const queryClient = useQueryClient();
  

  // Fetch announcements
  const { data: announcements = [], isLoading: isLoadingAnnouncements } = useQuery({
    queryKey: ['/api/admin/announcements'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/announcements');
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

  // Fetch email templates for announcements
  const { data: emailTemplates = [] } = useQuery({
    queryKey: ['/api/email-templates/for-announcements'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/email-templates/for-announcements');
    },
    enabled: user?.role === 'Admin',
  });

  // Create announcement mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/admin/announcements', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/announcements/active'] });
      setIsCreateDialogOpen(false);
      showSuccessToast('Announcement Created', 'Your announcement has been published.');
    },
    onError: (error: any) => {
      showErrorToast('Creation Failed', error.message || 'Failed to create announcement');
    },
  });

  // Update announcement mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PATCH', `/api/admin/announcements/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/announcements/active'] });
      setEditingAnnouncement(null);
      showSuccessToast('Announcement Updated', 'Your announcement has been updated.');
    },
    onError: (error: any) => {
      showErrorToast('Update Failed', error.message || 'Failed to update announcement');
    },
  });

  // Delete announcement mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/announcements/active'] });
      setDeleteConfirmId(null);
      showSuccessToast('Announcement Deleted', 'The announcement has been deleted.');
    },
    onError: (error: any) => {
      showErrorToast('Deletion Failed', error.message || 'Failed to delete announcement');
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return await apiRequest('PATCH', `/api/admin/announcements/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/announcements/active'] });
      showSuccessToast('Status Updated', 'Announcement status has been updated.');
    },
    onError: (error: any) => {
      showErrorToast('Update Failed', error.message || 'Failed to update status');
    },
  });

  // Get announcement status
  const getAnnouncementStatus = (announcement: Announcement) => {
    const now = new Date();
    const startDate = parseISO(announcement.startDate);
    const endDate = announcement.endDate ? parseISO(announcement.endDate) : null;

    if (!announcement.isActive) {
      return { label: 'Inactive', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' };
    }
    if (isBefore(now, startDate)) {
      return { label: 'Scheduled', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' };
    }
    if (endDate && isAfter(now, endDate)) {
      return { label: 'Expired', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300' };
    }
    return { label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
  };

  const sortedAnnouncements = sortRows(announcements as Announcement[], sortConfig, {
    severity: (a) => SEVERITY_RANK[a.severity] ?? -1,
    status: (a) => getAnnouncementStatus(a).label,
    display: (a) => [a.showInHeader, a.showInFooter, a.sendEmail, !!a.celebrationEffect].filter(Boolean).length,
    target: (a) => a.targetRoles?.length ?? 0,
    startDate: (a) => parseISO(a.startDate),
    isActive: (a) => a.isActive,
  });

  if (user?.role !== 'Admin') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-red-700">Access Denied</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Only administrators can manage system announcements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Megaphone} />
        <CardHeader className="flex flex-col gap-4 space-y-0 2xl:flex-row 2xl:items-start 2xl:justify-between relative z-10">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              System Announcements
            </CardTitle>
            <CardDescription>
              Create and manage system-wide announcements. Broadcast important updates to users via the notification bell, bottom banner, or email.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-end 2xl:self-auto">
            <Button size="sm" variant="outline" onClick={() => setIsMaintenanceDialogOpen(true)} data-testid="new-maintenance-announcement">
              <Wrench className="h-4 w-4 mr-2" />
              {t('configuration.maintenance.newButton')}
            </Button>
            <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Megaphone className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <MaintenanceWindowSummary onEdit={() => setIsMaintenanceDialogOpen(true)} />
          {isLoadingAnnouncements ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No announcements yet. Click "New Announcement" to create your first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="title" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colTitle')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="severity" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colSeverity')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colStatus')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="display" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colDisplay')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="target" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colTarget')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="startDate" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colSchedule')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="isActive" sortConfig={sortConfig} onSort={handleSort}>
                    {t('configuration.announcements.table.colActive')}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} align="right">{t('configuration.announcements.table.colActions')}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAnnouncements.map((announcement) => {
                  const status = getAnnouncementStatus(announcement);
                  const SeverityIcon = severityConfig[announcement.severity]?.icon || Info;
                  
                  return (
                    <TableRow key={announcement.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {announcement.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={severityConfig[announcement.severity]?.color}>
                          <SeverityIcon className="h-3 w-3 mr-1" />
                          {severityConfig[announcement.severity]?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={status.color}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {announcement.showInHeader && (
                            <Badge variant="secondary" className="text-xs">
                              <Bell className="h-3 w-3 mr-1" />
                              Bell
                            </Badge>
                          )}
                          {announcement.showInFooter && (
                            <Badge variant="secondary" className="text-xs">
                              Banner
                            </Badge>
                          )}
                          {announcement.sendEmail && (
                            <Badge variant="secondary" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />
                              Email
                            </Badge>
                          )}
                          {announcement.celebrationEffect && (
                            <Badge variant="secondary" className="text-xs bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                              <PartyPopper className="h-3 w-3 mr-1" />
                              Celebration
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {announcement.targetRoles && announcement.targetRoles.length > 0 ? (
                            <Badge variant="outline">
                              <Users className="h-3 w-3 mr-1" />
                              {announcement.targetRoles.length} role(s)
                            </Badge>
                          ) : !(announcement.targetTeamIds?.length || announcement.targetSubteamIds?.length) ? (
                            <span className="text-gray-500 dark:text-gray-400 text-sm">All Users</span>
                          ) : null}
                          {(announcement.targetTeamIds?.length || announcement.targetSubteamIds?.length) ? (
                            <Badge variant="outline">
                              <UsersRound className="h-3 w-3 mr-1" />
                              {t("teams.targets.selected", {
                                count: (announcement.targetTeamIds?.length ?? 0) + (announcement.targetSubteamIds?.length ?? 0),
                              })}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {format(parseISO(announcement.startDate), 'MMM d, yyyy')}
                          {announcement.endDate && (
                            <> - {format(parseISO(announcement.endDate), 'MMM d, yyyy')}</>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={announcement.isActive}
                          onCheckedChange={(checked) => 
                            toggleActiveMutation.mutate({ id: announcement.id, isActive: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ResponsiveTableActionsMenu
                          actions={[
                            {
                              id: 'view',
                              label: 'View Announcement',
                              icon: Eye,
                              onClick: () => setViewingAnnouncement(announcement)
                            },
                            {
                              id: 'edit',
                              label: 'Edit Announcement',
                              icon: SquarePen,
                              onClick: () => {
                                setEditingAnnouncement(announcement);
                                setSelectedRoles(announcement.targetRoles || []);
                                setSelectedUserIds(announcement.targetUserIds || []);
                              }
                            },
                            {
                              id: 'delete',
                              label: 'Delete Announcement',
                              icon: Trash2,
                              onClick: () => setDeleteConfirmId(announcement.id),
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

      <MaintenanceWindowDialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen} />

      {/* Create/Edit Dialog */}
      <AnnouncementDialog
        open={isCreateDialogOpen || !!editingAnnouncement}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingAnnouncement(null);
            setSelectedRoles([]);
            setSelectedUserIds([]);
          }
        }}
        announcement={editingAnnouncement}
        roles={roles as Role[]}
        emailTemplates={emailTemplates as EmailTemplate[]}
        selectedRoles={selectedRoles}
        setSelectedRoles={setSelectedRoles}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
        rolesPopoverOpen={rolesPopoverOpen}
        setRolesPopoverOpen={setRolesPopoverOpen}
        onSubmit={(data) => {
          if (editingAnnouncement) {
            updateMutation.mutate({ id: editingAnnouncement.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* View Dialog */}
      <Dialog open={!!viewingAnnouncement} onOpenChange={() => setViewingAnnouncement(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingAnnouncement && (
                <Badge variant="outline" className={severityConfig[viewingAnnouncement.severity]?.color}>
                  {severityConfig[viewingAnnouncement.severity]?.label}
                </Badge>
              )}
              {viewingAnnouncement?.title}
            </DialogTitle>
            <DialogDescription>
              Created by {viewingAnnouncement?.createdByUser?.firstName} {viewingAnnouncement?.createdByUser?.lastName} on{' '}
              {viewingAnnouncement?.createdAt && format(parseISO(viewingAnnouncement.createdAt), 'MMMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]} 
              rehypePlugins={[rehypeRaw]}
            >
              {viewingAnnouncement?.content || ''}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog (Task #763): switched from a regular
          Dialog to AlertDialog so the destructive action follows the same
          modal-confirm pattern as the schema-migrations Apply / login-history
          Prune dialogs. AlertDialog blocks
          dismissal via outside-click / Escape so an admin can't accidentally
          confirm a wipe by stray-clicking. */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this announcement? This will permanently remove it for all users and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Separate component for the create/edit dialog to manage form state
interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
  roles: Role[];
  emailTemplates: EmailTemplate[];
  selectedRoles: string[];
  setSelectedRoles: (roles: string[]) => void;
  selectedUserIds: string[];
  setSelectedUserIds: (userIds: string[]) => void;
  rolesPopoverOpen: boolean;
  setRolesPopoverOpen: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

const CELEBRATION_STYLES = [
  { value: 'confetti_burst', label: 'Confetti Burst' },
  { value: 'side_cannons', label: 'Side Cannons' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'stars', label: 'Stars' },
];

const COLOR_PRESETS = [
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'gold', label: 'Gold & White' },
  { value: 'brand', label: 'Brand (Purple & Blue)' },
  { value: 'mono', label: 'Monochrome' },
];

function CelebrationConfigPanel({
  style,
  config,
  onChange,
}: {
  style: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}) {
  const set = (key: string, val: any) => onChange({ ...config, [key]: val });

  const numField = (key: string, label: string, min: number, max: number, defaultVal: number) => (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-400">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={config[key] ?? defaultVal}
        onChange={(e) => set(key, parseInt(e.target.value) || defaultVal)}
        className="h-8 text-sm"
      />
      <p className="text-xs text-muted-foreground">{min}–{max}</p>
    </div>
  );

  const colorPresetField = (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-400">Color Preset</Label>
      <Select value={config.colorPreset || 'rainbow'} onValueChange={(v) => set('colorPreset', v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COLOR_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3 pl-6 border-l-2 border-pink-200 dark:border-pink-800 mt-2">
      {style === 'confetti_burst' && (
        <>
          {numField('particleCount', 'Particle Count', 50, 300, 150)}
          {numField('spread', 'Spread (°)', 30, 180, 90)}
          {numField('duration', 'Duration (s)', 1, 10, 4)}
          {colorPresetField}
        </>
      )}
      {style === 'side_cannons' && (
        <>
          {numField('particleCount', 'Particles per Cannon', 30, 200, 80)}
          {numField('startVelocity', 'Start Velocity', 20, 80, 45)}
          {numField('duration', 'Duration (s)', 1, 10, 4)}
          {colorPresetField}
        </>
      )}
      {style === 'fireworks' && (
        <>
          {numField('burstCount', 'Burst Count', 2, 10, 5)}
          {numField('particleCount', 'Particles per Burst', 20, 100, 40)}
          {numField('duration', 'Duration (s)', 1, 10, 4)}
          {colorPresetField}
        </>
      )}
      {style === 'stars' && (
        <>
          {numField('particleCount', 'Particle Count', 50, 200, 100)}
          {numField('spread', 'Spread (°)', 20, 120, 60)}
          {numField('startVelocity', 'Start Velocity', 20, 60, 35)}
          {numField('duration', 'Duration (s)', 1, 10, 4)}
          {colorPresetField}
        </>
      )}
    </div>
  );
}

function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
  roles,
  emailTemplates,
  selectedRoles,
  setSelectedRoles,
  selectedUserIds,
  setSelectedUserIds,
  rolesPopoverOpen,
  setRolesPopoverOpen,
  onSubmit,
  isSubmitting,
}: AnnouncementDialogProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showInHeader, setShowInHeader] = useState(true);
  const [showInFooter, setShowInFooter] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState<string>('');
  const [usersPopoverOpen, setUsersPopoverOpen] = useState(false);
  const [celebrationEnabled, setCelebrationEnabled] = useState(false);
  const [celebrationStyle, setCelebrationStyle] = useState('confetti_burst');
  const [celebrationConfig, setCelebrationConfig] = useState<Record<string, any>>({});
  const [celebrationOnClick, setCelebrationOnClick] = useState<'first' | 'every'>('first');
  const [celebrationOnLogin, setCelebrationOnLogin] = useState<'first' | 'every'>('first');
  const [teamTargets, setTeamTargets] = useState<TeamTargets>(EMPTY_TEAM_TARGETS);
  const { t } = useTranslation();

  // Fetch users by selected roles
  const { data: usersInRoles = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['/api/users/by-roles', selectedRoles],
    queryFn: async () => {
      if (selectedRoles.length === 0) return [];
      const params = new URLSearchParams();
      selectedRoles.forEach(role => params.append('roles', role));
      return await apiRequest('GET', `/api/users/by-roles?${params.toString()}`);
    },
    enabled: selectedRoles.length > 0 && open,
  });

  // Initialize form when announcement changes
  useMemo(() => {
    if (announcement) {
      setTitle(announcement.title);
      setContent(announcement.content);
      setSeverity(announcement.severity);
      setStartDate(announcement.startDate.split('T')[0]);
      setEndDate(announcement.endDate ? announcement.endDate.split('T')[0] : '');
      setShowInHeader(announcement.showInHeader);
      setShowInFooter(announcement.showInFooter);
      setSendEmail(announcement.sendEmail);
      setEmailTemplateId(announcement.emailTemplateId?.toString() || '');
      setCelebrationEnabled(!!announcement.celebrationEffect);
      setCelebrationStyle(announcement.celebrationEffect || 'confetti_burst');
      setCelebrationConfig(announcement.celebrationConfig || {});
      setCelebrationOnClick((announcement as any).celebrationOnClick === 'every' ? 'every' : 'first');
      setCelebrationOnLogin((announcement as any).celebrationOnLogin === 'every' ? 'every' : 'first');
      setTeamTargets({
        teamIds: parseTargetIds(announcement.targetTeamIds),
        subteamIds: parseTargetIds(announcement.targetSubteamIds),
      });
    } else {
      setTitle('');
      setContent('');
      setSeverity('info');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setShowInHeader(true);
      setShowInFooter(false);
      setSendEmail(false);
      setEmailTemplateId('');
      setCelebrationEnabled(false);
      setCelebrationStyle('confetti_burst');
      setCelebrationConfig({});
      setCelebrationOnClick('first');
      setCelebrationOnLogin('first');
      setTeamTargets(EMPTY_TEAM_TARGETS);
    }
  }, [announcement]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      content,
      severity,
      targetRoles: selectedRoles.length > 0 ? selectedRoles : null,
      targetUserIds: selectedUserIds.length > 0 ? selectedUserIds : null,
      targetTeamIds: teamTargets.teamIds,
      targetSubteamIds: teamTargets.subteamIds,
      startDate: new Date(startDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      showInHeader,
      showInFooter,
      sendEmail,
      emailTemplateId: emailTemplateId ? parseInt(emailTemplateId) : null,
      celebrationEffect: celebrationEnabled ? celebrationStyle : null,
      celebrationConfig: celebrationEnabled ? celebrationConfig : null,
      celebrationOnClick: celebrationEnabled ? celebrationOnClick : 'first',
      celebrationOnLogin: celebrationEnabled ? celebrationOnLogin : 'first',
    });
  };

  const toggleRole = (roleName: string) => {
    if (selectedRoles.includes(roleName)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleName));
      const usersToRemove = (usersInRoles as TargetUser[])
        .filter(u => u.role === roleName)
        .map(u => u.id);
      setSelectedUserIds(selectedUserIds.filter(id => !usersToRemove.includes(id)));
    } else {
      setSelectedRoles([...selectedRoles, roleName]);
    }
  };

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[800px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {announcement ? 'Edit Announcement' : 'New Announcement'}
          </DialogTitle>
          <DialogDescription>
            Create a system-wide announcement to notify users of important updates.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-1">
          <form onSubmit={handleSubmit} className="space-y-5 px-1">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter announcement title"
              required
            />
          </div>

          {/* Content with rich-text editor - reduced height */}
          <div className="space-y-2">
            <Label>Content *</Label>
            <TiptapEditor
              value={content}
              onChange={setContent}
              placeholder="Write your announcement content..."
              size="lg"
              toolbar="compact"
              minHeight="150px"
              maxHeight="200px"
            />
          </div>

          {/* Severity, Target Roles, and Specific Users - Three Columns */}
          <div className="grid grid-cols-[130px_1fr_1.5fr] gap-4">
            {/* Severity */}
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <TooltipProvider delayDuration={300}>
                    <SelectItem value="info">
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-blue-600" />
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>General information and updates</p>
                          </TooltipContent>
                        </Tooltip>
                        Info
                      </div>
                    </SelectItem>
                    <SelectItem value="warning">
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>Important notices requiring attention</p>
                          </TooltipContent>
                        </Tooltip>
                        Warning
                      </div>
                    </SelectItem>
                    <SelectItem value="critical">
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <XCircle className="h-4 w-4 text-red-600" />
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>Urgent issues requiring immediate action</p>
                          </TooltipContent>
                        </Tooltip>
                        Critical
                      </div>
                    </SelectItem>
                  </TooltipProvider>
                </SelectContent>
              </Select>
            </div>

            {/* Target Roles */}
            <div className="space-y-2">
              <Label>Target Roles</Label>
              <Popover open={rolesPopoverOpen} onOpenChange={setRolesPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal h-10"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {selectedRoles.length > 0
                      ? `${selectedRoles.length} role(s)`
                      : 'All roles'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search roles..." />
                    <CommandList>
                      <CommandEmpty>No roles found.</CommandEmpty>
                      <CommandGroup>
                        {roles.map((role) => (
                          <CommandItem
                            key={role.id}
                            onSelect={() => toggleRole(role.name)}
                          >
                            <Checkbox
                              checked={selectedRoles.includes(role.name)}
                              className="mr-2"
                            />
                            <span style={{ color: role.color }} className="mr-2">
                              <DynamicIcon name={role.icon || 'User'} className="h-4 w-4" />
                            </span>
                            {role.displayName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Specific Users */}
            <div className="space-y-2">
              <Label>Specific Users</Label>
              <Popover open={usersPopoverOpen} onOpenChange={setUsersPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal h-10 ${
                      selectedRoles.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={selectedRoles.length === 0}
                  >
                    <User className="mr-2 h-4 w-4" />
                    {selectedRoles.length === 0
                      ? 'Select roles first'
                      : selectedUserIds.length > 0
                        ? `${selectedUserIds.length} user(s)`
                        : 'All in role(s)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search users..." />
                    <CommandList>
                      <CommandEmpty>
                        {isLoadingUsers ? 'Loading users...' : 'No users found.'}
                      </CommandEmpty>
                      {selectedRoles.map((roleName) => {
                        const role = roles.find(r => r.name === roleName);
                        const usersInRole = (usersInRoles as TargetUser[]).filter(u => u.role === roleName);
                        if (usersInRole.length === 0) return null;
                        return (
                          <CommandGroup key={roleName} heading={role?.displayName || roleName}>
                            {usersInRole.map((u) => (
                              <CommandItem
                                key={u.id}
                                onSelect={() => toggleUser(u.id)}
                              >
                                <Checkbox
                                  checked={selectedUserIds.includes(u.id)}
                                  className="mr-2"
                                />
                                <div className="flex flex-col">
                                  <span>{u.firstName} {u.lastName}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{u.email}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        );
                      })}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Target Teams - narrows roles and users to people on these teams */}
          <div className="space-y-2">
            <Label>{t("teams.targets.announcementLabel")}</Label>
            <TeamTargetsPicker
              value={teamTargets}
              onChange={setTeamTargets}
              emptyLabel={t("teams.targets.allTeams")}
            />
            <p className="text-xs text-muted-foreground">{t("teams.targets.announcementHint")}</p>
          </div>

          {/* Selected Role and User Badges - Full Width Below */}
          {(selectedRoles.length > 0 || selectedUserIds.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {selectedRoles.map((roleName) => {
                const role = roles.find(r => r.name === roleName);
                return (
                  <Badge
                    key={`role-${roleName}`}
                    className="cursor-pointer flex items-center gap-1 text-white"
                    style={{ backgroundColor: role?.color || '#6b7280' }}
                    onClick={() => toggleRole(roleName)}
                  >
                    <DynamicIcon name={role?.icon || 'User'} className="h-3 w-3" />
                    {role?.displayName || roleName}
                    <X className="h-3 w-3 ml-0.5" />
                  </Badge>
                );
              })}
              {selectedUserIds.map((userId) => {
                const user = (usersInRoles as TargetUser[]).find(u => u.id === userId);
                if (!user) return null;
                return (
                  <Badge
                    key={`user-${userId}`}
                    variant="secondary"
                    className="cursor-pointer flex items-center gap-1"
                    onClick={() => toggleUser(userId)}
                  >
                    <User className="h-3 w-3" />
                    {user.firstName} {user.lastName}
                    <X className="h-3 w-3 ml-0.5" />
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Display Options */}
          <div className="space-y-3">
            <Label>Display Options</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm">Show in Header Bell (Notification Center)</span>
                </div>
                <Switch
                  checked={showInHeader}
                  onCheckedChange={setShowInHeader}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm">Show in Bottom Banner</span>
                </div>
                <Switch
                  checked={showInFooter}
                  onCheckedChange={setShowInFooter}
                />
              </div>
            </div>
          </div>

          {/* Email Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium">Send Email Notification</span>
              </div>
              <Switch
                checked={sendEmail}
                onCheckedChange={setSendEmail}
              />
            </div>
            
            {sendEmail && (
              <div className="space-y-2 pl-6 border-l-2 border-gray-200 dark:border-gray-700 mt-2">
                <Label>Email Template</Label>
                <Select value={emailTemplateId || "default"} onValueChange={(v) => setEmailTemplateId(v === "default" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Use System Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use System Default</SelectItem>
                    {emailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Available variables: {'{{title}}'}, {'{{content}}'}, {'{{severity}}'}, {'{{startDate}}'}, {'{{endDate}}'}
                </p>
              </div>
            )}
          </div>

          {/* Celebration Effect */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PartyPopper className="h-4 w-4 text-pink-500 dark:text-pink-400" />
                <span className="text-sm font-medium">Celebration Effect</span>
              </div>
              <Switch
                checked={celebrationEnabled}
                onCheckedChange={(v) => {
                  setCelebrationEnabled(v);
                  if (!v) {
                    setCelebrationStyle('confetti_burst');
                    setCelebrationConfig({});
                  }
                }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">
              Fires a visual celebration when users first see this announcement.
            </p>

            {celebrationEnabled && (
              <div className="space-y-3 pl-6 border-l-2 border-pink-200 dark:border-pink-800 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Style</Label>
                  <Select
                    value={celebrationStyle}
                    onValueChange={(v) => {
                      setCelebrationStyle(v);
                      setCelebrationConfig({});
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CELEBRATION_STYLES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          <span className="flex items-center gap-2">
                            <PartyPopper className="h-3.5 w-3.5 text-pink-500" />
                            {s.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <CelebrationConfigPanel
                  style={celebrationStyle}
                  config={celebrationConfig}
                  onChange={setCelebrationConfig}
                />

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Fire on click of Bell row / Bottom Banner</Label>
                  <Select
                    value={celebrationOnClick}
                    onValueChange={(v) => setCelebrationOnClick(v as 'first' | 'every')}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">First click only (default)</SelectItem>
                      <SelectItem value="every">Every click</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Fire on login / page load</Label>
                  <Select
                    value={celebrationOnLogin}
                    onValueChange={(v) => setCelebrationOnLogin(v as 'first' | 'every')}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">First login only (default)</SelectItem>
                      <SelectItem value="every">Every login</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title || !content || !startDate}>
              <Megaphone className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Saving...' : (announcement ? 'Update' : 'Create')} Announcement
            </Button>
          </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
