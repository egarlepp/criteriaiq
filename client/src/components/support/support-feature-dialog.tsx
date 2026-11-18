import React, { useState } from "react";
import type { Customer } from "@shared/schema";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { Upload, X, Loader2, PocketKnife } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { navigation } from "@/components/layout/sidebar";

interface SupportFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: number;
  customerId?: number;
  onSuccess?: () => void;
  openedFromGetHelp?: boolean; // New prop to track if opened from Get Help button
  prefilledData?: {
    type?: "issue" | "feature";
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high" | "critical";
  };
}

interface SupportFormData {
  type: "issue" | "feature" | "";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical" | "";
  applicationPage: string;
  customerId?: number;
  files: File[];
  // Support Request specific fields
  os: "windows" | "mac" | "linux" | "";
  frequency: "Always" | "Often" | "Sometimes" | "Rarely" | "";
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  // Feature Request specific fields
  problemToSolve: string;
  proposedBehavior: string;
  alternativesTried: string;
}

// Allowed file types for client-side validation
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export function SupportFeatureDialog({
  open,
  onOpenChange,
  projectId,
  customerId,
  onSuccess,
  openedFromGetHelp = false,
  prefilledData
}: SupportFeatureDialogProps) {
  // Determine default type based on context
  const getDefaultType = () => {
    if (openedFromGetHelp) return "issue"; // Always default to "issue" for Get Help
    return prefilledData?.type || "";
  };

  const [formData, setFormData] = useState<SupportFormData>({
    type: getDefaultType(),
    title: prefilledData?.title || "",
    description: prefilledData?.description || "",
    priority: prefilledData?.priority || "low", // Default to low
    applicationPage: "None", // Default to none
    customerId: customerId, // Use prop customerId as default
    files: [],
    // Support Request defaults
    os: "windows", // Default to Windows
    frequency: "",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    // Feature Request defaults
    problemToSolve: "",
    proposedBehavior: "",
    alternativesTried: ""
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { userRole } = usePermissions();

  // External users (Customer/Partner/Guest) have limited access. Guest was
  // missing here, so Guests got no account picker and the server refused
  // their request (it needs an account they are a contact on).
  const isExternalUser = user?.role && ['Customer', 'Partner', 'Guest'].includes(user.role);
  
  // External users opened from Get Help should only see Support (not Feature) requests
  const canAccessFeatureRequests = !isExternalUser || !openedFromGetHelp;

  // Only fetch customers for internal users who can access them
  const canAccessCustomers = ['admin', 'engineer', 'proserv', 'support'].includes((userRole || '').toLowerCase());
  
  // Fetch accessible customers for dropdown
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: isExternalUser ? ["/api/customers/accessible"] : ["/api/customers"],
    queryFn: () => apiRequest("GET", isExternalUser ? "/api/customers/accessible" : "/api/customers"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!((canAccessCustomers || isExternalUser) && !customerId), // Only run if user can access and no preset customer
  });

  const resetForm = () => {
    setFormData({
      type: getDefaultType(),
      title: prefilledData?.title || "",
      description: prefilledData?.description || "",
      priority: prefilledData?.priority || "low",
      applicationPage: "none",
      customerId: customerId, // Reset to prop customerId
      files: [],
      // Reset Support Request fields
      os: "windows",
      frequency: "",
      stepsToReproduce: "",
      expectedBehavior: "",
      actualBehavior: "",
      // Reset Feature Request fields
      problemToSolve: "",
      proposedBehavior: "",
      alternativesTried: ""
    });
  };

  // Submit mutation using multipart FormData with credentials
  const submitMutation = useMutation({
    mutationFn: async (data: SupportFormData) => {
      const formDataToSend = new FormData();
      
      // Add form fields
      formDataToSend.append('type', data.type);
      formDataToSend.append('title', data.title);
      formDataToSend.append('description', data.description);
      formDataToSend.append('priority', data.priority);
      formDataToSend.append('applicationPage', data.applicationPage);
      
      // Add conditional fields based on type
      if (data.type === 'issue') {
        formDataToSend.append('os', data.os);
        formDataToSend.append('frequency', data.frequency);
        formDataToSend.append('stepsToReproduce', data.stepsToReproduce);
        formDataToSend.append('expectedBehavior', data.expectedBehavior);
        formDataToSend.append('actualBehavior', data.actualBehavior);
      } else if (data.type === 'feature') {
        formDataToSend.append('problemToSolve', data.problemToSolve);
        formDataToSend.append('proposedBehavior', data.proposedBehavior);
        formDataToSend.append('alternativesTried', data.alternativesTried);
      }
      
      // Add optional fields - use form data customerId or prop customerId
      const selectedCustomerId = data.customerId || customerId;
      if (projectId) formDataToSend.append('projectId', projectId.toString());
      if (selectedCustomerId) formDataToSend.append('customerId', selectedCustomerId.toString());
      
      // Add browser information automatically
      formDataToSend.append('browser', navigator.userAgent);
      
      // Add file if attached (single file only)
      if (data.files.length > 0) {
        formDataToSend.append('attachment', data.files[0]);
      }

      // Use fetch with credentials for multipart FormData
      const response = await fetch('/api/support-requests', {
        method: 'POST',
        body: formDataToSend,
        credentials: 'include', // Include session cookies
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to submit request';
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support-requests"] });
      toast({
        title: "Success",
        description: "Your request has been submitted successfully",
      });
      resetForm();
      onSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to submit request");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.type || !formData.title.trim() || !formData.description.trim() || !formData.priority) {
      showErrorToast("Please fill in all required fields");
      return;
    }

    // Application Page validation
    if (!formData.applicationPage || formData.applicationPage === "None") {
      showErrorToast("Please select an Application Page");
      return;
    }
    
    // Additional validation for support requests
    if (formData.type === 'issue') {
      if (!formData.stepsToReproduce.trim()) {
        showErrorToast("Steps to Reproduce is required for support requests");
        return;
      }
    }
    
    // Additional validation for feature requests
    if (formData.type === 'feature') {
      if (!formData.problemToSolve.trim()) {
        showErrorToast("'Problem It Solves' is required for feature requests");
        return;
      }
      if (!formData.proposedBehavior.trim()) {
        showErrorToast("'Proposed Behavior' is required for feature requests");
        return;
      }
    }

    // Single file validation (if uploaded)
    if (formData.files.length > 0) {
      const file = formData.files[0];
      
      // File size validation (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        showErrorToast(`File "${file.name}" too large. Maximum size is 2MB.`);
        return;
      }

      // File type validation
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        showErrorToast(`File "${file.name}" type not supported. Please use PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, GIF, or WebP files.`);
        return;
      }
    }

    submitMutation.mutate(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    
    if (!selectedFile) return;
    
    // Validate file size (2MB limit)
    if (selectedFile.size > 2 * 1024 * 1024) {
      showErrorToast(`File "${selectedFile.name}" exceeds 2MB limit`);
      return;
    }
    
    // Replace any existing file with the new one (single file only)
    setFormData(prev => ({ 
      ...prev, 
      files: [selectedFile]
    }));
    
    // Clear the input so the same file can be selected again
    e.target.value = '';
  };

  const removeFile = (indexToRemove: number) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, index) => index !== indexToRemove)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PocketKnife className="h-5 w-5 text-blue-600" />
            Submit Support Request or Feature Request
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Request Type - Full Width */}
          <div className="space-y-2">
            <Label htmlFor="type">Request Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value: "issue" | "feature") => 
                setFormData(prev => ({ ...prev, type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issue">Support Request</SelectItem>
                {canAccessFeatureRequests && (
                  <SelectItem value="feature">Feature Request</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* 2-Column Grid for Main Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief summary of your request"
                  required
                />
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: "low" | "medium" | "high" | "critical") => 
                    setFormData(prev => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Application Page */}
              <div className="space-y-2">
                <Label htmlFor="applicationPage">Application Page *</Label>
                <Select
                  value={formData.applicationPage}
                  onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, applicationPage: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select application page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    {navigation.map((navItem) => (
                      <SelectItem key={navItem.section} value={navItem.name}>
                        {navItem.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of your request or issue"
                  rows={3}
                  required
                />
              </div>

              {/* Customer Selection (for internal users or external users with accessible customers) */}
              {!customerId && (canAccessCustomers || isExternalUser) && (
                <div className="space-y-2">
                  <Label htmlFor="customer">Related Customer *</Label>
                  <Select
                    value={formData.customerId?.toString() || "none"}
                    onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, customerId: value === "none" ? undefined : parseInt(value) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.accountName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Conditional Fields Based on Request Type */}
          {formData.type === "issue" && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 border-t pt-4">Support Request Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* OS */}
                <div className="space-y-2">
                  <Label htmlFor="os">Operating System</Label>
                  <Select
                    value={formData.os}
                    onValueChange={(value: "windows" | "mac" | "linux") => 
                      setFormData(prev => ({ ...prev, os: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select OS" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="windows">Windows</SelectItem>
                      <SelectItem value="mac">MacOS</SelectItem>
                      <SelectItem value="linux">Linux</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Frequency */}
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select
                    value={formData.frequency}
                    onValueChange={(value: "Always" | "Often" | "Sometimes" | "Rarely") => 
                      setFormData(prev => ({ ...prev, frequency: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="How often does this occur?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Always">Always</SelectItem>
                      <SelectItem value="Often">Often</SelectItem>
                      <SelectItem value="Sometimes">Sometimes</SelectItem>
                      <SelectItem value="Rarely">Rarely</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Steps to Reproduce */}
              <div className="space-y-2">
                <Label htmlFor="stepsToReproduce">Steps to Reproduce *</Label>
                <Textarea
                  id="stepsToReproduce"
                  value={formData.stepsToReproduce}
                  onChange={(e) => setFormData(prev => ({ ...prev, stepsToReproduce: e.target.value }))}
                  placeholder="Please provide detailed steps to reproduce the issue"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Expected Behavior */}
                <div className="space-y-2">
                  <Label htmlFor="expectedBehavior">Expected Behavior</Label>
                  <Textarea
                    id="expectedBehavior"
                    value={formData.expectedBehavior}
                    onChange={(e) => setFormData(prev => ({ ...prev, expectedBehavior: e.target.value }))}
                    placeholder="What should happen?"
                    rows={3}
                  />
                </div>

                {/* Actual Behavior */}
                <div className="space-y-2">
                  <Label htmlFor="actualBehavior">Actual Behavior</Label>
                  <Textarea
                    id="actualBehavior"
                    value={formData.actualBehavior}
                    onChange={(e) => setFormData(prev => ({ ...prev, actualBehavior: e.target.value }))}
                    placeholder="What actually happens?"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {formData.type === "feature" && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 border-t pt-4">Feature Request Details</h4>
              
              {/* Problem It Solves */}
              <div className="space-y-2">
                <Label htmlFor="problemToSolve">Problem It Solves</Label>
                <Textarea
                  id="problemToSolve"
                  value={formData.problemToSolve}
                  onChange={(e) => setFormData(prev => ({ ...prev, problemToSolve: e.target.value }))}
                  placeholder="What problem would this feature solve?"
                  rows={3}
                />
              </div>

              {/* Proposed Behavior */}
              <div className="space-y-2">
                <Label htmlFor="proposedBehavior">Proposed Behavior</Label>
                <Textarea
                  id="proposedBehavior"
                  value={formData.proposedBehavior}
                  onChange={(e) => setFormData(prev => ({ ...prev, proposedBehavior: e.target.value }))}
                  placeholder="How should this feature work?"
                  rows={3}
                />
              </div>

              {/* Alternatives Tried */}
              <div className="space-y-2">
                <Label htmlFor="alternativesTried">Alternatives Tried</Label>
                <Textarea
                  id="alternativesTried"
                  value={formData.alternativesTried}
                  onChange={(e) => setFormData(prev => ({ ...prev, alternativesTried: e.target.value }))}
                  placeholder="What alternatives have you tried?"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Attachment Section - Smaller */}
          <div className="space-y-2">
            <Label htmlFor="file">Attachment (Optional)</Label>
            <div className="space-y-2">
              {formData.files.length === 0 ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                  <Label
                    htmlFor="file-upload"
                    className="cursor-pointer text-sm text-gray-600 hover:text-gray-900"
                  >
                    <span>Click to upload a file</span>
                    <Input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                    />
                  </Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Single file: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, GIF, WebP up to 2MB
                  </p>
                </div>
              ) : null}
              
              {/* Display Selected Files */}
              {formData.files.length > 0 && (
                <div className="space-y-2">
                  {formData.files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Upload className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-900">{file.name}</span>
                        <span className="text-xs text-gray-500">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={submitMutation.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PocketKnife className="h-4 w-4 mr-2" />
              )}
              Submit Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}