export interface DashboardStats {
  active: number;
  completed: number;
  customers: number;
  successRate: number;
}

export interface ProjectFilters {
  status?: string;
  customerName?: string;
  customerStatus?: string;
  search?: string;
  riskLevel?: string;
  ranking?: string;
  solutions?: string[];
  primaryEngineer?: string[];
  specialistEngineer?: string[];
  environment?: string;
  /** Owning team: a team id, or "none" for projects with no team. */
  team?: string;
  fiscalQuarter?: string;
  fiscalStatus?: 'won' | 'lost' | 'created' | 'completed';
}

export interface WebSocketMessage {
  type: 'project_updated' | 'criteria_updated' | 'activity_logged';
  data: any;
  projectId?: number;
}
