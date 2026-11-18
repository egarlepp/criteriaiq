export interface SidebarProps {
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    timezone?: string;
    role?: string;
    lastLogin?: string | null;
  };
}

export interface UserProfile {
  sidebarCollapsed?: boolean;
}
