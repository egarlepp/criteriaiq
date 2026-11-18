export interface SidebarProps {
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    timezone?: string;
    role?: string;
    lastLogin?: string | null;
    /** Set for a shared Demo Mode login (shared/demo-login.ts). */
    demoLogin?: string | null;
  };
}

export interface UserProfile {
  sidebarCollapsed?: boolean;
}
