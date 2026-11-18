export interface DashboardPageDefinition {
  key: string;      // Unique ID for the DB (e.g. 'project_validation')
  label: string;    // Display Name (e.g. 'Project Validation')
  path: string;     // The URL route (e.g. '/project?tab=validation')
  category: string; // Grouping for the dropdown
}

export const APP_PAGE_REGISTRY: DashboardPageDefinition[] = [
  // --- 1. OVERVIEW ---
  { key: 'overview', label: 'Overview Dashboard', path: '/', category: 'Main' },

  // --- 2. ACCOUNT PORTAL ---
  { key: 'account_portal', label: 'Account Portal', path: '/account', category: 'Main' },

  // --- 4. PROJECTS WORKSPACE ---
  { key: 'project_validation', label: 'Validation Projects List', path: '/project?tab=validation&subtab=projects', category: 'Projects' },
  { key: 'project_board', label: 'Kanban Board', path: '/project?tab=validation&subtab=project-board', category: 'Projects' },
  { key: 'project_analytics', label: 'Outcome Intelligence', path: '/project?tab=validation&subtab=outcome-intelligence', category: 'Projects' },
  { key: 'project_detail', label: 'Project Detail View', path: '/project/:id', category: 'Projects' },

  // --- 6. AI ASSESSMENTS ---
  { key: 'ai_risk_projects', label: 'AI Project Analysis', path: '/ai-risk?tab=projects', category: 'AI Assessments' },

  // --- 8. ANALYTICS ---
  { key: 'analytics_main', label: 'Main Reports', path: '/analytics?tab=main', category: 'Analytics' },
  { key: 'analytics_builder', label: 'Report Builder', path: '/analytics?tab=report-builder', category: 'Analytics' },

  // --- 9. CONFIGURATION ---
  { key: 'config_users', label: 'User Management', path: '/admin?tab=users', category: 'Admin' },
  { key: 'config_compliance', label: 'Compliance Settings', path: '/project?tab=compliance', category: 'Admin' },

  // --- 10. SUPPORT ---
  { key: 'support', label: 'Support Dashboard', path: '/support-features', category: 'Support' },

  // --- 11. STANDALONE ---
  { key: 'outcomes_dashboard', label: 'Outcomes Dashboard', path: '/outcomes-dashboard', category: 'Standalone' }
];

// Helper to find a page by key
export const getPageInfo = (key: string) => APP_PAGE_REGISTRY.find(p => p.key === key);