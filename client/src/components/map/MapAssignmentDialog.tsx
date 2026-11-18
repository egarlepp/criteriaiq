import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Route, 
  User, 
  Search, 
  Filter,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserPlus,
  UserMinus,
  ClipboardPenLine,
  Boxes,
  PackageCheck,
  Users,
  AlignVerticalJustifyStart
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MapPhase, MapStep, MapTask } from "@/types/map";
import { DEPARTMENTS } from "@/config/departments";

interface MapAssignmentDialogProps {
  projectId: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignmentsUpdate: () => void;
  phases: MapPhase[];
  steps: MapStep[];
  tasks: MapTask[];
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  region: string;
  isActive: boolean;
  isApproved: boolean;
}

interface AssignmentItem {
  id: number;
  type: 'phase' | 'step' | 'task';
  name: string;
  description?: string;
  status: string;
  teamOwned?: string;
  assignedToCustomerUserId?: string;
  assignedToUserId?: string; // Internal/Partner via mapAssignments
  additionalInternalUserId?: string; // Additional Internal via mapAssignments category
  dueDate?: string;
  phaseId?: number;
  stepId?: number;
}

export function MapAssignmentDialog({ 
  projectId, 
  isOpen, 
  onOpenChange, 
  onAssignmentsUpdate,
  phases,
  steps,
  tasks,
}: MapAssignmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [assignmentType, setAssignmentType] = useState<string>("team_owned"); // New: Assignment type selector
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterAssignment, setFilterAssignment] = useState<string>("all");
  const [filterElementType, setFilterElementType] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterStep, setFilterStep] = useState<string>("all");

  // Fetch project data to get all team members
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['/api/projects', projectId],
    queryFn: () => apiRequest('GET', `/api/projects/${projectId}`),
    enabled: isOpen && !!projectId,
    staleTime: Infinity, // Never refetch while dialog is open - team membership doesn't change during assignment
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after dialog closes
  });

  // Derive project status from fetched project data for EndDateBadge filtering
  const projectStatus: string | undefined = project?.status ?? undefined;

  // Extract all project team member IDs from the 7 fields
  const projectTeamMemberIds = useMemo(() => {
    if (!project) {
      console.log('MAP Assignment: No project data available');
      return new Set<string>();
    }
    
    const memberIds = new Set<string>();
    
    // 1. Account Representative
    if (project.accountRepresentative?.id) {
      memberIds.add(String(project.accountRepresentative.id));
      console.log('MAP Assignment: Added Account Rep:', project.accountRepresentative.id);
    }
    
    // 2. Primary Engineer
    if (project.primarySe?.id) {
      memberIds.add(String(project.primarySe.id));
      console.log('MAP Assignment: Added Primary SE:', project.primarySe.id);
    }
    
    // 3. Specialist Engineer
    if (project.specialistSe?.id) {
      memberIds.add(String(project.specialistSe.id));
      console.log('MAP Assignment: Added Specialist SE:', project.specialistSe.id);
    }
    
    // 4. Supporting Engineers (array)
    if (project.supportingSalesEngineers && Array.isArray(project.supportingSalesEngineers)) {
      project.supportingSalesEngineers.forEach((engineer: any) => {
        const id = typeof engineer === 'object' && engineer.id ? engineer.id : engineer;
        if (id) {
          memberIds.add(String(id));
          console.log('MAP Assignment: Added Supporting SE:', id);
        }
      });
    }
    
    // 5. Additional Supporting Team (array)
    if (project.additionalSupportingTeam && Array.isArray(project.additionalSupportingTeam)) {
      project.additionalSupportingTeam.forEach((member: any) => {
        const id = typeof member === 'object' && member.id ? member.id : member;
        if (id) {
          memberIds.add(String(id));
          console.log('MAP Assignment: Added Additional Team:', id);
        }
      });
    }
    
    // 6. Customer Users (array)
    if (project.customerUsers && Array.isArray(project.customerUsers)) {
      project.customerUsers.forEach((user: any) => {
        const id = typeof user === 'object' && user.id ? user.id : user;
        if (id) {
          memberIds.add(String(id));
          console.log('MAP Assignment: Added Customer User:', id);
        }
      });
    }
    
    // 7. Additional Access (array)
    if (project.additionalAccess && Array.isArray(project.additionalAccess)) {
      project.additionalAccess.forEach((user: any) => {
        const id = typeof user === 'object' && user.id ? user.id : user;
        if (id) {
          memberIds.add(String(id));
          console.log('MAP Assignment: Added Additional Access:', id);
        }
      });
    }
    
    console.log('MAP Assignment: Total project team members:', memberIds.size, Array.from(memberIds));
    return memberIds;
  }, [project]);

  // Fetch all active users
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/users');
      return response.filter((user: User) => user.isActive && user.isApproved);
    },
    enabled: isOpen,
    staleTime: Infinity, // Never refetch while dialog is open
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Filter users to only show project team members
  const users = useMemo(() => {
    return allUsers.filter(user => projectTeamMemberIds.has(String(user.id)));
  }, [allUsers, projectTeamMemberIds]);

  // Fetch customer access users for "Assigned Customer" assignment type
  const { data: customerAccessData = [] } = useQuery({
    queryKey: ["/api/customer-access", projectId],
    queryFn: () => apiRequest("GET", `/api/customer-access/${projectId}`),
    enabled: isOpen && !!projectId,
    staleTime: Infinity,
  });

  // Build customer user list for assignment dropdown
  const customerUsers = useMemo(() => {
    if (!project || !customerAccessData) return [];
    return customerAccessData.map((access: any) => ({
      email: access.userEmail,
      permission: access.permission,
      name: access.userEmail // Use email as display name
    }));
  }, [project, customerAccessData]);

  // NOTE: Assignments are now stored directly in entity columns (assignedToUserId, additionalInternalUserId, assignedToCustomerUserId, teamOwned)
  // The deprecated /map/assignments endpoint is no longer used - data comes from phases/steps/tasks props

  // Fetch roles for color mapping
  const { data: roles = [] } = useQuery<Array<{ name: string; color: string }>>({
    queryKey: ["/api/roles"],
    enabled: true,
  });

  // Helper function to get role badge color
  const getRoleColor = (role: string) => {
    const foundRole = roles.find((r: any) => r.name === role);
    return foundRole?.color || "#6b7280";
  };

  // Prepare assignment items from MAP data - assignments are now stored directly in entity columns
  const assignmentItems = useMemo((): AssignmentItem[] => {
    const items: AssignmentItem[] = [];
    
    // Add phases with all 4 assignment fields from direct columns
    phases.forEach(phase => {
      items.push({
        id: phase.id,
        type: 'phase',
        name: phase.name,
        description: phase.description || undefined,
        status: phase.status,
        teamOwned: phase.teamOwned || undefined,
        assignedToCustomerUserId: phase.assignedToCustomerUserId || undefined,
        assignedToUserId: phase.assignedToUserId || undefined,
        additionalInternalUserId: phase.additionalInternalUserId || undefined,
        dueDate: phase.dueDate || undefined,
      });
    });
    
    // Add steps with all 4 assignment fields from direct columns
    steps.forEach(step => {
      items.push({
        id: step.id,
        type: 'step',
        name: step.name,
        description: step.description || undefined,
        status: step.status,
        teamOwned: step.teamOwned || undefined,
        assignedToCustomerUserId: step.assignedToCustomerUserId || undefined,
        assignedToUserId: step.assignedToUserId || undefined,
        additionalInternalUserId: step.additionalInternalUserId || undefined,
        dueDate: step.dueDate || undefined,
        phaseId: step.phaseId,
      });
    });
    
    // Add tasks with all 4 assignment fields from direct columns
    tasks.forEach(task => {
      items.push({
        id: task.id,
        type: 'task',
        name: task.name,
        description: task.description || undefined,
        status: task.status,
        teamOwned: task.teamOwned || undefined,
        assignedToCustomerUserId: task.assignedToCustomerUserId || undefined,
        assignedToUserId: task.assignedToUserId || undefined,
        additionalInternalUserId: task.additionalInternalUserId || undefined,
        dueDate: task.dueDate || undefined,
        stepId: task.stepId,
      });
    });
    
    return items;
  }, [phases, steps, tasks]); // Removed assignments dependency - using direct columns now

  // Filter and search items
  const filteredItems = useMemo(() => {
    let filtered = assignmentItems;
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Phase filter - affects Steps and Tasks
    if (filterPhase !== "all") {
      const phaseId = parseInt(filterPhase);
      filtered = filtered.filter(item => {
        if (item.type === 'phase') {
          return item.id === phaseId;
        } else if (item.type === 'step') {
          return item.phaseId === phaseId;
        } else if (item.type === 'task') {
          // Find the step this task belongs to
          const taskStep = steps.find(s => s.id === item.stepId);
          return taskStep?.phaseId === phaseId;
        }
        return false;
      });
    }
    
    // Step filter - affects Tasks only
    if (filterStep !== "all") {
      const stepId = parseInt(filterStep);
      filtered = filtered.filter(item => {
        if (item.type === 'step') {
          return item.id === stepId;
        } else if (item.type === 'task') {
          return item.stepId === stepId;
        }
        return false;
      });
    }
    
    // Assignment filter - check all 4 assignment fields
    if (filterAssignment !== "all") {
      if (filterAssignment === "assigned") {
        filtered = filtered.filter(item => 
          (item.teamOwned && item.teamOwned !== 'N/A') || 
          item.assignedToCustomerUserId || 
          item.assignedToUserId || 
          item.additionalInternalUserId
        );
      } else if (filterAssignment === "unassigned") {
        filtered = filtered.filter(item => 
          (!item.teamOwned || item.teamOwned === 'N/A') && 
          !item.assignedToCustomerUserId && 
          !item.assignedToUserId && 
          !item.additionalInternalUserId
        );
      }
    }
    
    // Element type filter
    if (filterElementType !== "all") {
      filtered = filtered.filter(item => item.type === filterElementType);
    }
    
    return filtered;
  }, [assignmentItems, searchTerm, filterPhase, filterStep, filterAssignment, filterElementType, steps]);

  // Filter users
  const filteredUsers = useMemo(() => {
    let filtered = users;
    
    // Apply assignment type role restrictions first
    if (assignmentType === 'assigned_internal_partner') {
      // Only show users with Engineer, Sales, or Partner roles
      filtered = filtered.filter(user => ['Engineer', 'Sales', 'Partner'].includes(user.role));
    } else if (assignmentType === 'additional_internal') {
      // Only show users with Admin, Proserv, Support, CX, or Product roles
      filtered = filtered.filter(user => ['Admin', 'Proserv', 'Support', 'CX', 'Product'].includes(user.role));
    }
    
    if (filterRole !== "all") {
      filtered = filtered.filter(user => user.role === filterRole);
    }
    
    if (filterDepartment !== "all") {
      filtered = filtered.filter(user => user.department === filterDepartment);
    }
    
    return filtered;
  }, [users, filterRole, filterDepartment, assignmentType]);

  // Get unique roles and departments for filters - filtered by assignment type
  const uniqueRoles = useMemo(() => {
    const allRoles = [...new Set(users.map(u => u.role))];
    
    // Filter roles based on assignment type
    if (assignmentType === 'assigned_internal_partner') {
      // Only show Engineer, Sales, and Partner roles
      return allRoles.filter(role => ['Engineer', 'Sales', 'Partner'].includes(role));
    } else if (assignmentType === 'additional_internal') {
      // Only show Admin, Proserv, Support, CX, or Product roles
      return allRoles.filter(role => ['Admin', 'Proserv', 'Support', 'CX', 'Product'].includes(role));
    }
    
    // For other assignment types, show all roles
    return allRoles;
  }, [users, assignmentType]);
  
  const uniqueDepartments = useMemo(() => [...new Set(users.map(u => u.department))], [users]);

  // Get available steps filtered by selected phase
  const availableSteps = useMemo(() => {
    if (filterPhase === "all") {
      return steps;
    }
    const phaseId = parseInt(filterPhase);
    return steps.filter(step => step.phaseId === phaseId);
  }, [steps, filterPhase]);

  // Assignment mutation - handles all 4 assignment types
  const assignMutation = useMutation({
    mutationFn: async ({ items, value, type }: { items: AssignmentItem[], value: string, type: string }) => {
      // Handle different assignment types
      if (type === 'team_owned') {
        // Update teamOwned field directly for each entity
        const updates = items.map(item => {
          return apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            teamOwned: value
          });
        });
        return Promise.all(updates);
      } else if (type === 'assigned_customer') {
        // Update assignedToCustomerUserId field directly
        const updates = items.map(item => {
          return apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            assignedToCustomerUserId: value
          });
        });
        return Promise.all(updates);
      } else if (type === 'assigned_internal_partner') {
        // Update assignedToUserId field directly
        const updates = items.map(item => {
          return apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            assignedToUserId: value
          });
        });
        return Promise.all(updates);
      } else if (type === 'additional_internal') {
        // Update additionalInternalUserId field directly
        const updates = items.map(item => {
          return apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            additionalInternalUserId: value
          });
        });
        return Promise.all(updates);
      }
    },
    onSuccess: () => {
      toast({
        title: "Assignments Updated",
        description: "Selected items have been assigned successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
      // Deprecated: queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map/assignments"] });
      onAssignmentsUpdate();
      setSelectedItems(new Set());
      setSelectedUserId("");
      setSelectedTeam("");
    },
    onError: (error: any) => {
      showErrorToast("Assignment Failed", error.message || "Failed to update assignments.");
    },
  });

  // Unassignment mutation - handles all 4 assignment types
  const unassignMutation = useMutation({
    mutationFn: async ({ items, type }: { items: AssignmentItem[], type: string }) => {
      // Handle different assignment types
      if (type === 'team_owned') {
        const updates = items.map(item => 
          apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            teamOwned: 'N/A'
          })
        );
        return Promise.all(updates);
      } else if (type === 'assigned_customer') {
        const updates = items.map(item => 
          apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            assignedToCustomerUserId: null
          })
        );
        return Promise.all(updates);
      } else if (type === 'assigned_internal_partner') {
        const updates = items.map(item => 
          apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            assignedToUserId: null
          })
        );
        return Promise.all(updates);
      } else if (type === 'additional_internal') {
        const updates = items.map(item => 
          apiRequest('PUT', `/api/map/${item.type}s/${item.id}`, {
            additionalInternalUserId: null
          })
        );
        return Promise.all(updates);
      }
    },
    onSuccess: () => {
      toast({
        title: "Assignments Removed",
        description: "Selected items have been unassigned successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
      // Deprecated: queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map/assignments"] });
      onAssignmentsUpdate();
      setSelectedItems(new Set());
    },
    onError: (error: any) => {
      showErrorToast("Unassignment Failed", error.message || "Failed to remove assignments.");
    },
  });

  const handleItemToggle = (itemKey: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey);
    } else {
      newSelected.add(itemKey);
    }
    setSelectedItems(newSelected);
  };

  // Handle check all items
  const handleCheckAll = () => {
    const allFilteredKeys = filteredItems.map(item => `${item.type}-${item.id}`);
    const allChecked = allFilteredKeys.every(key => selectedItems.has(key));
    
    if (allChecked) {
      // Uncheck all filtered items
      setSelectedItems(prev => {
        const next = new Set(prev);
        allFilteredKeys.forEach(key => next.delete(key));
        return next;
      });
    } else {
      // Check all filtered items
      setSelectedItems(prev => {
        const next = new Set(prev);
        allFilteredKeys.forEach(key => next.add(key));
        return next;
      });
    }
  };

  // Calculate check all state
  const checkAllState = useMemo(() => {
    if (filteredItems.length === 0) {
      return { checked: false, indeterminate: false };
    }
    
    const allFilteredKeys = filteredItems.map(item => `${item.type}-${item.id}`);
    const checkedCount = allFilteredKeys.filter(key => selectedItems.has(key)).length;
    
    if (checkedCount === 0) {
      return { checked: false, indeterminate: false };
    } else if (checkedCount === allFilteredKeys.length) {
      return { checked: true, indeterminate: false };
    } else {
      return { checked: false, indeterminate: true };
    }
  }, [filteredItems, selectedItems]);

  const handleBulkAssign = () => {
    if (selectedItems.size === 0) return;
    
    // Check if we have the right selection based on assignment type
    if (assignmentType === 'team_owned' && !selectedTeam) {
      showErrorToast("Error", "Please select a team to assign.");
      return;
    }
    
    if (assignmentType !== 'team_owned' && !selectedUserId) {
      showErrorToast("Error", "Please select a user to assign.");
      return;
    }
    
    const itemsToAssign = Array.from(selectedItems).map(itemKey => {
      const [type, id] = itemKey.split('-');
      return assignmentItems.find(item => item.type === type && item.id === parseInt(id));
    }).filter((item): item is AssignmentItem => item !== undefined);
    
    if (itemsToAssign.length === 0) {
      showErrorToast("Error", "Selected items could not be found. Please refresh and try again.");
      return;
    }
    
    const value = assignmentType === 'team_owned' ? selectedTeam : selectedUserId;
    assignMutation.mutate({ items: itemsToAssign, value, type: assignmentType });
  };

  const handleBulkUnassign = () => {
    if (selectedItems.size === 0) return;
    
    const itemsToUnassign = Array.from(selectedItems).map(itemKey => {
      const [type, id] = itemKey.split('-');
      return assignmentItems.find(item => item.type === type && item.id === parseInt(id));
    }).filter((item): item is AssignmentItem => item !== undefined);
    
    if (itemsToUnassign.length === 0) {
      showErrorToast("Error", "Selected items could not be found. Please refresh and try again.");
      return;
    }
    
    unassignMutation.mutate({ items: itemsToUnassign, type: assignmentType });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-blue-600" />;
      case 'blocked': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'phase': return <ClipboardPenLine className="h-4 w-4 text-purple-600" />;
      case 'step': return <Boxes className="h-4 w-4 text-blue-600" />;
      case 'task': return <PackageCheck className="h-4 w-4 text-green-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getTypeBackgroundColor = (type: string) => {
    switch (type) {
      case 'phase': return 'bg-purple-50 dark:bg-purple-900/20';
      case 'step': return 'bg-blue-50 dark:bg-blue-900/20';
      case 'task': return 'bg-green-50 dark:bg-green-900/20';
      default: return 'bg-gray-50 dark:bg-gray-800';
    }
  };

  const getTypeBadge = (type: string) => {
    // Canonical Phase/Step/Task triplet (purple, blue, green) shared
    // with MapAssignmentTracker / MapActivityTimeline.
    switch (type) {
      case 'phase': return { label: 'Phase', className: 'bg-purple-600 dark:bg-purple-700 text-white' };
      case 'step': return { label: 'Step', className: 'bg-blue-600 dark:bg-blue-700 text-white' };
      case 'task': return { label: 'Task', className: 'bg-green-600 dark:bg-green-700 text-white' };
      default: return { label: type, className: '' };
    }
  };

  const getUserDisplayName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-600">
            <Route className="h-5 w-5" />
            {project?.customerName || 'Loading...'}: Project ID#{projectId} - MAP Assignment Management
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-6 min-h-0">
          {/* Left Panel - Items */}
          <div className="flex-1 flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlignVerticalJustifyStart className="h-5 w-5" />
                  Project MAP Items
                </CardTitle>
                
                {/* Search and Filters */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Select value={filterAssignment} onValueChange={setFilterAssignment}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Assignment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Assignments</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={filterElementType} onValueChange={setFilterElementType}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Element Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <span>Elements</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="phase">
                          <div className="flex items-center gap-2">
                            <ClipboardPenLine className="h-4 w-4 text-purple-600" />
                            <span>Phases</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="step">
                          <div className="flex items-center gap-2">
                            <Boxes className="h-4 w-4 text-blue-600" />
                            <span>Steps</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="task">
                          <div className="flex items-center gap-2">
                            <PackageCheck className="h-4 w-4 text-green-600" />
                            <span>Tasks</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={filterPhase} onValueChange={(value) => {
                      setFilterPhase(value);
                      // Always reset step filter when phase filter changes
                      setFilterStep("all");
                    }}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Phase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <span>All {phases.length} Phases</span>
                          </div>
                        </SelectItem>
                        {phases.map(phase => (
                          <SelectItem key={phase.id} value={phase.id.toString()}>
                            <div className="flex items-center gap-2">
                              <ClipboardPenLine className="h-4 w-4 text-purple-600" />
                              <span>{phase.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select 
                      value={filterStep} 
                      onValueChange={setFilterStep}
                      disabled={availableSteps.length === 0}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Step" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <span>All {availableSteps.length} Steps</span>
                          </div>
                        </SelectItem>
                        {availableSteps.map(step => (
                          <SelectItem key={step.id} value={step.id.toString()}>
                            <div className="flex items-center gap-2">
                              <Boxes className="h-4 w-4 text-blue-600" />
                              <span>{step.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Check All Items */}
                  {filteredItems.length > 0 && (
                    <div className="flex items-center gap-2 pt-3 border-t">
                      <Checkbox 
                        id="check-all"
                        checked={checkAllState.indeterminate ? "indeterminate" : checkAllState.checked}
                        onCheckedChange={handleCheckAll}
                      />
                      <Label 
                        htmlFor="check-all" 
                        className="text-sm font-medium cursor-pointer"
                      >
                        Check All Items ({filteredItems.length})
                      </Label>
                    </div>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 overflow-auto space-y-2">
                {filteredItems.map(item => {
                  const itemKey = `${item.type}-${item.id}`;
                  const isSelected = selectedItems.has(itemKey);
                  const typeBadge = getTypeBadge(item.type);
                  const typeBackground = getTypeBackgroundColor(item.type);
                  
                  return (
                    <div
                      key={itemKey}
                      className={cn(
                        "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors relative",
                        typeBackground,
                        isSelected && "border-blue-400 ring-2 ring-blue-200"
                      )}
                      onClick={() => handleItemToggle(itemKey)}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                      
                      <div className="flex items-center gap-2">
                        {getTypeIcon(item.type)}
                        {getStatusIcon(item.status)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{item.name}</span>
                          <Badge className={cn("text-xs", typeBadge.className)}>
                            {typeBadge.label}
                          </Badge>
                        </div>
                        
                        {/* 4-Field Assignment Status Display */}
                        <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400 mb-2">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Team:</span>
                            <span className={item.teamOwned && item.teamOwned !== 'N/A' ? 'text-purple-600' : 'text-gray-400'}>
                              {item.teamOwned && item.teamOwned !== 'N/A' ? item.teamOwned : 'Unassigned'}
                            </span>
                            <span className="text-gray-400">|</span>
                            <span className="font-medium">Customer:</span>
                            <span className={item.assignedToCustomerUserId ? 'text-blue-600' : 'text-gray-400'}>
                              {item.assignedToCustomerUserId || 'Unassigned'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Internal/Partner:</span>
                            <span className={item.assignedToUserId ? 'text-green-600' : 'text-gray-400'}>
                              {item.assignedToUserId ? getUserDisplayName(item.assignedToUserId) : 'Unassigned'}
                            </span>
                            <span className="text-gray-400">|</span>
                            <span className="font-medium">Additional Internal:</span>
                            <span className={item.additionalInternalUserId ? 'text-orange-600' : 'text-gray-400'}>
                              {item.additionalInternalUserId ? getUserDisplayName(item.additionalInternalUserId) : 'Unassigned'}
                            </span>
                          </div>
                        </div>
                        
                        {/* Due Date */}
                        {item.dueDate && (
                          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs flex-wrap">
                            <Calendar className="h-3 w-3" />
                            <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
                            <EndDateBadge
                              endDate={item.dueDate}
                              targetField={item.type === 'phase' ? 'mapPhase.dueDate' : item.type === 'task' ? 'mapTask.dueDate' : 'mapStep.dueDate'}
                              projectStatus={projectStatus}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {filteredItems.length === 0 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No items found matching your filters</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Assignment Selection */}
          <div className="w-80 flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Select Assignment
                </CardTitle>
                
                {/* Assignment Type Selector */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium mb-2">Assignment Type</Label>
                    <Select value={assignmentType} onValueChange={(value) => {
                      setAssignmentType(value);
                      setSelectedUserId("");
                      setSelectedTeam("");
                      setFilterRole("all"); // Reset role filter when changing assignment type
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team_owned">Team Owned</SelectItem>
                        <SelectItem value="assigned_customer">Assigned Customer</SelectItem>
                        <SelectItem value="assigned_internal_partner">Assigned Internal or Partner</SelectItem>
                        <SelectItem value="additional_internal">Additional Internal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conditional UI Based on Assignment Type */}
                  {assignmentType === 'team_owned' ? (
                    // Show Teams Only for Team Owned
                    <div>
                      <Label className="text-sm font-medium mb-2">Select Team</Label>
                      <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTMENTS.map(dept => (
                            <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    // Show Role & Team Filters for User Assignments
                    <>
                      <Select value={filterRole} onValueChange={setFilterRole}>
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Roles</SelectItem>
                          {uniqueRoles.map(role => (
                            <SelectItem key={role} value={role}>{role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by team" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Teams</SelectItem>
                          {uniqueDepartments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 overflow-auto space-y-2">
                {/* Hide user list when Team Owned is selected */}
                {assignmentType !== 'team_owned' && (
                  <>
                    {/* Show Customer Users for "Assigned Customer" type */}
                    {assignmentType === 'assigned_customer' ? (
                      <>
                        {customerUsers.length === 0 ? (
                          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                            <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                            <p>No customer users found</p>
                          </div>
                        ) : (
                          customerUsers.map((customer: any, index: number) => (
                            <div
                              key={index}
                              className={cn(
                                "flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",
                                selectedUserId === customer.email && "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                              )}
                              onClick={() => setSelectedUserId(customer.email)}
                            >
                              <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
                                <User className="h-4 w-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{customer.email}</div>
                                <Badge variant="outline" className="text-xs mt-1">
                                  {customer.permission}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </>
                    ) : (
                      /* Show Project Team Users for other assignment types */
                      <>
                        {(usersLoading || projectLoading) && (
                          <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                            {projectLoading ? 'Loading project team...' : 'Loading users...'}
                          </div>
                        )}
                        
                        {!usersLoading && !projectLoading && filteredUsers.map(user => (
                          <div
                            key={user.id}
                            className={cn(
                              "flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",
                              selectedUserId === user.id && "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                            )}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {user.email}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  style={{ backgroundColor: getRoleColor(user.role), color: 'white' }}
                                  className="text-xs px-2 py-1"
                                >
                                  {user.role}
                                </Badge>
                                {user.department && (
                                  <Badge variant="outline" className="text-xs">
                                    {user.department}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {filteredUsers.length === 0 && !usersLoading && !projectLoading && (
                          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                            <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                            <p>No users found</p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>{selectedItems.size} items selected</span>
            {selectedUserId && assignmentType !== 'team_owned' && (
              <span>• {getUserDisplayName(selectedUserId)} selected</span>
            )}
            {selectedTeam && assignmentType === 'team_owned' && (
              <span>• {DEPARTMENTS.find(d => d.value === selectedTeam)?.label || selectedTeam} selected</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleBulkUnassign}
              disabled={selectedItems.size === 0 || unassignMutation.isPending}
              className="flex items-center gap-2"
            >
              <UserMinus className="h-4 w-4" />
              Unassign Selected
            </Button>
            
            <Button
              onClick={handleBulkAssign}
              disabled={
                selectedItems.size === 0 || 
                (assignmentType === 'team_owned' ? !selectedTeam : !selectedUserId) || 
                assignMutation.isPending
              }
              className="flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Assign Selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}