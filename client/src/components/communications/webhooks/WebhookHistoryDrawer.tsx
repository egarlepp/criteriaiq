import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  History,
  Loader2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Webhook {
  id: number;
  name: string;
  serviceType: "teams" | "slack" | "generic" | "n8n";
}

interface Delivery {
  id: number;
  webhookId: number;
  triggerKey: string;
  status: "pending" | "success" | "failed";
  attemptNumber: number;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  requestPayload: Record<string, unknown> | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface WebhookHistoryDrawerProps {
  webhook: Webhook | null;
  onClose: () => void;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    label: "Pending",
  },
  success: {
    icon: CheckCircle2,
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    label: "Success",
  },
  failed: {
    icon: XCircle,
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    label: "Failed",
  },
};

export default function WebhookHistoryDrawer({
  webhook,
  onClose,
}: WebhookHistoryDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/webhooks", webhook?.id, "deliveries"],
    queryFn: async () => {
      const res = await fetch(`/api/webhooks/${webhook?.id}/deliveries?limit=10`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
    enabled: !!webhook,
    refetchInterval: 5000,
  });

  const deliveries: Delivery[] = data?.deliveries || [];

  const getStatusCodeColor = (code: number | null) => {
    if (!code) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    if (code >= 200 && code < 300) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (code >= 400 && code < 500) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  };

  return (
    <Sheet open={!!webhook} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Delivery History
          </SheetTitle>
          <SheetDescription>
            Last 10 deliveries for <span className="font-medium">{webhook?.name}</span>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-150px)] mt-6 pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No deliveries yet</p>
              <p className="text-sm mt-2">
                Deliveries will appear here when this webhook is triggered
              </p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {deliveries.map((delivery) => {
                const config = statusConfig[delivery.status];
                const StatusIcon = config.icon;

                return (
                  <AccordionItem
                    key={delivery.id}
                    value={String(delivery.id)}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3 w-full pr-4">
                        <StatusIcon
                          className={cn(
                            "h-5 w-5 shrink-0",
                            delivery.status === "success" && "text-green-600",
                            delivery.status === "failed" && "text-red-600",
                            delivery.status === "pending" && "text-yellow-600"
                          )}
                        />
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {delivery.triggerKey}
                            </span>
                            {delivery.attemptNumber > 1 && (
                              <Badge variant="outline" className="text-xs">
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Attempt {delivery.attemptNumber}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(delivery.createdAt), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                        {delivery.statusCode && (
                          <Badge className={cn("text-xs", getStatusCodeColor(delivery.statusCode))}>
                            {delivery.statusCode}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-muted-foreground block mb-1">Status</span>
                            <Badge className={config.color}>
                              {config.label}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground block mb-1">Timestamp</span>
                            <span className="text-xs">
                              {format(new Date(delivery.createdAt), "MMM d, yyyy HH:mm:ss")}
                            </span>
                          </div>
                        </div>

                        {delivery.errorMessage && (
                          <div>
                            <span className="text-muted-foreground block mb-1">Error</span>
                            <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300 text-xs">
                              {delivery.errorMessage}
                            </div>
                          </div>
                        )}

                        {delivery.responseBody && (
                          <div>
                            <span className="text-muted-foreground block mb-1">Response</span>
                            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-[150px]">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(delivery.responseBody), null, 2);
                                } catch {
                                  return delivery.responseBody.substring(0, 500);
                                }
                              })()}
                            </pre>
                          </div>
                        )}

                        {delivery.requestPayload && (
                          <div>
                            <span className="text-muted-foreground block mb-1">Request Payload</span>
                            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-[150px]">
                              {JSON.stringify(delivery.requestPayload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
