import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { History, User, Calendar, CalendarIcon, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProjectAuditEntry {
  id: number;
  projectId: number;
  userId: string;
  userEmail: string;
  userName: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  changeType: 'add' | 'remove' | 'update';
  changedAt: string;
}

interface AuditHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName?: string;
  customerName?: string;
}

function formatFieldName(fieldName: string, t: (key: string) => string): string {
  const fieldMap: Record<string, string> = {
    'status': t('projects.auditHistory.field.status'),
    'customerStatus': t('projects.auditHistory.field.customerStatus'),
    'risk': t('projects.auditHistory.field.risk'),
    'ranking': t('projects.auditHistory.field.ranking'),
    'startDate': t('projects.auditHistory.field.startDate'),
    'endDate': t('projects.auditHistory.field.endDate'),
    'customerAccess': t('projects.auditHistory.field.customerAccess'),
    'additionalAccess': t('projects.auditHistory.field.additionalAccess'),
    'successCriteria': t('projects.auditHistory.field.successCriteria')
  };
  return fieldMap[fieldName] || fieldName;
}

function formatValue(value: string, fieldName: string, t: (key: string) => string): string {
  if (!value) return t('projects.auditHistory.none');
  
  if (fieldName.includes('Date') && value !== t('projects.auditHistory.none')) {
    try {
      return format(new Date(value), 'MMM dd, yyyy');
    } catch (error) {
      return value;
    }
  }
  
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const array = JSON.parse(value);
      return Array.isArray(array) ? array.join(', ') : value;
    } catch (error) {
      return value;
    }
  }
  
  return value;
}

