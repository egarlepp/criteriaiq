import { Clock, Target, Eye, CheckCircle2, CheckCircle, Rocket, XCircle } from "lucide-react";

// Support & Features interfaces
export interface SupportRequest {
  id: number;
  type: "issue" | "feature";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "Implemented" | "Completed" | "Rejected" | "Under Review" | "In Progress" | "Not Started" | "Future Roadmap";
  submittedBy?: string;
  submittedByName?: string;
  submittedByEmail?: string;
  submittedAt?: string;
  submittedDate?: string;
  customerId?: number;
  customerName?: string;
  projectId?: number;
  projectName?: string;
  hasAttachment: boolean;
  attachmentFileName?: string;
  assignedToUserId?: number;
  resolvedAt?: string;
  internalNotes?: string;
  applicationPage?: string;
  
  // Issue-specific fields
  browser?: string;
  os?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  frequency?: "Always" | "Often" | "Sometimes" | "Rarely";
  isBlocking?: boolean;
  
  // Feature-specific fields
  problemToSolve?: string;
  proposedBehavior?: string;
  alternativesTried?: string;
  desiredLocation?: string;
  priorityHint?: string;
}

export interface Filters {
  search: string;
  type: string;
  priority: string;
  status: string;
  customer: string;
  assignedTo: string;
}

// Badge styling functions
export const getPriorityBadge = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low':
      return 'bg-green-100 text-green-800 border-green-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const getStatusBadge = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'not started':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'under review':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'in progress':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'implemented':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'future roadmap':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const getStatusIcon = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'not started':
      return Clock;
    case 'in progress':
      return Target;
    case 'under review':
      return Eye;
    case 'implemented':
      return CheckCircle2;
    case 'completed':
      return CheckCircle;
    case 'future roadmap':
      return Rocket;
    case 'rejected':
      return XCircle;
    default:
      return Clock;
  }
};

export const getApplicationPageDisplayName = (page?: string): string => {
  if (!page) return 'Not specified';
  
  const pageMap: Record<string, string> = {
    '/': 'Dashboard',
    '/projects': 'Projects',
    '/customers': 'Customers',
    '/criteria': 'Success Criteria',
    '/reports': 'Reports',
    '/about': 'About & Support',
    '/calendar': 'Calendar',
    '/settings': 'Settings',
    '/profile': 'Profile',
  };
  
  return pageMap[page] || page;
};
