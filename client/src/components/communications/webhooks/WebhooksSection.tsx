import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit,
  History,
  TestTube,
  Webhook,
  MessageSquare,
  Hash,
  Globe,
  Loader2,
  Zap,
} from "lucide-react";
import WebhookWizardModal from "./WebhookWizardModal";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import WebhookHistoryDrawer from "./WebhookHistoryDrawer";
import { format } from "date-fns";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";

interface Webhook {
  id: number;
  name: string;
  description: string | null;
  serviceType: "teams" | "slack" | "generic" | "n8n";
  endpointUrl: string;
  template: string;
  headers: Record<string, string> | null;
  isActive: boolean;
  retryEnabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creatorName?: string;
  hasSigningSecret?: boolean;
}

interface WebhooksSectionProps {
  activeTab: string;
}

const serviceIcons = {
  teams: MessageSquare,
  slack: Hash,
  generic: Globe,
  n8n: Zap,
};

const serviceLabels = {
  teams: "Microsoft Teams",
  slack: "Slack",
  generic: "Generic HTTP",
  n8n: "n8n",
};

const serviceBadgeColors = {
  teams: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  slack: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  generic: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  n8n: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

export default function WebhooksSection({ activeTab }: WebhooksSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { t } = useTranslation();
  const [sortConfig, handleSort] = useUrlSortState("webhooks");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [historyWebhook, setHistoryWebhook] = useState<Webhook | null>(null);
  const [webhookPendingDelete, setWebhookPendingDelete] = useState<Webhook | null>(null);

  const { data: webhooksData, isLoading } = useQuery({
    queryKey: ["/api/webhooks"],
    queryFn: async () => {
      const res = await fetch("/api/webhooks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch webhooks");
      return res.json();
    },
    enabled: activeTab === "webhooks",
  });

  const toggleMutation = useMutation({
    mutationFn: async (webhookId: number) => {
      const res = await fetch(`/api/webhooks/${webhookId}/toggle`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to toggle webhook");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
    onError: (error) => {
      showErrorToast("Error", error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (webhookId: number) => {
      const res = await fetch(`/api/webhooks/${webhookId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete webhook");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({
        title: "Success",
        description: "Webhook deleted successfully",
      });
      setWebhookPendingDelete(null);
    },
    onError: (error) => {
      showErrorToast("Error", error.message);
    },
  });

  const testMutation = useMutation({
    mutationFn: async (webhookId: number) => {
      const res = await fetch(`/api/webhooks/${webhookId}/test`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to test webhook");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.result?.success) {
        toast({
          title: "Test Successful",
          description: `Webhook delivered with status ${data.result.statusCode}`,
        });
      } else {
        showErrorToast("Test Failed", data.result?.errorMessage || "Webhook delivery failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
    onError: (error) => {
      showErrorToast("Error", error.message);
    },
  });

  const webhooks: Webhook[] = webhooksData?.webhooks || [];
  const sortedWebhooks = useMemo(
    () =>
      sortRows(webhooks, sortConfig, {
        serviceType: (w) => serviceLabels[w.serviceType],
        isActive: (w) => w.isActive,
        createdAt: (w) => new Date(w.createdAt),
      }),
    [webhooks, sortConfig],
  );

  const handleEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setEditingWebhook(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Webhook} />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10">
          <div>
            <CardTitle className="tracking-tight font-bold flex items-center gap-2 text-[30px]">
              <Webhook className="h-6 w-6 text-blue-600" />
              Webhooks
            </CardTitle>
            <CardDescription>
              Send notifications to Microsoft Teams, Slack, or custom HTTP endpoints when automation triggers fire
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Webhook className="h-4 w-4 mr-2" />
            New Webhook
          </Button>
        </CardHeader>
        <CardContent className="relative z-10">
          {webhooks.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/50">
              <Webhook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No webhooks configured</h3>
              <p className="text-muted-foreground mb-4">
                Create your first webhook to start sending notifications to external services
              </p>
              <Button onClick={() => setWizardOpen(true)}>
                <Webhook className="h-4 w-4 mr-2" />
                Create Webhook
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                    {t("webhooks.table.colName")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="serviceType" sortConfig={sortConfig} onSort={handleSort}>
                    {t("webhooks.table.colService")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="endpointUrl" sortConfig={sortConfig} onSort={handleSort}>
                    {t("webhooks.table.colEndpoint")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="isActive" sortConfig={sortConfig} onSort={handleSort}>
                    {t("webhooks.table.colStatus")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort}>
                    {t("webhooks.table.colCreated")}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} className="w-[100px]">{t("webhooks.table.colActions")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWebhooks.map((webhook) => {
                  const Icon = serviceIcons[webhook.serviceType];
                  return (
                    <TableRow key={webhook.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{webhook.name}</div>
                          {webhook.description && (
                            <div className="text-sm text-muted-foreground">
                              {webhook.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`${serviceBadgeColors[webhook.serviceType]} flex items-center gap-1 w-fit`}
                        >
                          <Icon className="h-3 w-3" />
                          {serviceLabels[webhook.serviceType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate block">
                          {webhook.endpointUrl}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={webhook.isActive}
                          onCheckedChange={() => toggleMutation.mutate(webhook.id)}
                          disabled={toggleMutation.isPending}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(webhook.createdAt), "MMM d, yyyy")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ResponsiveTableActionsMenu
                          actions={[
                            {
                              id: 'edit',
                              label: 'Edit',
                              icon: Edit,
                              onClick: () => handleEdit(webhook)
                            },
                            {
                              id: 'test',
                              label: 'Test',
                              icon: TestTube,
                              onClick: () => testMutation.mutate(webhook.id),
                              disabled: testMutation.isPending
                            },
                            {
                              id: 'history',
                              label: 'View History',
                              icon: History,
                              onClick: () => setHistoryWebhook(webhook)
                            },
                            {
                              id: 'delete',
                              label: 'Delete',
                              icon: Trash2,
                              onClick: () => setWebhookPendingDelete(webhook),
                              variant: 'destructive',
                              separator: true
                            }
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <WebhookWizardModal
        open={wizardOpen}
        onClose={handleWizardClose}
        editingWebhook={editingWebhook}
      />

      <WebhookHistoryDrawer
        webhook={historyWebhook}
        onClose={() => setHistoryWebhook(null)}
      />

      <ConfirmationDialog
        open={webhookPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setWebhookPendingDelete(null);
          }
        }}
        title="Delete webhook?"
        description={
          webhookPendingDelete
            ? `This will permanently delete "${webhookPendingDelete.name}". Any automation rules using this webhook will no longer trigger notifications. This action cannot be undone. Continue?`
            : ""
        }
        confirmLabel="Delete webhook"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (webhookPendingDelete?.id) {
            deleteMutation.mutate(webhookPendingDelete.id);
          }
        }}
        onCancel={() => setWebhookPendingDelete(null)}
      />
    </div>
  );
}
