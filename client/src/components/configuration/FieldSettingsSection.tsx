import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { ColorPicker } from "@/components/ui/color-picker";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { 
  Filter, 
  UserCheck, 
  AlertTriangle, 
  TrendingUp, 
  Tag, 
  CalendarRange,
  Edit,
  Trash2,
  X,
  RotateCcw,
  Save
} from "lucide-react";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import EndDateFlagsSection from "@/components/shared/end-date-flags-section";

interface StatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const colorOptions = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#FDE047",
  "#000000",
  "#9CA3AF",
  "#1E40AF",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
  "#64748B"
];

const StatusEditForm = ({ status, onSave, colorOptions }: {
  status: StatusConfig;
  onSave: (updates: Partial<StatusConfig>) => void;
  colorOptions: string[];
}) => {
  const [formData, setFormData] = useState({
    name: status.name,
    description: status.description || "",
    color: status.color,
    icon: status.icon || "CircleDot"
  });

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter status name"
        />
      </div>
      <div>
        <LucideIconPicker
          label="Icon"
          value={formData.icon}
          onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
        />
      </div>
      <div>
        <Label htmlFor="edit-description">Description</Label>
        <Textarea
          id="edit-description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter description (optional)"
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="edit-color">Color</Label>
        <div className="mt-2">
          <ColorPicker
            value={formData.color}
            onChange={(color) => setFormData(prev => ({ ...prev, color }))}
            size="sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogClose>
      </div>
    </div>
  );
};

const CustomerStatusEditForm = ({ status, onSave, colorOptions }: {
  status: any;
  onSave: (updates: Partial<any>) => void;
  colorOptions: string[];
}) => {
  const [formData, setFormData] = useState({
    name: status.name,
    description: status.description || "",
    color: status.color,
    icon: status.icon || "ClipboardClock"
  });

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="edit-customer-name">Name</Label>
        <Input
          id="edit-customer-name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter customer status name"
        />
      </div>
      <div>
        <LucideIconPicker
          label="Icon"
          value={formData.icon}
          onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
        />
      </div>
      <div>
        <Label htmlFor="edit-customer-description">Description</Label>
        <Textarea
          id="edit-customer-description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter description (optional)"
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="edit-customer-color">Color</Label>
        <div className="mt-2">
          <ColorPicker
            value={formData.color}
            onChange={(color) => setFormData(prev => ({ ...prev, color }))}
            size="sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogClose>
      </div>
    </div>
  );
};

const RiskLevelEditForm = ({ riskLevel, onSave, colorOptions }: {
  riskLevel: any;
  onSave: (updates: Partial<any>) => void;
  colorOptions: string[];
}) => {
  const [formData, setFormData] = useState({
    name: riskLevel.name,
    description: riskLevel.description || "",
    color: riskLevel.color,
    icon: riskLevel.icon || "AlertTriangle"
  });

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="edit-risk-level-name">Name</Label>
        <Input
          id="edit-risk-level-name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter risk level name"
        />
      </div>
      <div>
        <LucideIconPicker
          label="Icon"
          value={formData.icon}
          onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
        />
      </div>
      <div>
        <Label htmlFor="edit-risk-level-description">Description</Label>
        <Textarea
          id="edit-risk-level-description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter description (optional)"
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="edit-risk-level-color">Color</Label>
        <div className="mt-2">
          <ColorPicker
            value={formData.color}
            onChange={(color) => setFormData(prev => ({ ...prev, color }))}
            size="sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogClose>
      </div>
    </div>
  );
};

const RankingEditForm = ({ ranking, onSave, colorOptions }: {
  ranking: any;
  onSave: (updates: Partial<any>) => void;
  colorOptions: string[];
}) => {
  const [formData, setFormData] = useState({
    name: ranking.name,
    description: ranking.description || "",
    color: ranking.color,
    icon: ranking.icon || "Star"
  });

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="edit-ranking-name">Name</Label>
        <Input
          id="edit-ranking-name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter ranking name"
        />
      </div>
      <div>
        <LucideIconPicker
          label="Icon"
          value={formData.icon}
          onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
        />
      </div>
      <div>
        <Label htmlFor="edit-ranking-description">Description</Label>
        <Textarea
          id="edit-ranking-description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter description (optional)"
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="edit-ranking-color">Color</Label>
        <div className="mt-2">
          <ColorPicker
            value={formData.color}
            onChange={(color) => setFormData(prev => ({ ...prev, color }))}
            size="sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogClose>
      </div>
    </div>
  );
};

/**
 * Field Settings is one page with a view per list (Admin › Projects & Rules ›
 * Field Settings, `/admin?tab=configuration&subtab=…`). The views are the
 * page's tab bar, defined in sidebar-nav-config.ts; they share the page's
 * permission (config.configuration). Industries is its own page.
 */
export const FIELD_SETTINGS_VIEWS = [
  "project-status",
  "account-status",
  "risk-level",
  "ranking",
  "tags",
  "end-date-flags",
] as const;
export type FieldSettingsView = (typeof FIELD_SETTINGS_VIEWS)[number];

function isFieldSettingsView(value: string | null): value is FieldSettingsView {
  return !!value && (FIELD_SETTINGS_VIEWS as readonly string[]).includes(value);
}

