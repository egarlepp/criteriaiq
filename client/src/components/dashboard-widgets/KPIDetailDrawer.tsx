"use client";
import React, { useMemo } from "react";
import type { PocWithRelations, Customer, StatusConfig } from "@shared/schema";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Target,
  Users,
  Building2,
  AlertTriangle,
  Clock,
  CheckCircle,
  Calendar,
  TrendingUp,
  Layers,
  ListChecks,
  CheckSquare,
  BarChart3,
  ExternalLink,
  DollarSign,
  Trophy,
  Briefcase,
  Edit,
  Eye,
  Bolt,
  Bug,
  Lightbulb,
  HelpCircle,
  FileText,
  Waypoints,
} from "lucide-react";
import { format, isAfter, isBefore, startOfWeek, endOfWeek, addDays } from "date-fns";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { isActiveProject, isWonStatus, isLostStatus, isTCCStatus, INACTIVE_STATUSES } from "@/lib/project-status";
import { DynamicIcon } from "@/components/ui/dynamic-icon";

export interface KPIDrawerConfig {
  isOpen: boolean;
  clickType: string;
  clickValue: string;
  title: string;
  description: string;
}

interface KPIDetailDrawerProps {
  config: KPIDrawerConfig;
  onClose: () => void;
  projects: PocWithRelations[];
  customers?: Customer[];
  statusConfigs?: StatusConfig[];
  onAccountEdit?: (customer: Customer) => void;
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

const parseACV = (p: any) => {
  const val = p.opportunityAcvValue;
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[$,]/g, '');
  return parseFloat(cleaned) || 0;
};


const getRiskBadgeColor = (risk: string) => {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return colors[risk?.toLowerCase()] || colors.low;
};

const getDrawerIcon = (clickType: string, clickValue: string) => {
  if (clickType === "account") return Building2;
  if (clickType === "customer") return Building2;
  if (clickType === "risk") return AlertTriangle;
  if (clickType === "date") return Calendar;
  if (clickType === "tcc") return CheckCircle;
  if (clickType === "pipeline") return Briefcase;
  if (clickType === "success_rate") return Trophy;
  if (clickType === "acv") return DollarSign;
  if (clickType === "support_status") return Bolt;
  if (clickType === "support_type") return FileText;
  if (clickType === "map") {
    switch (clickValue) {
      case "phases": return Layers;
      case "steps": return ListChecks;
      case "tasks": return CheckSquare;
      case "progress":
      case "completion": return BarChart3;
      case "ontrack": return Clock;
      case "overdue": return AlertTriangle;
      default: return Target;
    }
  }
  return Target;
};

const isSupportDrawer = (clickType: string) => {
  return clickType === "support_status" || clickType === "support_type";
};

const getSupportStatusBadgeColor = (status: string) => {
  const colors: Record<string, string> = {
    "not started": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    "in progress": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "under review": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    "implemented": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    "completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    "rejected": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    "future roadmap": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    "open": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "escalated": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    "resolved": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    "closed": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };
  return colors[status?.toLowerCase()] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
};

const getSupportPriorityBadgeColor = (priority: string) => {
  const colors: Record<string, string> = {
    "critical": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    "high": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    "medium": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    "low": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return colors[priority?.toLowerCase()] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
};

const getSupportTypeIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "issue": return Bug;
    case "feature": return Lightbulb;
    case "question": return HelpCircle;
    default: return FileText;
  }
};

const showACVColumn = (clickType: string) => {
  return clickType === "pipeline" || clickType === "acv";
};

