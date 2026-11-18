// Shared MAP types and constants for CriteriaIQ
import type { MapCriterion } from "@/components/value-journey/use-value-journey";

export interface MapTemplate {
  id: number;
  name: string;
  description: string | null;
  category: string;
  scope: string;
  visibility: string;
  solutionIds: number[] | null;
  customerId: number | null;
  icon: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
  createdByUser?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface MapTemplateWithDetails extends MapTemplate {
  phases: Array<{
    id: number;
    name: string;
    description: string | null;
    orderIndex: number;
    steps: Array<{
      id: number;
      name: string;
      description: string | null;
      orderIndex: number;
      defaultStatus: string;
    }>;
  }>;
}

export interface MapPhase {
  id: number;
  name: string;
  description: string | null;
  status: MapStatus;
  orderIndex: number;
  teamOwned: string | null;
  assignedToCustomerUserId: string | null;
  assignedToUserId: string | null;
  /** "Our team" (Teams): responsibility only, never access. */
  assignedToTeamId: number | null;
  additionalInternalUserId: string | null;
  sendExternalEmails: boolean;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  /** The value journey stage this phase belongs to (journey_stages). */
  stageId?: number | null;
  projectId: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface MapStep {
  id: number;
  name: string;
  description: string | null;
  status: MapStatus;
  orderIndex: number;
  teamOwned: string | null;
  assignedToCustomerUserId: string | null;
  assignedToUserId: string | null;
  /** "Our team" (Teams): responsibility only, never access. */
  assignedToTeamId: number | null;
  additionalInternalUserId: string | null;
  sendExternalEmails: boolean;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  projectId: number;
  phaseId: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface MapTask {
  id: number;
  name: string;
  description: string | null;
  status: MapStatus;
  orderIndex: number;
  teamOwned: string | null;
  assignedToCustomerUserId: string | null;
  assignedToUserId: string | null;
  /** "Our team" (Teams): responsibility only, never access. */
  assignedToTeamId: number | null;
  additionalInternalUserId: string | null;
  sendExternalEmails: boolean;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  projectId: number;
  stepId: number;
  phaseId: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface ProjectMapData {
  phases: MapPhase[];
  steps: MapStep[];
  tasks: MapTask[];
  /** The project's success criteria, for the drawer's journey chips (value-journey/map-journey.tsx). */
  criteria?: MapCriterion[];
  /** Which tasks prove which criteria. */
  taskCriteria?: Array<{ taskId: number; criterionId: number }>;
  metadata?: {
    mapName: string;
    templateName: string | null;
    /** Roles this plan shows; null means every role (shared/map-assignment-roles.ts). */
    assignmentRoles?: string[] | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

// Status and priority enums
export type MapStatus = "not_started" | "in_progress" | "blocked" | "complete" | "deferred" | "stalled" | "at_risk" | "cancelled";
export type MapPriority = "low" | "medium" | "high" | "critical";

// Status configuration for consistent UI display
export interface StatusConfig {
  label: string;
  color: string;
  textColor: string;
  icon: any; // Lucide icon component
}

// Centralized status configuration
export const MAP_STATUS_CONFIG: Record<MapStatus, StatusConfig> = {
  not_started: { 
    label: "Not Started", 
    color: "bg-gray-500", 
    textColor: "text-gray-600",
    icon: null // Will be imported by components
  },
  in_progress: { 
    label: "In Progress", 
    color: "bg-blue-500", 
    textColor: "text-blue-600",
    icon: null // Will be imported by components
  },
  blocked: { 
    label: "Blocked", 
    color: "bg-red-500", 
    textColor: "text-red-600",
    icon: null // Will be imported by components
  },
  complete: { 
    label: "Complete", 
    color: "bg-green-500", 
    textColor: "text-green-600",
    icon: null // Will be imported by components
  },
  deferred: { 
    label: "Deferred", 
    color: "bg-yellow-500", 
    textColor: "text-yellow-600",
    icon: null // Will be imported by components
  },
  stalled: { 
    label: "Stalled", 
    color: "bg-orange-500", 
    textColor: "text-orange-600",
    icon: null // Will be imported by components
  },
  at_risk: { 
    label: "At Risk", 
    color: "bg-purple-500", 
    textColor: "text-purple-600",
    icon: null // Will be imported by components
  },
  cancelled: { 
    label: "Cancelled", 
    color: "bg-gray-600", 
    textColor: "text-gray-600",
    icon: null // Will be imported by components
  }
} as const;

// Priority configuration
export const MAP_PRIORITY_CONFIG = {
  low: { label: "Low", color: "bg-gray-100", textColor: "text-gray-700" },
  medium: { label: "Medium", color: "bg-yellow-100", textColor: "text-yellow-800" },
  high: { label: "High", color: "bg-orange-100", textColor: "text-orange-800" },
  critical: { label: "Critical", color: "bg-red-100", textColor: "text-red-800" }
} as const;

// Utility functions
export const getMapStatusIcon = (status: MapStatus) => {
  // Import icons in components that use this
  const iconMap = {
    not_started: 'Clock',
    in_progress: 'Target', 
    blocked: 'AlertTriangle',
    complete: 'CheckCircle',
    deferred: 'CircleArrowUp',
    stalled: 'AlertTriangle',
    at_risk: 'AlertTriangle',
    cancelled: 'CircleX'
  };
  return iconMap[status];
};

export const calculateMapProgress = (phases: MapPhase[]) => {
  if (phases.length === 0) return 0;
  const completedPhases = phases.filter(phase => phase.status === "complete").length;
  return Math.round((completedPhases / phases.length) * 100);
};

export const getMapPhaseWithSteps = (phases: MapPhase[], steps: MapStep[]) => {
  return phases.map(phase => ({
    ...phase,
    steps: steps.filter(step => step.phaseId === phase.id).sort((a, b) => a.orderIndex - b.orderIndex)
  }));
};

// Enhanced MAP Analytics Interface
export interface MapAnalytics {
  projectId: number;
  overallProgress: number; // Weighted progress percentage
  basicProgress: number; // Simple phase-based progress percentage
  
  // Detailed completion statistics
  completion: {
    phases: { completed: number; total: number };
    steps: { completed: number; total: number };
    tasks: { completed: number; total: number };
  };
  
  // Status distributions for each level
  statusDistribution: {
    phases: Record<string, number>;
    steps: Record<string, number>;
    tasks: Record<string, number>;
  };
  
  // Timeline and deadline analytics
  timeline: {
    overdueTasks: number;
    upcomingDeadlines: number;
    atRiskItems: number;
  };
  
  // Assignment and workload analytics
  assignments: {
    assignedTasks: number;
    unassignedTasks: number;
    assignmentRate: number; // Percentage of tasks assigned
  };
  
  // Performance metrics
  performance: {
    totalItems: number;
    completedItems: number;
    blockedItems: number;
    recentCompletions: number; // Completed in last 7 days
    completionRate: number; // Overall completion percentage
    blockedRate: number; // Percentage of blocked items
  };
  
  // Risk indicators
  riskIndicators: {
    hasOverdueTasks: boolean;
    hasBlockedItems: boolean;
    lowAssignmentRate: boolean;
    manyUpcomingDeadlines: boolean;
  };
  
  lastUpdated: string;
}

// Assignment tracking analytics types
export interface UserWorkload {
  /** A person, or an "Our team" row (isTeam; firstName holds the team name, no email or role). */
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string | null;
    isTeam?: boolean;
  };
  totalAssignments: number;
  phases: number;
  steps: number;
  tasks: number;
  completedItems: number;
  pendingItems: number;
  overdueItems: number;
  upcomingDeadlines: number;
  assignments: AssignmentWithEntity[];
}

export interface AssignmentWithEntity {
  id: number;
  entityType: 'map_phase' | 'map_step' | 'map_task';
  entityId: number;
  userId: string;
  isOwner: boolean;
  assignedAt: string;
  entityName: string;
  entityStatus: string;
  entityDueDate: string | null;
  entityDescription: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
  };
}

export interface WorkloadBalance {
  userId: string;
  name: string;
  assignments: number;
  overloadRatio?: number;
  underloadRatio?: number;
}

export interface EntityDistribution {
  total: number;
  assigned: number;
  unassigned: number;
}

export interface AssignmentAnalytics {
  projectId: number;
  userWorkloads: UserWorkload[];
  distributionMetrics: {
    totalUsers: number;
    totalAssignments: number;
    averageWorkload: number;
    maxWorkload: number;
    minWorkload: number;
    workloadSpread: number;
    balanceScore: number; // 0-100, higher is better balanced
  };
  workloadBalance: {
    isBalanced: boolean;
    overloadedUsers: WorkloadBalance[];
    underloadedUsers: WorkloadBalance[];
  };
  entityDistribution: {
    phases: EntityDistribution;
    steps: EntityDistribution;
    tasks: EntityDistribution;
  };
  assignmentTimeline: {
    recentAssignments: number;
    totalOverdueItems: number;
    totalUpcomingDeadlines: number;
    completionRate: number;
  };
  lastUpdated: string;
}

// Enhanced progress calculation function
export const calculateEnhancedMapProgress = (phases: MapPhase[], steps: MapStep[], tasks: MapTask[]): MapAnalytics => {
  // Calculate enhanced progress with weighted completion
  const phaseWeight = 0.4; // 40% weight
  const stepWeight = 0.35; // 35% weight
  const taskWeight = 0.25; // 25% weight
  
  const phaseProgress = phases.length > 0 ? 
    phases.filter(p => p.status === "complete").length / phases.length : 0;
  const stepProgress = steps.length > 0 ? 
    steps.filter(s => s.status === "complete").length / steps.length : 0;
  const taskProgress = tasks.length > 0 ? 
    tasks.filter(t => t.status === "complete").length / tasks.length : 0;
  
  const weightedProgress = Math.round(
    (phaseProgress * phaseWeight + stepProgress * stepWeight + taskProgress * taskWeight) * 100
  );
  
  // Calculate timeline analytics
  const now = new Date();
  const overdueTasks = tasks.filter(task => 
    task.dueDate && new Date(task.dueDate) < now && task.status !== "complete"
  );
  const upcomingTasks = tasks.filter(task => 
    task.dueDate && new Date(task.dueDate) > now && 
    new Date(task.dueDate) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // Within 7 days
  );
  
  // Calculate status distributions
  const calculateStatusDistribution = (items: Array<{ status: string }>): Record<string, number> => {
    const distribution: Record<string, number> = {};
    items.forEach(item => {
      distribution[item.status] = (distribution[item.status] || 0) + 1;
    });
    return distribution;
  };
  
  const phaseStatusDist = calculateStatusDistribution(phases);
  const stepStatusDist = calculateStatusDistribution(steps);
  const taskStatusDist = calculateStatusDistribution(tasks);
  
  // Calculate assignment analytics
  const assignedTasks = tasks.filter(t => t.assignedToUserId);
  const unassignedTasks = tasks.filter(t => !t.assignedToUserId);
  
  // Calculate performance metrics
  const completedItems = [...phases, ...steps, ...tasks].filter(item => item.status === "complete");
  const blockedItems = [...phases, ...steps, ...tasks].filter(item => item.status === "blocked");
  
  // Calculate velocity (items completed recently)
  const recentCompletion = completedItems.filter(item => {
    if (!item.completedDate) return false;
    const completedDate = new Date(item.completedDate);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return completedDate >= weekAgo;
  });
  
  return {
    projectId: phases[0]?.projectId || steps[0]?.projectId || tasks[0]?.projectId || 0,
    overallProgress: weightedProgress,
    basicProgress: Math.round((phases.filter(p => p.status === "complete").length / Math.max(phases.length, 1)) * 100),
    
    // Completion statistics
    completion: {
      phases: { completed: phases.filter(p => p.status === "complete").length, total: phases.length },
      steps: { completed: steps.filter(s => s.status === "complete").length, total: steps.length },
      tasks: { completed: tasks.filter(t => t.status === "complete").length, total: tasks.length }
    },
    
    // Status distributions
    statusDistribution: {
      phases: phaseStatusDist,
      steps: stepStatusDist,
      tasks: taskStatusDist
    },
    
    // Timeline analytics
    timeline: {
      overdueTasks: overdueTasks.length,
      upcomingDeadlines: upcomingTasks.length,
      atRiskItems: [...phases, ...steps, ...tasks].filter(item => 
        item.status === "blocked" || 
        (item.dueDate && new Date(item.dueDate) < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) && item.status !== "complete")
      ).length
    },
    
    // Assignment analytics
    assignments: {
      assignedTasks: assignedTasks.length,
      unassignedTasks: unassignedTasks.length,
      assignmentRate: Math.round((assignedTasks.length / Math.max(tasks.length, 1)) * 100)
    },
    
    // Performance metrics
    performance: {
      totalItems: phases.length + steps.length + tasks.length,
      completedItems: completedItems.length,
      blockedItems: blockedItems.length,
      recentCompletions: recentCompletion.length,
      completionRate: Math.round((completedItems.length / Math.max(phases.length + steps.length + tasks.length, 1)) * 100),
      blockedRate: Math.round((blockedItems.length / Math.max(phases.length + steps.length + tasks.length, 1)) * 100)
    },
    
    // Risk indicators  
    riskIndicators: {
      hasOverdueTasks: overdueTasks.length > 0,
      hasBlockedItems: blockedItems.length > 0,
      lowAssignmentRate: tasks.length > 0 && (assignedTasks.length / tasks.length) < 0.5,
      manyUpcomingDeadlines: upcomingTasks.length > 5
    },
    
    lastUpdated: new Date().toISOString()
  };
};