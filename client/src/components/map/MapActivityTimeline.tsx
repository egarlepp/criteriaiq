import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  GitBranch, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  User, 
  Filter,
  Calendar,
  CalendarRange,
  Activity
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow, format } from 'date-fns';
import { useMapActivityRealtime } from '@/hooks/useMapRealtime';

interface ActivityLog {
  id: number;
  projectId: number;
  userId: string;
  action: string;
  details: string;
  targetType: string;
  targetId: number;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface MapActivityTimelineProps {
  projectId: number;
  className?: string;
  /** Tighter header and an icon-only filter button, for the MAP drawer's Timeline tab. */
  compact?: boolean;
}

const MAP_TARGET_TYPES = [
  'map_project',
  'map_template', 
  'map_phase',
  'map_step',
  'map_task'
];

const getActivityIcon = (targetType: string, action: string) => {
  switch (targetType) {
    case 'map_project':
      return <GitBranch className="h-4 w-4 text-blue-600" />;
    case 'map_template':
      return <Activity className="h-4 w-4 text-purple-600" />;
    case 'map_phase':
      return <Calendar className="h-4 w-4 text-green-600" />;
    case 'map_step':
      return action.includes('completed') ? 
        <CheckCircle className="h-4 w-4 text-green-600" /> : 
        <Clock className="h-4 w-4 text-orange-600" />;
    case 'map_task':
      return action.includes('completed') ? 
        <CheckCircle className="h-4 w-4 text-green-600" /> : 
        action.includes('blocked') || action.includes('cancelled') ?
        <XCircle className="h-4 w-4 text-red-600" /> :
        <AlertCircle className="h-4 w-4 text-yellow-600" />;
    default:
      return <Activity className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
  }
};

const getActivityBadgeColor = (targetType: string) => {
  // Phase 8 followup: canonical Phase/Step/Task color triplet
  // (purple, blue, green) shared with MapAssignmentTracker.
  switch (targetType) {
    case 'map_phase':
      return 'bg-purple-600 dark:bg-purple-700 text-white hover:bg-purple-700 dark:hover:bg-purple-800';
    case 'map_step':
      return 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800';
    case 'map_task':
      return 'bg-green-600 dark:bg-green-700 text-white hover:bg-green-700 dark:hover:bg-green-800';
    case 'map_project':
      return 'bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 dark:hover:bg-indigo-800';
    case 'map_template':
      return 'bg-violet-600 dark:bg-violet-700 text-white hover:bg-violet-700 dark:hover:bg-violet-800';
    default:
      return 'bg-gray-600 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-800';
  }
};

const getTargetTypeLabel = (targetType: string) => {
  switch (targetType) {
    case 'map_project':
      return 'Project MAP';
    case 'map_template':
      return 'Template';
    case 'map_phase':
      return 'Phase';
    case 'map_step':
      return 'Step';
    case 'map_task':
      return 'Task';
    default:
      return 'Unknown';
  }
};

export function MapActivityTimeline({ projectId, className, compact = false }: MapActivityTimelineProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Enable real-time activity updates
  const { isConnected } = useMapActivityRealtime(projectId);

  const { data: activities, isLoading, error } = useQuery<ActivityLog[]>({
    queryKey: ['project-activities', projectId],
    queryFn: async () => {
      // Use server-side filtering for MAP-related activities
      const targetTypesParam = MAP_TARGET_TYPES.map(type => `targetTypes=${encodeURIComponent(type)}`).join('&');
      const response = await apiRequest("GET", `/api/projects/${projectId}/activities?${targetTypesParam}&limit=100`);
      return response;
    },
    enabled: Boolean(projectId), // Only run query when projectId is truthy
  });

  const filteredActivities = activities?.filter(activity => 
    selectedFilter === 'all' || activity.targetType === selectedFilter
  ) || [];

  const filterOptions = [
    { value: 'all', label: 'All MAP Activity', count: activities?.length || 0 },
    { value: 'map_project', label: 'Project MAP', count: activities?.filter(a => a.targetType === 'map_project').length || 0 },
    { value: 'map_phase', label: 'Phases', count: activities?.filter(a => a.targetType === 'map_phase').length || 0 },
    { value: 'map_step', label: 'Steps', count: activities?.filter(a => a.targetType === 'map_step').length || 0 },
    { value: 'map_task', label: 'Tasks', count: activities?.filter(a => a.targetType === 'map_task').length || 0 },
  ].filter(option => option.count > 0);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-blue-600" />
            MAP Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-blue-600" />
            MAP Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Failed to load MAP activity timeline
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-blue-600" />
            MAP Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No MAP activity found for this project
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className={compact ? "px-4 pb-2 pt-4" : undefined}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>MAP Activity Timeline</h3>
            {isConnected && <Badge variant="default" className="text-xs bg-blue-600 dark:bg-blue-700 text-white">🔴 Live</Badge>}
          </div>
          {compact ? (
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className="h-8 w-8"
              aria-label="Filter"
              title="Filter"
              aria-pressed={showFilters}
            >
              <Filter className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="bg-[#2563eb] text-[#fcfcfc] hover:bg-[#1d4ed8]"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          )}
        </div>
        
        {showFilters && (
          <div className={compact ? "mt-2 flex flex-wrap gap-1.5" : "flex flex-wrap gap-2 mt-4"}>
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={selectedFilter === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFilter(option.value)}
                className={selectedFilter === option.value ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
              >
                {option.label} ({option.count})
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className={compact ? "px-4 pb-4" : undefined}>
        <ScrollArea className={compact ? "h-[380px] pr-3" : "h-96"}>
          <div className={compact ? "space-y-3" : "space-y-4"}>
            {filteredActivities.map((activity, index) => (
              <div key={activity.id} className="relative">
                {/* Timeline connector line */}
                {index !== filteredActivities.length - 1 && (
                  <div className="absolute left-4 top-10 w-0.5 h-6 bg-gray-200 dark:bg-gray-700"></div>
                )}
                
                <div className="flex items-start gap-3">
                  {/* Activity icon */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800 border flex items-center justify-center">
                    {getActivityIcon(activity.targetType, activity.action)}
                  </div>
                  
                  {/* Activity content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        className={`text-xs ${getActivityBadgeColor(activity.targetType)}`}
                      >
                        {getTargetTypeLabel(activity.targetType)}
                      </Badge>
                      <span className="text-sm font-medium capitalize">
                        {activity.action}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {activity.details}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>
                          {activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'System User'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span title={format(new Date(activity.createdAt), 'PPpp')}>
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {index !== filteredActivities.length - 1 && (
                  <Separator className={compact ? "mt-3" : "mt-4"} />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}