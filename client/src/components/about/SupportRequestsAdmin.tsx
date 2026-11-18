import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Edit, Eye, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { SupportFeaturesTab } from "./SupportFeaturesTab";
import type { SupportRequest, Filters } from "./types";
import { getApplicationPageDisplayName, getPriorityBadge, getStatusBadge, getStatusIcon } from "./types";

/**
 * Admin › Workplace › Support Requests and Admin › Monitoring & Audit ›
 * Error Log. Both were the two views of About › Support & Features; they now
 * live on the Admin page, and switching between them stays on /admin.
 */
export function SupportRequestsAdmin({ view }: { view: "requests" | "error-log" }) {
  const [, setLocation] = useLocation();
  const { userRole } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Support & Features state
  const [filters, setFilters] = useState<Filters>({
    search: "",
    type: "all",
    priority: "all",
    status: "all",
    customer: "all",
    assignedTo: "all"
  });
  
  // Dialog states for actions
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null);
  
  // Edit form state
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editIsBlocking, setEditIsBlocking] = useState<boolean | undefined>(undefined);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<SupportRequest | null>(null);
  
  
  // Action handlers for Preview, Edit, and Delete
  const handlePreviewRequest = (request: SupportRequest) => {
    setSelectedRequest(request);
    setPreviewDialogOpen(true);
  };

  const handleEditRequest = (request: SupportRequest) => {
    setSelectedRequest(request);
    setEditStatus(request.status);
    setEditNotes(request.internalNotes || "");
    setEditIsBlocking(request.isBlocking);
    setEditDialogOpen(true);
  };

  const handleUpdateRequest = async () => {
    if (!selectedRequest) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/support-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          status: editStatus,
          internalNotes: editNotes,
          ...(selectedRequest.type === "issue" && editIsBlocking !== undefined && { isBlocking: editIsBlocking })
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update request');
      }

      toast({
        title: "Request updated",
        description: `Support request #${selectedRequest.id} has been updated successfully.`,
      });

      // Close dialog and refresh data
      setEditDialogOpen(false);
      setSelectedRequest(null);
      queryClient.invalidateQueries({ queryKey: ["/api/support-requests"] });
    } catch (error) {
      console.error('Error updating request:', error);
      showErrorToast("Error", "Failed to update the support request. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteRequest = (request: SupportRequest) => {
    setPendingDeleteRequest(request);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteRequest = async () => {
    if (!pendingDeleteRequest) return;

    try {
      const response = await fetch(`/api/support-requests/${pendingDeleteRequest.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete request');
      }

      toast({
        title: "Request deleted",
        description: `Support request #${pendingDeleteRequest.id} has been deleted successfully.`,
      });

      // Refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/support-requests"] });
    } catch (error) {
      console.error('Error deleting request:', error);
      showErrorToast("Error", "Failed to delete the support request. Please try again.");
    } finally {
      setPendingDeleteRequest(null);
    }
  };

  const handleDownloadAttachment = async (requestId: number, fileName: string) => {
    try {
      const response = await fetch(`/api/support-requests/download/${fileName}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to download attachment');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      showErrorToast("Error", "Failed to download the attachment. Please try again.");
    }
  };
  
  // RBAC - Only internal users can access Support & Features
  const canAccessSupportFeatures = ['admin', 'engineer', 'proserv', 'support'].includes((userRole || '').toLowerCase());
  
  // Support & Features data queries
  const { data: supportRequests = [], isLoading: supportRequestsLoading, error: supportRequestsError } = useQuery({
    queryKey: ["/api/support-requests"],
    queryFn: () => apiRequest("GET", "/api/support-requests"),
    staleTime: 30 * 1000, // 30 seconds
    enabled: canAccessSupportFeatures,
  });
  
  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: canAccessSupportFeatures,
  });
  
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: canAccessSupportFeatures,
  });

  return (
    <div data-testid="support-requests-admin" className="space-y-4">
      <SupportFeaturesTab
        supportRequests={supportRequests}
        supportRequestsLoading={supportRequestsLoading}
        supportRequestsError={supportRequestsError}
        customers={customers}
        users={users}
        canAccessSupportFeatures={canAccessSupportFeatures}
        filters={filters}
        setFilters={setFilters}
        handlePreviewRequest={handlePreviewRequest}
        handleEditRequest={handleEditRequest}
        handleDeleteRequest={handleDeleteRequest}
        handleDownloadAttachment={handleDownloadAttachment}
        handleSubmissionSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/support-requests"] })}
        subtab={view}
        onSubtabChange={(sub) => setLocation(`/admin?tab=${sub === "error-log" ? "error-log" : "support-requests"}`)}
      />

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Support Request #{selectedRequest?.id} - Preview
            </DialogTitle>
            <DialogDescription>
              Read-only view of support request details
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Type</Label>
                  <div className="mt-1">
                    <Badge className={selectedRequest.type === "issue" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}>
                      {selectedRequest.type === "issue" ? "Support" : "Feature"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Priority</Label>
                  <div className="mt-1">
                    <Badge className={getPriorityBadge(selectedRequest.priority)}>
                      {selectedRequest.priority?.charAt(0).toUpperCase() + selectedRequest.priority?.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(selectedRequest.status)}>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const StatusIcon = getStatusIcon(selectedRequest.status);
                          return <StatusIcon className="h-3.5 w-3.5" />;
                        })()}
                        {selectedRequest.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Customer</Label>
                  <p className="text-sm mt-1">{selectedRequest.customerName || 'None'}</p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Title</Label>
                <p className="text-sm font-medium">{selectedRequest.title}</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Description</Label>
                <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {selectedRequest.description}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Submitted By</Label>
                  <p className="text-sm">{selectedRequest.submittedBy || selectedRequest.submittedByName || 'Unknown'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Submitted</Label>
                  <p className="text-sm">
                    {(selectedRequest.submittedAt || selectedRequest.submittedDate) ? 
                      formatDistanceToNow(new Date((selectedRequest.submittedAt || selectedRequest.submittedDate)!), { addSuffix: true }) : 
                      'Unknown'
                    }
                  </p>
                </div>
              </div>

              {selectedRequest.internalNotes && (
                <div>
                  <Label className="text-sm font-medium">Internal Notes</Label>
                  <div className="text-sm bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    {selectedRequest.internalNotes}
                  </div>
                </div>
              )}

              {selectedRequest.hasAttachment && selectedRequest.attachmentFileName && (
                <div>
                  <Label className="text-sm font-medium">Attachment</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDownloadAttachment(selectedRequest.id, selectedRequest.attachmentFileName || '')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download {selectedRequest.attachmentFileName}
                      </Button>
                    </div>
                    
                    {/* Inline Attachment Viewer */}
                    {(() => {
                      const fileName = selectedRequest.attachmentFileName.toLowerCase();
                      const isImage = fileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
                      const isPdf = fileName.endsWith('.pdf');
                      const attachmentUrl = `/api/support-requests/download/${selectedRequest.attachmentFileName}`;
                      
                      if (isImage) {
                        return (
                          <div className="border dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                            <img 
                              src={attachmentUrl}
                              alt={selectedRequest.attachmentFileName}
                              className="max-w-full max-h-96 object-contain mx-auto"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                if (nextElement) nextElement.style.display = 'block';
                              }}
                            />
                            <div className="hidden text-center text-sm text-gray-500 dark:text-gray-400 p-4">
                              Unable to preview image. Use download button above.
                            </div>
                          </div>
                        );
                      } else if (isPdf) {
                        return (
                          <div className="border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                            <iframe
                              src={attachmentUrl}
                              className="w-full h-96 rounded-lg"
                              title={selectedRequest.attachmentFileName}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                if (nextElement) nextElement.style.display = 'block';
                              }}
                            />
                            <div className="hidden text-center text-sm text-gray-500 dark:text-gray-400 p-4">
                              Unable to preview PDF. Use download button above.
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 text-center">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              File type: {fileName.split('.').pop()?.toUpperCase() || 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Preview not available for this file type
                            </p>
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[800px] h-[930px] max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Support Request #{selectedRequest?.id}
            </DialogTitle>
            <DialogDescription>
              Update the status and internal notes for this support request
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-6">
              {/* Original Request Details - Read Only */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">
                  Original Request Details (Read-only): Submitted - {
                    selectedRequest.submittedAt || selectedRequest.submittedDate ? 
                      new Date(selectedRequest.submittedAt || selectedRequest.submittedDate!).toLocaleDateString() : 
                      'Unknown'
                  }
                </h3>
                
                {/* Common Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Title</Label>
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                      {selectedRequest.title}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Type</Label>
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                      <Badge className={selectedRequest.type === "issue" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"}>
                        {selectedRequest.type === "issue" ? "Support" : "Feature"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Priority</Label>
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                      <Badge className={getPriorityBadge(selectedRequest.priority)}>
                        {selectedRequest.priority?.charAt(0).toUpperCase() + selectedRequest.priority?.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Application Page</Label>
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                      {getApplicationPageDisplayName(selectedRequest.applicationPage)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Customer</Label>
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                      {selectedRequest.customerName || 'None'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Submitted By</Label>
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                      {selectedRequest.submittedByName} ({selectedRequest.submittedByEmail || selectedRequest.submittedBy || 'Unknown'})
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <Label className="text-sm font-medium">Description</Label>
                  <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px]">
                    {selectedRequest.description}
                  </div>
                </div>

                {/* Issue-Specific Fields */}
                {selectedRequest.type === "issue" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 border-t dark:border-gray-700 pt-4">Support Request Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedRequest.os && (
                        <div>
                          <Label className="text-sm font-medium">Operating System</Label>
                          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                            {selectedRequest.os.charAt(0).toUpperCase() + selectedRequest.os.slice(1)}
                          </div>
                        </div>
                      )}
                      {selectedRequest.frequency && (
                        <div>
                          <Label className="text-sm font-medium">Frequency</Label>
                          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                            {selectedRequest.frequency}
                          </div>
                        </div>
                      )}
                      {selectedRequest.browser && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-medium">Browser</Label>
                          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700 break-all">
                            {selectedRequest.browser}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {selectedRequest.stepsToReproduce && (
                      <div>
                        <Label className="text-sm font-medium">Steps to Reproduce</Label>
                        <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px] whitespace-pre-wrap">
                          {selectedRequest.stepsToReproduce}
                        </div>
                      </div>
                    )}
                    
                    {selectedRequest.expectedBehavior && (
                      <div>
                        <Label className="text-sm font-medium">Expected Behavior</Label>
                        <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px] whitespace-pre-wrap">
                          {selectedRequest.expectedBehavior}
                        </div>
                      </div>
                    )}
                    
                    {selectedRequest.actualBehavior && (
                      <div>
                        <Label className="text-sm font-medium">Actual Behavior</Label>
                        <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px] whitespace-pre-wrap">
                          {selectedRequest.actualBehavior}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Feature-Specific Fields */}
                {selectedRequest.type === "feature" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 border-t dark:border-gray-700 pt-4">Feature Request Details</h4>
                    
                    {selectedRequest.problemToSolve && (
                      <div>
                        <Label className="text-sm font-medium">Problem It Solves</Label>
                        <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px] whitespace-pre-wrap">
                          {selectedRequest.problemToSolve}
                        </div>
                      </div>
                    )}
                    
                    {selectedRequest.proposedBehavior && (
                      <div>
                        <Label className="text-sm font-medium">Proposed Behavior</Label>
                        <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px] whitespace-pre-wrap">
                          {selectedRequest.proposedBehavior}
                        </div>
                      </div>
                    )}
                    
                    {selectedRequest.alternativesTried && (
                      <div>
                        <Label className="text-sm font-medium">Alternatives Tried</Label>
                        <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 min-h-[60px] whitespace-pre-wrap">
                          {selectedRequest.alternativesTried}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedRequest.desiredLocation && (
                        <div>
                          <Label className="text-sm font-medium">Desired Location</Label>
                          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                            {selectedRequest.desiredLocation}
                          </div>
                        </div>
                      )}
                      {selectedRequest.priorityHint && (
                        <div>
                          <Label className="text-sm font-medium">Priority Hint</Label>
                          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                            {selectedRequest.priorityHint}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Fields */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-lg font-medium">Update Request</h3>
                
                <div>
                  <Label htmlFor="status" className="text-sm font-medium">Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Not Started">Not Started</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Implemented">Implemented</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                      <SelectItem value="Future Roadmap">Future Roadmap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-sm font-medium">Internal Notes</Label>
                  <Textarea
                    id="notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add internal notes (not visible to customers)..."
                    rows={4}
                  />
                </div>

                {/* Is Blocking field - only for issue requests */}
                {selectedRequest.type === "issue" && (
                  <div>
                    <Label htmlFor="isBlocking" className="text-sm font-medium">Is Blocking</Label>
                    <Select 
                      value={editIsBlocking == null ? "" : editIsBlocking.toString()} 
                      onValueChange={(value) => setEditIsBlocking(value === "true")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select blocking status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateRequest} disabled={isUpdating}>
                    {isUpdating ? "Updating..." : "Update Request"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Request Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Support Request"
        description={`Are you sure you want to delete support request #${pendingDeleteRequest?.id || ''} "${pendingDeleteRequest?.title || ''}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteRequest}
        onCancel={() => setPendingDeleteRequest(null)}
        variant="destructive"
      />
    </div>
  );
}

export default SupportRequestsAdmin;
