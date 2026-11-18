import { useState, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, Calendar, User, History, CalendarIcon, ScanSearch } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Header } from "@/components/layout/header";
import { SearchFiltersSection, FilterLabel, FilterMultiSelectButton } from "@/components/ui/search-filters-section";

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

function formatFieldName(fieldName: string): string {
  const fieldMap: Record<string, string> = {
    'status': 'Status',
    'customerStatus': 'Account Status',
    'risk': 'Risk Level',
    'ranking': 'Priority Ranking',
    'startDate': 'Start Date',
    'endDate': 'End Date',
    'customerAccess': 'Customer Access',
    'additionalAccess': 'Additional Access',
    'successCriteria': 'Success Criteria'
  };
  return fieldMap[fieldName] || fieldName;
}

function formatValue(value: string, fieldName: string): string {
  if (!value) return 'None';
  
  // Format dates
  if (fieldName.includes('Date') && value !== 'None') {
    try {
      return format(new Date(value), 'MMM dd, yyyy');
    } catch (error) {
      return value;
    }
  }
  
  // Format arrays
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
    case 'add': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'remove': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'update': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

function getChangeTypeLabel(changeType: string): string {
  switch (changeType) {
    case 'add': return 'Added';
    case 'remove': return 'Removed';
    case 'update': return 'Updated';
    default: return 'Changed';
  }
}

export default function ProjectAudit({ params }: { params?: { id: string } }) {
  const urlParams = useParams();
  const [, navigate] = useLocation();
  const id = params?.id || urlParams.id;
  const projectId = parseInt(id as string);
  
  console.log('ProjectAudit - params:', params);
  console.log('ProjectAudit - urlParams:', urlParams);
  console.log('ProjectAudit - id:', id);
  console.log('ProjectAudit - projectId:', projectId);

  // Filter states
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [fieldFilter, setFieldFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (changeTypeFilter !== 'all') count++;
    if (userFilter !== 'all') count++;
    if (fieldFilter !== 'all') count++;
    if (startDate) count++;
    if (endDate) count++;
    return count;
  }, [changeTypeFilter, userFilter, fieldFilter, startDate, endDate]);

  const clearAllFilters = () => {
    setChangeTypeFilter('all');
    setUserFilter('all');
    setFieldFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
  };


  // Get project details for header
  const { data: project } = useQuery({
    queryKey: ['/api/projects', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      return response.json();
    },
    enabled: !!projectId && !isNaN(projectId),
  });

  const { data: auditEntries, isLoading, error } = useQuery({
    queryKey: ['/api/projects', projectId, 'audit'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/audit`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit history');
      }
      return response.json() as Promise<ProjectAuditEntry[]>;
    },
    enabled: !!projectId && !isNaN(projectId),
  });

  const { data: auditCount } = useQuery({
    queryKey: ['/api/projects', projectId, 'audit', 'count'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/audit/count`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit count');
      }
      return response.json() as Promise<{ count: number }>;
    },
    enabled: !!projectId && !isNaN(projectId),
  });

  const headerTitle = project ? `Audit of Project ID #${project.id} - ${project.customerName}` : 'Project Audit';

  // Filter the audit entries based on filter criteria
  const filteredEntries = (auditEntries || []).filter((entry) => {
    // Change type filter
    if (changeTypeFilter && changeTypeFilter !== 'all' && entry.changeType !== changeTypeFilter) return false;
    
    // User filter
    if (userFilter && userFilter !== 'all' && !entry.userName.toLowerCase().includes(userFilter.toLowerCase()) && !entry.userEmail.toLowerCase().includes(userFilter.toLowerCase())) return false;
    
    // Field filter
    if (fieldFilter && fieldFilter !== 'all' && !formatFieldName(entry.fieldName).toLowerCase().includes(fieldFilter.toLowerCase())) return false;
    
    // Date filters - use date-only comparison to include same-day entries
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

  // Get unique users and fields for filter dropdowns
  const uniqueUsers = Array.from(new Set((auditEntries || []).map(entry => entry.userName))).sort();
  const uniqueFields = Array.from(new Set((auditEntries || []).map(entry => formatFieldName(entry.fieldName)))).sort();


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={headerTitle} subtitle="" />
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Button 
              variant="default" 
              size="sm"
              onClick={() => navigate('/project')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
          </div>
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading audit history...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={headerTitle} subtitle="" />
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Button 
              variant="default" 
              size="sm"
              onClick={() => navigate('/project')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
          </div>
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-red-600 dark:text-red-400">
                Failed to load audit history. Please try again.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Handle empty audit history
  if (!auditEntries || auditEntries.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={headerTitle} subtitle="" />
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Button 
              variant="default" 
              size="sm"
              onClick={() => navigate('/project')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
          </div>
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-gray-600 dark:text-gray-400">
                Currently There Is No Audit History To Report On
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center mb-6">
          <Button 
            variant="default" 
            size="sm"
            onClick={() => navigate('/project')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>
        </div>

      {/* Search and Filters Section */}
      <SearchFiltersSection 
        activeFilterCount={activeFilterCount} 
        onClearFilters={clearAllFilters}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <FilterLabel htmlFor="change-type">Type of Change</FilterLabel>
              <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All changes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All changes</SelectItem>
                  <SelectItem value="add">Added</SelectItem>
                  <SelectItem value="update">Updated</SelectItem>
                  <SelectItem value="remove">Removed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <FilterLabel htmlFor="user-filter">User Making Change</FilterLabel>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FilterLabel htmlFor="field-filter">Field Changed</FilterLabel>
              <Select value={fieldFilter} onValueChange={setFieldFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All fields" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fields</SelectItem>
                  {uniqueFields.map(field => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FilterLabel>Clear Filters</FilterLabel>
              <Button variant="outline" onClick={clearAllFilters} className="w-full">
                Clear All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FilterLabel>Start Date:</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterMultiSelectButton
                    className={cn(
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MM/dd/yyyy") : "Select date"}
                  </FilterMultiSelectButton>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <FilterLabel>End Date:</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterMultiSelectButton
                    className={cn(
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MM/dd/yyyy") : "Select date"}
                  </FilterMultiSelectButton>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
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
        </div>
      </SearchFiltersSection>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredEntries.length} of {auditEntries?.length || 0} audit entries
          </p>
        </div>
        <div className="space-y-3">
          {filteredEntries.map((entry, index) => (
            <Card key={entry.id} className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className={getChangeTypeColor(entry.changeType)}>
                      {getChangeTypeLabel(entry.changeType)}
                    </Badge>
                    <div>
                      <CardTitle className="text-base font-medium">
                        {formatFieldName(entry.fieldName)}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <User className="h-3 w-3" />
                        {entry.userName} ({entry.userEmail})
                        <Calendar className="h-3 w-3 ml-2" />
                        {format(new Date(entry.changedAt), 'MMM dd, yyyy • h:mm a')}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {entry.changeType === 'update' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-red-600 dark:text-red-400 min-w-[60px]">From:</span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded border dark:border-red-800">
                          {formatValue(entry.oldValue, entry.fieldName)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-green-600 dark:text-green-400 min-w-[60px]">To:</span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded border dark:border-green-800">
                          {formatValue(entry.newValue, entry.fieldName)}
                        </span>
                      </div>
                    </>
                  )}
                  {entry.changeType === 'add' && (
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-green-600 dark:text-green-400 min-w-[60px]">Added:</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded border dark:border-green-800">
                        {formatValue(entry.newValue, entry.fieldName)}
                      </span>
                    </div>
                  )}
                  {entry.changeType === 'remove' && (
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-red-600 dark:text-red-400 min-w-[60px]">Removed:</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded border dark:border-red-800">
                        {formatValue(entry.oldValue, entry.fieldName)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
              {index < filteredEntries.length - 1 && <Separator className="my-0" />}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}