export function FieldSettingsSection() {
  const search = useSearch();
  const subtab = new URLSearchParams(search).get("subtab");
  const view: FieldSettingsView = isFieldSettingsView(subtab) ? subtab : "project-status";

  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  const [newStatus, setNewStatus] = useState({ name: "", color: "#3B82F6", icon: "CircleDot", description: "" });
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [newCustomerStatus, setNewCustomerStatus] = useState({ name: "", color: "#3B82F6", icon: "ClipboardClock", description: "" });
  const [isAddingCustomerStatus, setIsAddingCustomerStatus] = useState(false);
  const [newRiskLevel, setNewRiskLevel] = useState({ name: "", color: "#EF4444", icon: "AlertTriangle", description: "" });
  const [isAddingRiskLevel, setIsAddingRiskLevel] = useState(false);
  const [newRanking, setNewRanking] = useState({ name: "", color: "#F59E0B", icon: "Star", description: "" });
  const [isAddingRanking, setIsAddingRanking] = useState(false);

  const [newTagData, setNewTagData] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  });
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [editingSystemTag, setEditingSystemTag] = useState<any>(null);
  const [isEditSystemTagDialogOpen, setIsEditSystemTagDialogOpen] = useState(false);
  const [editingCustomTag, setEditingCustomTag] = useState<any>(null);
  const [isEditCustomTagDialogOpen, setIsEditCustomTagDialogOpen] = useState(false);

  const [deleteTagConfirmOpen, setDeleteTagConfirmOpen] = useState(false);
  const [pendingDeleteTagId, setPendingDeleteTagId] = useState<number | null>(null);
  const [deleteSystemTagConfirmOpen, setDeleteSystemTagConfirmOpen] = useState(false);
  const [pendingDeleteSystemTagName, setPendingDeleteSystemTagName] = useState<string | null>(null);

  // Delete confirmation state for the four field-config registries
  // (Task #763). Previously the row-level Trash button on Project
  // Status / Account Status / Risk Level / Ranking fired the delete
  // mutation on the first click — a single stray click could wipe a
  // referenced configuration. These four state pairs back the new
  // ConfirmationDialog instances at the bottom of this component so
  // the delete only goes through after an explicit confirm, matching
  // the existing Tag / System Tag delete pattern.
  const [deleteStatusConfirmOpen, setDeleteStatusConfirmOpen] = useState(false);
  const [pendingDeleteStatusId, setPendingDeleteStatusId] = useState<number | null>(null);
  const [deleteCustomerStatusConfirmOpen, setDeleteCustomerStatusConfirmOpen] = useState(false);
  const [pendingDeleteCustomerStatusId, setPendingDeleteCustomerStatusId] = useState<number | null>(null);
  const [deleteRiskLevelConfirmOpen, setDeleteRiskLevelConfirmOpen] = useState(false);
  const [pendingDeleteRiskLevelId, setPendingDeleteRiskLevelId] = useState<number | null>(null);
  const [deleteRankingConfirmOpen, setDeleteRankingConfirmOpen] = useState(false);
  const [pendingDeleteRankingId, setPendingDeleteRankingId] = useState<number | null>(null);

  const { data: statusConfigs = [], isLoading: statusLoading } = useQuery<StatusConfig[]>({
    queryKey: ["/api/status-configs"],
    enabled: isAuthenticated,
  });

  const { data: customerStatusConfigs = [], isLoading: customerStatusLoading } = useQuery<any[]>({
    queryKey: ["/api/customer-status-configs"],
    enabled: isAuthenticated,
  });

  const { data: riskLevelConfigs = [], isLoading: riskLevelLoading } = useQuery<any[]>({
    queryKey: ["/api/risk-level-configs"],
    enabled: isAuthenticated,
  });

  const { data: rankingConfigs = [], isLoading: rankingLoading } = useQuery<any[]>({
    queryKey: ["/api/ranking-configs"],
    enabled: isAuthenticated,
  });

  const { data: tags = [], isLoading: tagsLoading } = useQuery<any[]>({
    queryKey: ["/api/tags"],
    enabled: isAuthenticated,
  });

  const createStatusMutation = useMutation({
    mutationFn: async (statusData: { name: string; color: string; description?: string }) => {
      return await apiRequest("POST", "/api/status-configs", statusData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status-configs"] });
      showSuccessToast("Success", "Status configuration created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create status configuration");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<StatusConfig> }) => {
      return await apiRequest("PUT", `/api/status-configs/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status-configs"] });
      showSuccessToast("Success", "Status configuration updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update status configuration");
    },
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/status-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status-configs"] });
      showSuccessToast("Success", "Status configuration deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete status configuration");
    },
  });

  const createCustomerStatusMutation = useMutation({
    mutationFn: async (statusData: { name: string; color: string; description?: string }) => {
      return await apiRequest("POST", "/api/customer-status-configs", statusData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-status-configs"] });
      showSuccessToast("Success", "Customer status configuration created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create customer status configuration");
    },
  });

  const updateCustomerStatusMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<any> }) => {
      return await apiRequest("PUT", `/api/customer-status-configs/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-status-configs"] });
      showSuccessToast("Success", "Customer status configuration updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update customer status configuration");
    },
  });

  const deleteCustomerStatusMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/customer-status-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-status-configs"] });
      showSuccessToast("Success", "Customer status configuration deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete customer status configuration");
    },
  });

  const createRiskLevelMutation = useMutation({
    mutationFn: async (riskLevelData: { name: string; color: string; icon?: string; description?: string }) => {
      return await apiRequest("POST", "/api/risk-level-configs", riskLevelData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-level-configs"] });
      showSuccessToast("Success", "Risk level configuration created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create risk level configuration");
    },
  });

  const updateRiskLevelMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<any> }) => {
      return await apiRequest("PUT", `/api/risk-level-configs/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-level-configs"] });
      showSuccessToast("Success", "Risk level configuration updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update risk level configuration");
    },
  });

  const deleteRiskLevelMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/risk-level-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-level-configs"] });
      showSuccessToast("Success", "Risk level configuration deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete risk level configuration");
    },
  });

  const createRankingMutation = useMutation({
    mutationFn: async (rankingData: { name: string; color: string; icon?: string; description?: string }) => {
      return await apiRequest("POST", "/api/ranking-configs", rankingData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ranking-configs"] });
      showSuccessToast("Success", "Ranking configuration created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create ranking configuration");
    },
  });

  const updateRankingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<any> }) => {
      return await apiRequest("PUT", `/api/ranking-configs/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ranking-configs"] });
      showSuccessToast("Success", "Ranking configuration updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update ranking configuration");
    },
  });

  const deleteRankingMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/ranking-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ranking-configs"] });
      showSuccessToast("Success", "Ranking configuration deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete ranking configuration");
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (tagData: { name: string; description?: string; color: string }) => {
      return await apiRequest("POST", "/api/tags", tagData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      setNewTagData({ name: '', description: '', color: '#3B82F6' });
      showSuccessToast("Success", "Tag created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create tag");
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      showSuccessToast("Success", "Tag deleted successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to delete tag");
    },
  });

  const updateCustomTagMutation = useMutation({
    mutationFn: async (tagData: { id: number; name: string; description?: string; color: string }) => {
      return await apiRequest("PUT", `/api/tags/${tagData.id}`, {
        name: tagData.name.trim(),
        description: tagData.description?.trim() || null,
        color: tagData.color
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setEditingCustomTag(null);
      setIsEditCustomTagDialogOpen(false);
      showSuccessToast("Success", "Tag updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update tag");
    },
  });

  const formatResetSummary = (data: any) => {
    const s = data?.summary;
    if (!s) return "Defaults restored";
    const parts: string[] = [];
    if (s.inserted) parts.push(`${s.inserted} re-created`);
    if (s.updated) parts.push(`${s.updated} restored`);
    if (parts.length === 0) parts.push("nothing to change");
    return `${parts.join(", ")} (out of ${s.totalDefaults} defaults).`;
  };

  const resetRankingsMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/ranking-configs/reset-defaults"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ranking-configs"] });
      showSuccessToast("Rankings restored", formatResetSummary(data));
    },
    onError: (error: any) =>
      showErrorToast("Reset failed", error?.message || "Failed to reset rankings"),
  });

  const resetSystemTagsMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/tags/system/reset-defaults"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      showSuccessToast("System tags restored", formatResetSummary(data));
    },
    onError: (error: any) =>
      showErrorToast("Reset failed", error?.message || "Failed to reset system tags"),
  });

  const [resetRankingsConfirmOpen, setResetRankingsConfirmOpen] = useState(false);
  const [resetSystemTagsConfirmOpen, setResetSystemTagsConfirmOpen] = useState(false);

  const handleAddStatus = () => {
    if (!newStatus.name.trim()) {
      showErrorToast("Error", "Status name is required");
      return;
    }
    if (statusConfigs.some((status: StatusConfig) => status.name.toLowerCase() === newStatus.name.toLowerCase())) {
      showErrorToast("Error", "A status with this name already exists");
      return;
    }
    createStatusMutation.mutate(newStatus);
    setNewStatus({ name: "", color: "#3B82F6", icon: "CircleDot", description: "" });
    setIsAddingStatus(false);
  };

  const handleRemoveStatus = (statusId: number) => {
    if (statusConfigs.length <= 1) {
      showErrorToast("Error", "At least one status must remain");
      return;
    }
    const status = statusConfigs.find((s: StatusConfig) => s.id === statusId);
    if (status && (status.name === "Closed Lost" || status.name === "Closed Won")) {
      showErrorToast("Error", "This status cannot be deleted as it is a protected system status.");
      return;
    }
    // Task #763: gate the delete behind a confirmation dialog so a
    // stray click can't wipe a referenced project status.
    setPendingDeleteStatusId(statusId);
    setDeleteStatusConfirmOpen(true);
  };

  const confirmDeleteStatus = () => {
    if (pendingDeleteStatusId !== null) {
      deleteStatusMutation.mutate(pendingDeleteStatusId);
      setPendingDeleteStatusId(null);
    }
  };

  const handleStatusUpdate = (statusId: number, updates: Partial<StatusConfig>) => {
    const status = statusConfigs.find((s: StatusConfig) => s.id === statusId);
    if (status && (status.name === "Closed Lost" || status.name === "Closed Won")) {
      showErrorToast("Error", "This status cannot be edited as it is a protected system status.");
      return;
    }
    updateStatusMutation.mutate({ id: statusId, updates });
  };

  const handleAddCustomerStatus = () => {
    if (!newCustomerStatus.name.trim()) {
      showErrorToast("Error", "Status name is required");
      return;
    }
    if (customerStatusConfigs.some((status: any) => status.name.toLowerCase() === newCustomerStatus.name.toLowerCase())) {
      showErrorToast("Error", "A customer status with this name already exists");
      return;
    }
    createCustomerStatusMutation.mutate(newCustomerStatus);
    setNewCustomerStatus({ name: "", color: "#3B82F6", icon: "ClipboardClock", description: "" });
    setIsAddingCustomerStatus(false);
  };

  const handleRemoveCustomerStatus = (statusId: number) => {
    if (customerStatusConfigs.length <= 1) {
      showErrorToast("Error", "At least one customer status must remain");
      return;
    }
    // Task #763: gate the delete behind a confirmation dialog.
    setPendingDeleteCustomerStatusId(statusId);
    setDeleteCustomerStatusConfirmOpen(true);
  };

  const confirmDeleteCustomerStatus = () => {
    if (pendingDeleteCustomerStatusId !== null) {
      deleteCustomerStatusMutation.mutate(pendingDeleteCustomerStatusId);
      setPendingDeleteCustomerStatusId(null);
    }
  };

  const handleCustomerStatusUpdate = (statusId: number, updates: Partial<any>) => {
    updateCustomerStatusMutation.mutate({ id: statusId, updates });
  };

  const handleAddRiskLevel = () => {
    if (!newRiskLevel.name.trim()) {
      showErrorToast("Error", "Risk level name is required");
      return;
    }
    if (riskLevelConfigs.some((level: any) => level.name.toLowerCase() === newRiskLevel.name.toLowerCase())) {
      showErrorToast("Error", "A risk level with this name already exists");
      return;
    }
    createRiskLevelMutation.mutate(newRiskLevel);
    setNewRiskLevel({ name: "", color: "#EF4444", icon: "AlertTriangle", description: "" });
    setIsAddingRiskLevel(false);
  };

  const handleRemoveRiskLevel = (riskLevelId: number) => {
    if (riskLevelConfigs.length <= 1) {
      showErrorToast("Error", "At least one risk level must remain");
      return;
    }
    // Task #763: gate the delete behind a confirmation dialog.
    setPendingDeleteRiskLevelId(riskLevelId);
    setDeleteRiskLevelConfirmOpen(true);
  };

  const confirmDeleteRiskLevel = () => {
    if (pendingDeleteRiskLevelId !== null) {
      deleteRiskLevelMutation.mutate(pendingDeleteRiskLevelId);
      setPendingDeleteRiskLevelId(null);
    }
  };

  const handleRiskLevelUpdate = (riskLevelId: number, updates: Partial<any>) => {
    updateRiskLevelMutation.mutate({ id: riskLevelId, updates });
  };

  const handleAddRanking = () => {
    if (!newRanking.name.trim()) {
      showErrorToast("Error", "Ranking name is required");
      return;
    }
    if (rankingConfigs.some((ranking: any) => ranking.name.toLowerCase() === newRanking.name.toLowerCase())) {
      showErrorToast("Error", "A ranking with this name already exists");
      return;
    }
    createRankingMutation.mutate(newRanking);
    setNewRanking({ name: "", color: "#F59E0B", icon: "Star", description: "" });
    setIsAddingRanking(false);
  };

  const handleRemoveRanking = (rankingId: number) => {
    if (rankingConfigs.length <= 1) {
      showErrorToast("Error", "At least one ranking must remain");
      return;
    }
    // Task #763: gate the delete behind a confirmation dialog.
    setPendingDeleteRankingId(rankingId);
    setDeleteRankingConfirmOpen(true);
  };

  const confirmDeleteRanking = () => {
    if (pendingDeleteRankingId !== null) {
      deleteRankingMutation.mutate(pendingDeleteRankingId);
      setPendingDeleteRankingId(null);
    }
  };

  const handleRankingUpdate = (rankingId: number, updates: Partial<any>) => {
    updateRankingMutation.mutate({ id: rankingId, updates });
  };

  const handleCreateTag = async () => {
    if (newTagData.name.trim()) {
      try {
        await createTagMutation.mutateAsync({
          name: newTagData.name.trim(),
          description: newTagData.description.trim() || undefined,
          color: newTagData.color,
        });
        setNewTagData({ name: '', description: '', color: '#3B82F6' });
        setIsTagDialogOpen(false);
        showSuccessToast("Success", "Tag created successfully");
      } catch (error) {
        showErrorToast("Error", "Failed to create tag");
      }
    }
  };

  const handleDeleteTag = (tagId: number) => {
    setPendingDeleteTagId(tagId);
    setDeleteTagConfirmOpen(true);
  };

  const confirmDeleteTag = () => {
    if (pendingDeleteTagId) {
      deleteTagMutation.mutate(pendingDeleteTagId);
      setPendingDeleteTagId(null);
    }
  };

  const handleEditCustomTag = (tag: any) => {
    setEditingCustomTag({ ...tag });
    setIsEditCustomTagDialogOpen(true);
  };

  const handleUpdateCustomTag = async () => {
    if (!editingCustomTag || !editingCustomTag.name.trim()) return;
    updateCustomTagMutation.mutate({
      id: editingCustomTag.id,
      name: editingCustomTag.name.trim(),
      description: editingCustomTag.description?.trim() || undefined,
      color: editingCustomTag.color
    });
  };

  const handleEditSystemTag = (tag: any) => {
    setEditingSystemTag({ ...tag });
    setIsEditSystemTagDialogOpen(true);
  };

  const handleUpdateSystemTag = async () => {
    if (!editingSystemTag || !editingSystemTag.name.trim()) return;
    try {
      await apiRequest("PUT", `/api/tags/system/${editingSystemTag.name}`, {
        name: editingSystemTag.name.trim(),
        description: editingSystemTag.description?.trim() || undefined,
        color: editingSystemTag.color
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setEditingSystemTag(null);
      setIsEditSystemTagDialogOpen(false);
      showSuccessToast("Success", "System tag updated successfully");
    } catch (error) {
      showErrorToast("Error", "Failed to update system tag");
    }
  };

  const handleDeleteSystemTag = (tagName: string) => {
    setPendingDeleteSystemTagName(tagName);
    setDeleteSystemTagConfirmOpen(true);
  };

  const confirmDeleteSystemTag = async () => {
    if (!pendingDeleteSystemTagName) return;
    try {
      await apiRequest("DELETE", `/api/tags/system/${pendingDeleteSystemTagName}`);
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      showSuccessToast("Success", "System tag deleted successfully");
    } catch (error) {
      showErrorToast("Error", "Failed to delete system tag");
    } finally {
      setPendingDeleteSystemTagName(null);
    }
  };

  return (
    <div className="space-y-4">

      <div className="space-y-4">
        {view === "project-status" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">Internal Project Status Settings</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Configure the status options that appear in dashboard filters and project creation forms.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">Current Status Options</Label>
              {statusLoading ? (
                <div className="mt-3 text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading statuses...</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {statusConfigs.map((status: StatusConfig) => (
                    <div key={status.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className="rounded-full px-3 py-1 inline-flex items-center gap-1.5 text-white"
                          style={{ backgroundColor: status.color }}
                        >
                          {status.icon && <DynamicIcon name={status.icon} className="h-3.5 w-3.5" />}
                          <span>{status.name}</span>
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{status.name}</p>
                          {status.description && (
                            <p className="text-xs text-gray-500">{status.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(status.name === "Closed Lost" || status.name === "Closed Won") ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs text-gray-500">
                              Protected Status
                            </Badge>
                            <Button variant="outline" size="sm" disabled>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" disabled className="text-gray-400">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-black dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Status Configuration</DialogTitle>
                                </DialogHeader>
                                <StatusEditForm
                                  status={status}
                                  onSave={(updates) => handleStatusUpdate(status.id, updates)}
                                  colorOptions={colorOptions}
                                />
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveStatus(status.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {!isAddingStatus ? (
              <Button onClick={() => setIsAddingStatus(true)} size="sm" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Add Project Status
              </Button>
            ) : (
              <div className="mt-3 p-4 border rounded-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status-name">Status Name</Label>
                    <Input
                      id="status-name"
                      value={newStatus.name}
                      onChange={(e) => setNewStatus({...newStatus, name: e.target.value})}
                      placeholder="e.g., Under Review"
                    />
                  </div>
                  <div>
                    <LucideIconPicker
                      label="Icon"
                      value={newStatus.icon}
                      onChange={(icon) => setNewStatus({...newStatus, icon})}
                    />
                  </div>
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-2">
                    <ColorPicker
                      value={newStatus.color}
                      onChange={(color) => setNewStatus({...newStatus, color})}
                      size="sm"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="status-description">Description (Optional)</Label>
                  <Input
                    id="status-description"
                    value={newStatus.description}
                    onChange={(e) => setNewStatus({...newStatus, description: e.target.value})}
                    placeholder="Brief description of this status"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddStatus}>Add Status</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddingStatus(false);
                      setNewStatus({ name: "", color: "#3B82F6", icon: "CircleDot", description: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label className="text-base font-medium">Preview</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                This is how status options will appear in filters and forms:
              </p>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {statusConfigs.map((status: StatusConfig) => (
                  <Badge
                    key={status.id}
                    variant="secondary"
                    className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                    style={{ backgroundColor: status.color }}
                  >
                    {status.icon && <DynamicIcon name={status.icon} className="h-3.5 w-3.5" />}
                    <span>{status.name}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {view === "account-status" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">Account Status Settings</CardTitle>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure the account status options that appear in project details and tables.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">Current Account Status Options</Label>
              {customerStatusLoading ? (
                <div className="mt-3 text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading account statuses...</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {customerStatusConfigs.map((status: any) => (
                    <div key={status.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                          style={{ backgroundColor: status.color }}
                        >
                          {status.icon && <DynamicIcon name={status.icon} className="h-3.5 w-3.5" />}
                          <span>{status.name}</span>
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{status.name}</p>
                          {status.description && (
                            <p className="text-xs text-gray-500">{status.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-black dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Account Status Configuration</DialogTitle>
                            </DialogHeader>
                            <CustomerStatusEditForm
                              status={status}
                              onSave={(updates) => handleCustomerStatusUpdate(status.id, updates)}
                              colorOptions={colorOptions}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveCustomerStatus(status.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {!isAddingCustomerStatus ? (
              <Button onClick={() => setIsAddingCustomerStatus(true)} size="sm" className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Add Account Status
              </Button>
            ) : (
              <div className="mt-3 p-4 border rounded-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-status-name">Status Name</Label>
                    <Input
                      id="customer-status-name"
                      value={newCustomerStatus.name}
                      onChange={(e) => setNewCustomerStatus({...newCustomerStatus, name: e.target.value})}
                      placeholder="e.g., Pending Review"
                    />
                  </div>
                  <div>
                    <LucideIconPicker
                      label="Icon"
                      value={newCustomerStatus.icon}
                      onChange={(icon) => setNewCustomerStatus({...newCustomerStatus, icon})}
                    />
                  </div>
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-2">
                    <ColorPicker
                      value={newCustomerStatus.color}
                      onChange={(color) => setNewCustomerStatus({...newCustomerStatus, color})}
                      size="sm"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="customer-status-description">Description (Optional)</Label>
                  <Input
                    id="customer-status-description"
                    value={newCustomerStatus.description}
                    onChange={(e) => setNewCustomerStatus({...newCustomerStatus, description: e.target.value})}
                    placeholder="Brief description of this status"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddCustomerStatus}>Add Account Status</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddingCustomerStatus(false);
                      setNewCustomerStatus({ name: "", color: "#3B82F6", icon: "ClipboardClock", description: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label className="text-base font-medium">Preview</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                This is how account status options will appear in filters and forms:
              </p>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {customerStatusConfigs.map((status: any) => (
                  <Badge
                    key={status.id}
                    variant="secondary"
                    className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                    style={{ backgroundColor: status.color }}
                  >
                    {status.icon && <DynamicIcon name={status.icon} className="h-3.5 w-3.5" />}
                    <span>{status.name}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {view === "risk-level" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">Risk Level Settings</CardTitle>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure the risk level options that appear in project details and forms.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">Current Risk Level Options</Label>
              {riskLevelLoading ? (
                <div className="mt-3 text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading risk levels...</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {riskLevelConfigs.map((level: any) => (
                    <div key={level.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                          style={{ backgroundColor: level.color }}
                        >
                          {level.icon && <DynamicIcon name={level.icon} className="h-3.5 w-3.5" />}
                          <span>{level.name}</span>
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{level.name}</p>
                          {level.description && (
                            <p className="text-xs text-gray-500">{level.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-black dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Risk Level Configuration</DialogTitle>
                            </DialogHeader>
                            <RiskLevelEditForm
                              riskLevel={level}
                              onSave={(updates) => handleRiskLevelUpdate(level.id, updates)}
                              colorOptions={colorOptions}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRiskLevel(level.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {!isAddingRiskLevel ? (
              <Button onClick={() => setIsAddingRiskLevel(true)} size="sm" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Add Risk Level
              </Button>
            ) : (
              <div className="mt-3 p-4 border rounded-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="risk-level-name">Risk Level Name</Label>
                    <Input
                      id="risk-level-name"
                      value={newRiskLevel.name}
                      onChange={(e) => setNewRiskLevel({...newRiskLevel, name: e.target.value})}
                      placeholder="e.g., High Risk"
                    />
                  </div>
                  <div>
                    <LucideIconPicker
                      label="Icon"
                      value={newRiskLevel.icon}
                      onChange={(icon) => setNewRiskLevel({...newRiskLevel, icon})}
                    />
                  </div>
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-2">
                    <ColorPicker
                      value={newRiskLevel.color}
                      onChange={(color) => setNewRiskLevel({...newRiskLevel, color})}
                      size="sm"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="risk-level-description">Description (Optional)</Label>
                  <Input
                    id="risk-level-description"
                    value={newRiskLevel.description}
                    onChange={(e) => setNewRiskLevel({...newRiskLevel, description: e.target.value})}
                    placeholder="Brief description of this risk level"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddRiskLevel}>Add Risk Level</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddingRiskLevel(false);
                      setNewRiskLevel({ name: "", color: "#EF4444", icon: "AlertTriangle", description: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label className="text-base font-medium">Preview</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                This is how risk level options will appear in filters and forms:
              </p>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {riskLevelConfigs.map((level: any) => (
                  <Badge
                    key={level.id}
                    variant="secondary"
                    className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                    style={{ backgroundColor: level.color }}
                  >
                    {level.icon && <DynamicIcon name={level.icon} className="h-3.5 w-3.5" />}
                    <span>{level.name}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {view === "ranking" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl">Ranking Settings</CardTitle>
              </div>
              {user?.role === "Admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetRankingsConfirmOpen(true)}
                  disabled={resetRankingsMutation.isPending}
                  className="flex items-center gap-2"
                  title="Restore the canonical default ranking options. User-created rankings are left untouched."
                  data-testid="button-reset-rankings"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset to defaults
                </Button>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure the ranking options that appear in project details and forms.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">Current Ranking Options</Label>
              {rankingLoading ? (
                <div className="mt-3 text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading rankings...</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {rankingConfigs.map((ranking: any) => (
                    <div key={ranking.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                          style={{ backgroundColor: ranking.color }}
                        >
                          {ranking.icon && <DynamicIcon name={ranking.icon} className="h-3.5 w-3.5" />}
                          <span>{ranking.name}</span>
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{ranking.name}</p>
                          {ranking.description && (
                            <p className="text-xs text-gray-500">{ranking.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-black dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Ranking Configuration</DialogTitle>
                            </DialogHeader>
                            <RankingEditForm
                              ranking={ranking}
                              onSave={(updates) => handleRankingUpdate(ranking.id, updates)}
                              colorOptions={colorOptions}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRanking(ranking.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {!isAddingRanking ? (
              <Button onClick={() => setIsAddingRanking(true)} size="sm" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Add Ranking
              </Button>
            ) : (
              <div className="mt-3 p-4 border rounded-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ranking-name">Ranking Name</Label>
                    <Input
                      id="ranking-name"
                      value={newRanking.name}
                      onChange={(e) => setNewRanking({...newRanking, name: e.target.value})}
                      placeholder="e.g., A-Tier"
                    />
                  </div>
                  <div>
                    <LucideIconPicker
                      label="Icon"
                      value={newRanking.icon}
                      onChange={(icon) => setNewRanking({...newRanking, icon})}
                    />
                  </div>
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-2">
                    <ColorPicker
                      value={newRanking.color}
                      onChange={(color) => setNewRanking({...newRanking, color})}
                      size="sm"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="ranking-description">Description (Optional)</Label>
                  <Input
                    id="ranking-description"
                    value={newRanking.description}
                    onChange={(e) => setNewRanking({...newRanking, description: e.target.value})}
                    placeholder="Brief description of this ranking"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddRanking}>Add Ranking</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddingRanking(false);
                      setNewRanking({ name: "", color: "#F59E0B", icon: "Star", description: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label className="text-base font-medium">Preview</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                This is how ranking options will appear in filters and forms:
              </p>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {rankingConfigs.map((ranking: any) => (
                  <Badge
                    key={ranking.id}
                    variant="secondary"
                    className="text-white rounded-full px-3 py-1 inline-flex items-center gap-1.5"
                    style={{ backgroundColor: ranking.color }}
                  >
                    {ranking.icon && <DynamicIcon name={ranking.icon} className="h-3.5 w-3.5" />}
                    <span>{ranking.name}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {view === "tags" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl">Tags Management</CardTitle>
              </div>
              {user?.role === "Admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetSystemTagsConfirmOpen(true)}
                  disabled={resetSystemTagsMutation.isPending}
                  className="flex items-center gap-2"
                  title="Restore the canonical default system tags. Custom (user-created) tags are left untouched."
                  data-testid="button-reset-system-tags"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset system tags
                </Button>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View and manage all tags used across templates, success criteria, and products.
            </p>
          </CardHeader>
          <CardContent>
            {tagsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading tags...</p>
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Tag className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No tags created yet. Create your first tag to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">System Tags</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {tags.filter((tag: any) => tag.createdBy === 'system').length} tags
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.filter((tag: any) => tag.createdBy === 'system').map((tag: any, index: number) => (
                      <div key={`system-${tag.name}-${index}`} className="flex items-center gap-1">
                        <Badge
                          variant="secondary"
                          className="text-white rounded-full px-3 py-1"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                        {user && typeof user.role === 'string' && user.role === 'Admin' && tag && typeof tag.name === 'string' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditSystemTag(tag)}
                              className="text-black dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 p-1"
                              title="Edit system tag"
                            >
                              <Edit className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteSystemTag(tag.name)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Delete system tag"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium text-gray-700">Custom Tags</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {tags.filter((tag: any) => tag.createdBy !== 'system').length} tags
                      </span>
                      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            Add Tag
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create New Tag</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="tag-name">Name</Label>
                              <Input
                                id="tag-name"
                                placeholder="Enter tag name"
                                value={newTagData.name}
                                onChange={(e) => setNewTagData(prev => ({ ...prev, name: e.target.value }))}
                              />
                            </div>
                            <div>
                              <Label htmlFor="tag-description">Description</Label>
                              <Textarea
                                id="tag-description"
                                placeholder="Enter tag description (optional)"
                                value={newTagData.description}
                                onChange={(e) => setNewTagData(prev => ({ ...prev, description: e.target.value }))}
                                rows={3}
                              />
                            </div>
                            <div>
                              <Label htmlFor="tag-color">Color</Label>
                              <div className="mt-2">
                                <ColorPicker
                                  value={newTagData.color}
                                  onChange={(color) => setNewTagData(prev => ({ ...prev, color }))}
                                  size="sm"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end space-x-3">
                              <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                              </DialogClose>
                              <Button onClick={handleCreateTag}>
                                Create Tag
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {tags.filter((tag: any) => tag.createdBy !== 'system').length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No custom tags created yet. Click "Add Tag" to create your first custom tag.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {tags.filter((tag: any) => tag.createdBy !== 'system').map((tag: any) => (
                          <div key={tag.id} className="flex items-center gap-1">
                            <Badge
                              variant="secondary"
                              className="text-white rounded-full px-3 py-1"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </Badge>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEditCustomTag(tag)}
                                className="text-black dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 p-1"
                                title="Edit custom tag"
                              >
                                <Edit className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteTag(tag.id)}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Delete tag"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {view === "end-date-flags" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">End Date Flags</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Configure flags that appear next to any date field in the system based on due date criteria. Each flag can target Project End Date, Dependency Due Date, MAP Phase/Step/Task Due Date, and more.
            </p>
          </CardHeader>
          <CardContent>
            <EndDateFlagsSection />
          </CardContent>
        </Card>
        )}
      </div>

      <ConfirmationDialog
        open={deleteTagConfirmOpen}
        onOpenChange={setDeleteTagConfirmOpen}
        title="Delete Tag"
        description="Are you sure you want to delete this tag? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTag}
        onCancel={() => setPendingDeleteTagId(null)}
        variant="destructive"
      />

      <ConfirmationDialog
        open={deleteSystemTagConfirmOpen}
        onOpenChange={setDeleteSystemTagConfirmOpen}
        title="Delete System Tag"
        description="Are you sure you want to delete this system tag? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteSystemTag}
        onCancel={() => setPendingDeleteSystemTagName(null)}
        variant="destructive"
      />

      <ConfirmationDialog
        open={resetRankingsConfirmOpen}
        onOpenChange={setResetRankingsConfirmOpen}
        title="Reset rankings to defaults?"
        description="This restores the default ranking options to their original names, colors, icons, and order. Any rankings you have created will be left untouched. This action will be recorded in the audit trail."
        confirmLabel="Reset rankings"
        cancelLabel="Cancel"
        onConfirm={() => resetRankingsMutation.mutate()}
        variant="destructive"
      />

      <ConfirmationDialog
        open={resetSystemTagsConfirmOpen}
        onOpenChange={setResetSystemTagsConfirmOpen}
        title="Reset system tags to defaults?"
        description="This restores the default system tags (names, colors, descriptions). Custom tags you have created will be left untouched. This action will be recorded in the audit trail."
        confirmLabel="Reset system tags"
        cancelLabel="Cancel"
        onConfirm={() => resetSystemTagsMutation.mutate()}
        variant="destructive"
      />

      {/* Row-level delete confirmations for Project Status / Account
          Status / Risk Level / Ranking (Task #763). The Trash buttons
          on these registries previously fired the mutation directly;
          they now open these dialogs first. */}
      <ConfirmationDialog
        open={deleteStatusConfirmOpen}
        onOpenChange={setDeleteStatusConfirmOpen}
        title="Delete Project Status"
        description="Are you sure you want to delete this project status? Projects currently using this status will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteStatus}
        onCancel={() => setPendingDeleteStatusId(null)}
        variant="destructive"
      />

      <ConfirmationDialog
        open={deleteCustomerStatusConfirmOpen}
        onOpenChange={setDeleteCustomerStatusConfirmOpen}
        title="Delete Account Status"
        description="Are you sure you want to delete this account status? Accounts currently using this status will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteCustomerStatus}
        onCancel={() => setPendingDeleteCustomerStatusId(null)}
        variant="destructive"
      />

      <ConfirmationDialog
        open={deleteRiskLevelConfirmOpen}
        onOpenChange={setDeleteRiskLevelConfirmOpen}
        title="Delete Risk Level"
        description="Are you sure you want to delete this risk level? Records currently tagged with this level will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteRiskLevel}
        onCancel={() => setPendingDeleteRiskLevelId(null)}
        variant="destructive"
      />

      <ConfirmationDialog
        open={deleteRankingConfirmOpen}
        onOpenChange={setDeleteRankingConfirmOpen}
        title="Delete Ranking"
        description="Are you sure you want to delete this ranking? Records currently tagged with it will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteRanking}
        onCancel={() => setPendingDeleteRankingId(null)}
        variant="destructive"
      />

      <Dialog open={isEditCustomTagDialogOpen} onOpenChange={setIsEditCustomTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Tag</DialogTitle>
          </DialogHeader>
          {editingCustomTag && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-tag-name">Name</Label>
                <Input
                  id="edit-tag-name"
                  value={editingCustomTag.name}
                  onChange={(e) => setEditingCustomTag((prev: any) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-tag-description">Description</Label>
                <Textarea
                  id="edit-tag-description"
                  value={editingCustomTag.description || ''}
                  onChange={(e) => setEditingCustomTag((prev: any) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-tag-color">Color</Label>
                <div className="mt-2">
                  <ColorPicker
                    value={editingCustomTag.color}
                    onChange={(color) => setEditingCustomTag((prev: any) => ({ ...prev, color }))}
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={() => setIsEditCustomTagDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateCustomTag}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditSystemTagDialogOpen} onOpenChange={setIsEditSystemTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit System Tag</DialogTitle>
          </DialogHeader>
          {editingSystemTag && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-system-tag-name">Name</Label>
                <Input
                  id="edit-system-tag-name"
                  value={editingSystemTag.name}
                  onChange={(e) => setEditingSystemTag((prev: any) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-system-tag-description">Description</Label>
                <Textarea
                  id="edit-system-tag-description"
                  value={editingSystemTag.description || ''}
                  onChange={(e) => setEditingSystemTag((prev: any) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-system-tag-color">Color</Label>
                <div className="mt-2">
                  <ColorPicker
                    value={editingSystemTag.color}
                    onChange={(color) => setEditingSystemTag((prev: any) => ({ ...prev, color }))}
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={() => setIsEditSystemTagDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateSystemTag}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