export function KPIDetailDrawer({ config, onClose, projects, customers = [], statusConfigs = [], onAccountEdit }: KPIDetailDrawerProps) {
  const [, navigate] = useLocation();
  const Icon = getDrawerIcon(config.clickType, config.clickValue);
  const hasACVColumn = showACVColumn(config.clickType);
  const isSupport = isSupportDrawer(config.clickType);

  const { data: industries = [] } = useQuery<any[]>({
    queryKey: ["/api/industries"],
  });

  const isMapDrawer = config.clickType === "map";
  const { data: mapDashboardProjects = [], isLoading: mapProjectsLoading } = useQuery<any[]>({
    queryKey: ["/api/map/dashboard-projects"],
    enabled: isMapDrawer && config.isOpen,
    staleTime: 30000,
  });

  const supportQueryParams = useMemo(() => {
    if (!isSupport) return null;
    const params = new URLSearchParams();
    if (config.clickType === "support_status" && config.clickValue) {
      params.set("status", config.clickValue);
    } else if (config.clickType === "support_type" && config.clickValue) {
      params.set("type", config.clickValue);
    }
    return params.toString();
  }, [isSupport, config.clickType, config.clickValue]);

  const { data: supportRequests = [], isLoading: supportLoading } = useQuery<any[]>({
    queryKey: ["/api/support-requests", supportQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/support-requests?${supportQueryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch support requests");
      return res.json();
    },
    enabled: isSupport && config.isOpen,
  });

  const getStatusConfig = (statusName: string) => {
    return statusConfigs.find(
      (c: any) => c.name?.toLowerCase() === statusName?.toLowerCase()
    );
  };

  const getIndustryName = (industryId: number | undefined) => {
    if (!industryId) return "—";
    const industry = industries.find((i: any) => i.id === industryId);
    return industry?.name || "—";
  };

  const getProjectCountForCustomer = (customer: any) => {
    const accountName = customer.accountName || customer.name;
    if (!accountName) return 0;
    return projects.filter((p: any) => p.customerName === accountName).length;
  };

  const filteredData = useMemo(() => {
    if (isSupport) {
      return { type: "support", data: supportRequests };
    }

    if (config.clickType === "account" || config.clickType === "customer") {
      return { type: "accounts", data: customers };
    }

    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);
    const soonThreshold = addDays(now, 14);

    let filtered: any[] = [];

    switch (config.clickType) {
      case "tcc":
        filtered = projects.filter(p => isTCCStatus(p.status));
        break;

      case "pipeline":
        filtered = projects.filter(isActiveProject);
        break;

      case "success_rate":
        filtered = projects.filter(p => isWonStatus(p.status) || isLostStatus(p.status));
        break;

      case "acv":
        if (config.clickValue === "won") {
          filtered = projects.filter(p => isWonStatus(p.status));
        } else if (config.clickValue === "lost") {
          filtered = projects.filter(p => isLostStatus(p.status));
        }
        break;

      case "status":
        if (config.clickValue === "active") {
          filtered = projects.filter(isActiveProject);
        } else if (config.clickValue === "completed") {
          filtered = projects.filter(p => 
            INACTIVE_STATUSES.includes(p.status?.toLowerCase() as any)
          );
        } else if (config.clickValue === "closed_won") {
          filtered = projects.filter(p => isWonStatus(p.status));
        } else if (config.clickValue === "closed_lost") {
          filtered = projects.filter(p => isLostStatus(p.status));
        } else {
          const normalizedValue = config.clickValue?.toLowerCase().replace(/_/g, " ");
          filtered = projects.filter(p => 
            p.status?.toLowerCase() === normalizedValue
          );
        }
        break;

      case "date":
        if (config.clickValue === "soon") {
          filtered = projects.filter(p => {
            if (!p.endDate) return false;
            const endDate = new Date(p.endDate);
            return isActiveProject(p) && isAfter(endDate, now) && isBefore(endDate, soonThreshold);
          });
        } else if (config.clickValue === "new") {
          filtered = projects.filter(p => {
            if (!p.startDate) return false;
            const startDate = new Date(p.startDate);
            return isAfter(startDate, weekStart) && isBefore(startDate, weekEnd);
          });
        }
        break;

      case "risk":
        filtered = projects.filter(p => 
          isActiveProject(p) && p.risk?.toLowerCase() === config.clickValue?.toLowerCase()
        );
        break;

      case "map":
        switch (config.clickValue) {
          case "progress":
          case "phases":
          case "steps":
          case "tasks":
          case "completion":
            filtered = mapDashboardProjects;
            break;
          case "ontrack":
            filtered = mapDashboardProjects.filter(p => {
              if (!p.endDate) return true;
              return new Date(p.endDate) >= now;
            });
            break;
          case "overdue":
            filtered = mapDashboardProjects.filter(p => {
              if (!p.endDate) return false;
              return new Date(p.endDate) < now;
            });
            break;
          default:
            filtered = mapDashboardProjects;
        }
        break;

      default:
        filtered = projects;
    }

    return { type: "projects", data: filtered };
  }, [config, projects, customers, isSupport, supportRequests, mapDashboardProjects]);

  const acvTotal = useMemo(() => {
    if (!hasACVColumn || filteredData.type !== "projects") return 0;
    return filteredData.data.reduce((sum: number, p: any) => sum + parseACV(p), 0);
  }, [filteredData, hasACVColumn]);

  const handleViewProject = (projectId: number) => {
    navigate(`/project/${projectId}?source=dashboard`);
    onClose();
  };

  const handleViewMAP = (projectId: number) => {
    navigate(`/project/${projectId}?tab=map`);
    onClose();
  };

  const handleViewAccount = (customerId: number) => {
    navigate(`/customers?selected=${customerId}`);
    onClose();
  };

  const getDateColumnHeader = () => {
    if (config.clickValue === "soon" || config.clickValue === "overdue") return "End Date";
    if (config.clickValue === "new") return "Start Date";
    return "Date";
  };

  const getColumnCount = () => {
    let count = 5;
    if (config.clickType === "risk") count++;
    if (isMapDrawer) count++;
    if (hasACVColumn) count++;
    return count;
  };

  return (
    <Sheet open={config.isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 border-b dark:border-gray-700">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Icon className="h-5 w-5 text-blue-600" />
            {config.title}
          </SheetTitle>
          <SheetDescription className="text-sm">
            {config.description}
          </SheetDescription>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="text-xs bg-black text-white dark:bg-white dark:text-black border-none">
              {(supportLoading && isSupport) || (mapProjectsLoading && isMapDrawer) ? "Loading..." : filteredData.data.length} {filteredData.type === "accounts" ? "accounts" : filteredData.type === "support" ? "requests" : "projects"}
            </Badge>
            {hasACVColumn && filteredData.type === "projects" && (() => {
              const acvBadgeColor = config.clickType === "acv" && config.clickValue === "lost"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : config.clickType === "acv" && config.clickValue === "won"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
              return (
                <Badge className={`text-xs border-none ${acvBadgeColor}`}>
                  Total ACV: {formatCurrency(acvTotal)}
                </Badge>
              );
            })()}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4">
          {filteredData.type === "support" ? (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Title</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Type</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Status</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Priority</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Submitted By</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-6">
                      Loading support requests...
                    </TableCell>
                  </TableRow>
                ) : filteredData.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-6">
                      No support requests found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.data.map((req: any) => {
                    const TypeIcon = getSupportTypeIcon(req.type);
                    return (
                      <TableRow key={req.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <TableCell className="font-medium dark:text-gray-200 py-1.5 px-2">
                          <div className="truncate max-w-[160px]" title={req.title}>
                            {req.title || "Untitled"}
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <Badge variant="outline" className="text-[10px] inline-flex items-center gap-1 dark:border-gray-600 px-1.5 py-0">
                            <TypeIcon className="h-2.5 w-2.5" />
                            {req.type === "issue" ? "Issue" : req.type === "feature" ? "Feature" : req.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <Badge className={`text-[10px] px-1.5 py-0 ${getSupportStatusBadgeColor(req.status)}`}>
                            {req.status || "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <Badge className={`text-[10px] px-1.5 py-0 ${getSupportPriorityBadgeColor(req.priority)}`}>
                            {req.priority ? req.priority.charAt(0).toUpperCase() + req.priority.slice(1) : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="dark:text-gray-300 py-1.5 px-2">
                          {req.submittedByName || "—"}
                        </TableCell>
                        <TableCell className="dark:text-gray-300 py-1.5 px-2">
                          {req.submittedDate ? format(new Date(req.submittedDate), "MMM d, yyyy") : req.createdAt ? format(new Date(req.createdAt), "MMM d, yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : filteredData.type === "accounts" ? (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Account</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Industry</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Projects</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400 py-6">
                      No accounts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.data.map((customer: any) => (
                    <TableRow key={customer.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <TableCell className="font-medium dark:text-gray-200 py-1.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[140px]" title={customer.accountName || customer.name || "—"}>
                            {customer.accountName || customer.name || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300 py-1.5 px-2">
                        {getIndustryName(customer.industryId)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300 py-1.5 px-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {getProjectCountForCustomer(customer)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right py-1.5 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (onAccountEdit) {
                              onAccountEdit(customer);
                              onClose();
                            }
                          }}
                          className="h-6 px-2 text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Project</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Account</TableHead>
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">Status</TableHead>
                  {config.clickType === "risk" && (
                    <TableHead className="dark:text-gray-300 py-1.5 text-xs">Risk</TableHead>
                  )}
                  {hasACVColumn && (
                    <TableHead className="dark:text-gray-300 py-1.5 text-xs">ACV</TableHead>
                  )}
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs">
                    {getDateColumnHeader()}
                  </TableHead>
                  {isMapDrawer && (
                    <TableHead className="dark:text-gray-300 py-1.5 text-xs">MAP Stats</TableHead>
                  )}
                  <TableHead className="dark:text-gray-300 py-1.5 text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={getColumnCount()} className="text-center text-gray-500 dark:text-gray-400 py-6">
                      No projects found matching this criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.data.map((project: any) => (
                    <TableRow key={project.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <TableCell className="font-medium dark:text-gray-200 py-1.5 px-2">
                        <div className="truncate max-w-[140px]" title={project.name}>
                          {project.name || "Untitled Project"}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300 py-1.5 px-2">
                        <div className="truncate max-w-[110px]" title={project.customerName || project.customer?.name || "—"}>
                          {project.customerName || project.customer?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        <div className="space-y-1">
                          {(() => {
                            const sc = getStatusConfig(project.status);
                            return (
                              <Badge
                                variant="secondary"
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0 text-[10px] text-white"
                                style={{
                                  backgroundColor: sc?.color || "#6b7280",
                                }}
                              >
                                {sc?.icon && (
                                  <DynamicIcon
                                    name={sc.icon}
                                    className="h-2.5 w-2.5"
                                  />
                                )}
                                <span>{sc?.name || project.status || "Unknown"}</span>
                              </Badge>
                            );
                          })()}
                          {isMapDrawer && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 rounded-full" 
                                  style={{ width: `${project.progress || 0}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 dark:text-gray-400">{project.progress || 0}%</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      {config.clickType === "risk" && (
                        <TableCell className="py-1.5 px-2">
                          <Badge className={`text-[10px] ${getRiskBadgeColor(project.risk)}`}>
                            {project.risk || "Low"}
                          </Badge>
                        </TableCell>
                      )}
                      {hasACVColumn && (
                        <TableCell className="dark:text-gray-300 font-medium py-1.5 px-2">
                          {formatCurrency(parseACV(project))}
                        </TableCell>
                      )}
                      <TableCell className="dark:text-gray-300 py-1.5 px-2">
                        {config.clickValue === "soon" || config.clickValue === "overdue" 
                          ? (project.endDate ? format(new Date(project.endDate), "MMM d, yyyy") : "—")
                          : (project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "—")
                        }
                      </TableCell>
                      {isMapDrawer && (
                        <TableCell className="dark:text-gray-300 py-1.5 px-2">
                          {project.mapStats ? (
                            <div className="text-[10px] space-y-0">
                              <div className="flex items-center gap-1">
                                <Layers className="h-2.5 w-2.5 text-purple-500 shrink-0" />
                                <span>{project.mapStats.phases.completed}/{project.mapStats.phases.total} phases</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <ListChecks className="h-2.5 w-2.5 text-cyan-500 shrink-0" />
                                <span>{project.mapStats.steps.completed}/{project.mapStats.steps.total} steps</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <CheckSquare className="h-2.5 w-2.5 text-green-500 shrink-0" />
                                <span>{project.mapStats.tasks.completed}/{project.mapStats.tasks.total} tasks</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right py-1.5 px-2">
                        {isMapDrawer ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewMAP(project.id)}
                            className="h-7 w-7 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30"
                            title="Open MAP"
                          >
                            <Waypoints className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewProject(project.id)}
                            className="h-6 px-2 text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export function getDrawerConfig(clickType: string, clickValue: string): Omit<KPIDrawerConfig, "isOpen"> {
  const configs: Record<string, Record<string, { title: string; description: string }>> = {
    tcc: {
      all: { title: "Clear2Close Projects", description: "Projects with TCC (Technically Cleared To Close) status" },
    },
    pipeline: {
      active: { title: "Active Pipeline", description: "Active projects contributing to pipeline ACV value" },
    },
    success_rate: {
      all: { title: "Success Rate Projects", description: "All Closed Won and Closed Lost projects used in the success rate calculation" },
    },
    acv: {
      won: { title: "Won ACV Projects", description: "Closed Won projects with their ACV values" },
      lost: { title: "Lost ACV Projects", description: "Closed Lost projects with their ACV values" },
    },
    status: {
      active: { title: "Active Projects", description: "Projects currently in progress" },
      completed: { title: "Completed Projects", description: "Projects that have been completed" },
      closed_won: { title: "Closed Won Projects", description: "Successfully closed projects" },
      closed_lost: { title: "Closed Lost Projects", description: "Projects that were not won" },
    },
    date: {
      soon: { title: "Completing Soon", description: "Projects ending within the next 14 days" },
      new: { title: "Started This Week", description: "Projects that started in the current week" },
    },
    risk: {
      high: { title: "High Risk Projects", description: "Projects marked with high risk level" },
      medium: { title: "Medium Risk Projects", description: "Projects marked with medium risk level" },
      low: { title: "Low Risk Projects", description: "Projects marked with low risk level" },
    },
    account: {
      all: { title: "All Accounts", description: "Complete list of accounts in the system" },
    },
    customer: {
      all: { title: "All Accounts", description: "Complete list of accounts in the system" },
    },
    map: {
      progress: { title: "MAP Progress", description: "Active projects with Mutual Action Plans and their progress data" },
      phases: { title: "Active MAP Phases", description: "Active projects with MAP phases — click Open MAP to view details" },
      steps: { title: "Active MAP Steps", description: "Active projects with MAP steps — click Open MAP to view details" },
      tasks: { title: "Active MAP Tasks", description: "Active projects with MAP tasks — click Open MAP to view details" },
      completion: { title: "MAP Completion", description: "Active projects with MAP completion tracking" },
      ontrack: { title: "On Track (with MAPs)", description: "Projects with MAPs that are on track to meet their deadlines" },
      overdue: { title: "Overdue (with MAPs)", description: "Projects with MAPs that have passed their end date" },
    },
  };

  if (clickType === "support_status") {
    const statusLabel = clickValue ? clickValue.charAt(0).toUpperCase() + clickValue.slice(1) : "All";
    return {
      clickType,
      clickValue,
      title: `${statusLabel} Support Requests`,
      description: `Support requests with status: ${statusLabel}`,
    };
  }

  if (clickType === "support_type") {
    const typeLabel = clickValue ? clickValue.charAt(0).toUpperCase() + clickValue.slice(1) : "All";
    return {
      clickType,
      clickValue,
      title: `${typeLabel} Requests`,
      description: `Support requests of type: ${typeLabel}`,
    };
  }

  const config = configs[clickType]?.[clickValue] || { 
    title: "Project Details", 
    description: "View project information" 
  };

  return { clickType, clickValue, ...config };
}
