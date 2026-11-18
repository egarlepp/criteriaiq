import {
  LayoutDashboard,
  Plus,
  Users,
  BarChart3,
  CheckCircle,
  Settings,
  Target,
  SquareTerminal,
  Mail,
  Brain,
  BookOpen,
  FolderTree,
  type LucideIcon,
} from "lucide-react";

// The app areas the Support request form offers (not permission keys).
export const navigation: Array<{ name: string; href: string; icon: LucideIcon; section: string }> = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, section: "dashboard" },
  { name: "Account Portal", href: "/account", icon: Users, section: "customer" },
  { name: "Create Project", href: "/create", icon: Plus, section: "create" },
  { name: "Project Management", href: "/project", icon: Target, section: "project" },
  { name: "Template Management", href: "/templates", icon: FolderTree, section: "template_management" },
  { name: "Validation Criteria", href: "/success-criteria", icon: CheckCircle, section: "success-criteria" },
  { name: "AI Assessments", href: "/ai-risk", icon: Brain, section: "ai-risk" },
  { name: "Communications", href: "/admin?tab=email-logs", icon: Mail, section: "communications" },
  { name: "Reports", href: "/reports", icon: BarChart3, section: "analytics" },
  { name: "Configuration", href: "/admin", icon: Settings, section: "config" },
  { name: "Guide", href: "/getting-started", icon: BookOpen, section: "getting_started" },
  { name: "About", href: "/about", icon: SquareTerminal, section: "about" },
];