function getChangeTypeColor(changeType: string): string {
  switch (changeType) {
    case 'add': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'remove': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'update': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

function getChangeTypeLabel(changeType: string, t: (key: string) => string): string {
  switch (changeType) {
    case 'add': return t('projects.auditHistory.added');
    case 'remove': return t('projects.auditHistory.removed');
    case 'update': return t('projects.auditHistory.updated');
    default: return t('projects.auditHistory.changed');
  }
}

export function AuditHistoryDrawer({ 
  open, 
  onOpenChange, 
  projectId,
  projectName,
  customerName 
}: AuditHistoryDrawerProps) {
  const { t } = useTranslation();
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [fieldFilter, setFieldFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data: auditEntries, isLoading, error } = useQuery({
    queryKey: ['/api/projects', projectId, 'audit'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/audit`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit history');
      }
      return response.json() as Promise<ProjectAuditEntry[]>;
    },
    enabled: open && !!projectId && !isNaN(projectId),
  });

  const filteredEntries = (auditEntries || []).filter((entry) => {
    if (changeTypeFilter && changeTypeFilter !== 'all' && entry.changeType !== changeTypeFilter) return false;
    if (userFilter && userFilter !== 'all' && entry.userName !== userFilter) return false;
    if (fieldFilter && fieldFilter !== 'all' && formatFieldName(entry.fieldName, t) !== fieldFilter) return false;
    
    const entryDate = new Date(entry.changedAt);
    if (startDate) {
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);
      if (entryDate < startOfDay) return false;
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (entryDate > endOfDay) return false;
    }
    
    return true;
  });

  const uniqueUsers = Array.from(new Set((auditEntries || []).map(entry => entry.userName))).sort();
  const uniqueFields = Array.from(new Set((auditEntries || []).map(entry => formatFieldName(entry.fieldName, t)))).sort();

  const clearFilters = () => {
    setChangeTypeFilter('all');
    setUserFilter('all');
    setFieldFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const hasActiveFilters = changeTypeFilter !== 'all' || userFilter !== 'all' || fieldFilter !== 'all' || startDate || endDate;

  const displayTitle = projectName
    ? `${t('projects.auditHistory.title')} - ${projectName}`
    : customerName
      ? `${t('projects.auditHistory.title')} - ${customerName}`
      : t('projects.auditHistory.title');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <History className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <SheetTitle className="text-lg dark:text-white">{displayTitle}</SheetTitle>
              <SheetDescription className="dark:text-gray-400">
                {t('projects.auditHistory.subtitle')}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
              <SelectTrigger className="h-9 text-sm dark:bg-gray-800 dark:border-gray-600">
                <SelectValue placeholder={t('projects.auditHistory.changeType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('projects.auditHistory.allChanges')}</SelectItem>
                <SelectItem value="add">{t('projects.auditHistory.added')}</SelectItem>
                <SelectItem value="update">{t('projects.auditHistory.updated')}</SelectItem>
                <SelectItem value="remove">{t('projects.auditHistory.removed')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 text-sm dark:bg-gray-800 dark:border-gray-600">
                <SelectValue placeholder={t('projects.auditHistory.user')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('projects.auditHistory.allUsers')}</SelectItem>
                {uniqueUsers.map(user => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fieldFilter} onValueChange={setFieldFilter}>
              <SelectTrigger className="h-9 text-sm dark:bg-gray-800 dark:border-gray-600">
                <SelectValue placeholder={t('projects.auditHistory.fieldLabel')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('projects.auditHistory.allFields')}</SelectItem>
                {uniqueFields.map(field => (
                  <SelectItem key={field} value={field}>{field}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 flex-1 justify-start text-left font-normal text-sm dark:bg-gray-800 dark:border-gray-600",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {startDate ? format(startDate, "MM/dd") : t('projects.auditHistory.from')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 flex-1 justify-start text-left font-normal text-sm dark:bg-gray-800 dark:border-gray-600",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {endDate ? format(endDate, "MM/dd") : t('projects.auditHistory.to')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('projects.auditHistory.showingEntries', { shown: filteredEntries.length, total: auditEntries?.length || 0 })}
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                {t('projects.auditHistory.clearFilters')}
              </Button>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500 dark:text-gray-400">{t('projects.auditHistory.loading')}</span>
              </div>
            )}

            {error && (
              <div className="text-center py-12 text-red-600 dark:text-red-400">
                {t('projects.auditHistory.loadFailed')}
              </div>
            )}

            {!isLoading && !error && filteredEntries.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                {hasActiveFilters
                  ? t('projects.auditHistory.noMatchingEntries')
                  : t('projects.auditHistory.noEntries')
                }
              </div>
            )}

            {!isLoading && !error && filteredEntries.map((entry) => (
              <div 
                key={entry.id} 
                className="p-3 rounded-lg border border-l-4 border-l-blue-500 bg-white dark:bg-gray-800 dark:border-gray-700 dark:border-l-blue-500"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs", getChangeTypeColor(entry.changeType))}>
                      {getChangeTypeLabel(entry.changeType, t)}
                    </Badge>
                    <span className="font-medium text-sm dark:text-white">
                      {formatFieldName(entry.fieldName, t)}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {entry.userName}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(entry.changedAt), 'MMM dd, yyyy • h:mm a')}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {entry.changeType === 'update' && (
                    <>
                      <div className="flex items-start gap-2 text-xs">
                        <span className="font-medium text-red-600 dark:text-red-400 min-w-[45px]">{t('projects.auditHistory.from')}:</span>
                        <span className="text-gray-700 dark:text-gray-300 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">
                          {formatValue(entry.oldValue, entry.fieldName, t)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <span className="font-medium text-green-600 dark:text-green-400 min-w-[45px]">{t('projects.auditHistory.to')}:</span>
                        <span className="text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">
                          {formatValue(entry.newValue, entry.fieldName, t)}
                        </span>
                      </div>
                    </>
                  )}
                  {entry.changeType === 'add' && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="font-medium text-green-600 dark:text-green-400 min-w-[45px]">{t('projects.auditHistory.added')}:</span>
                      <span className="text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">
                        {formatValue(entry.newValue, entry.fieldName, t)}
                      </span>
                    </div>
                  )}
                  {entry.changeType === 'remove' && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="font-medium text-red-600 dark:text-red-400 min-w-[45px]">{t('projects.auditHistory.removed')}:</span>
                      <span className="text-gray-700 dark:text-gray-300 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">
                        {formatValue(entry.oldValue, entry.fieldName, t)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
