import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Upload, Building2, Package, GitBranch, BookMarked, FileText, File, X, Users, Swords, FileSpreadsheet, StickyNote, Trophy, MonitorPlay } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDateForDisplay } from "@/lib/date-utils";

interface UploadDocumentDialogProps {
  trigger?: React.ReactNode;
  projectId?: number;
  customerId?: number;
  onUploadSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UploadDocumentDialog({ trigger, projectId, customerId, onUploadSuccess, open: controlledOpen, onOpenChange }: UploadDocumentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("");
  const [selectedSolutions, setSelectedSolutions] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [isNASelected, setIsNASelected] = useState(true);
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Outside users (Customer, Guest, Partner) upload through their account's route.
  const isCustomerRole = ["Customer", "Guest", "Partner"].includes(user?.role ?? "");

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", { showInactive: false }],
    queryFn: () => apiRequest("GET", "/api/products?showInactive=false"),
    staleTime: 0,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
    staleTime: 0,
    enabled: !isCustomerRole,
  });

  const isAllAccountsSelected = selectedAccounts.length === 0 && !isNASelected;

  const uploadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: data,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to upload document');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["system-health-storage"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }
      showSuccessToast("Success", "Document uploaded successfully");
      setOpen(false);
      resetForm();
      onUploadSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to upload document");
    },
  });

  const resetForm = () => {
    setName("");
    setFile(null);
    setType("");
    setSelectedSolutions([]);
    setSelectedAccounts([]);
    setIsNASelected(true);
    setDescription("");
    setIsActive(true);
  };

  const handleAccountToggle = (accountId: number) => {
    setIsNASelected(false);
    setSelectedAccounts(prev => {
      const newSelection = prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId];
      return newSelection;
    });
  };

  const toggleNA = () => {
    setIsNASelected(true);
    setSelectedAccounts([]);
  };

  const toggleAllAccounts = () => {
    setIsNASelected(false);
    setSelectedAccounts([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file || !name.trim() || !type) {
      showErrorToast("Please fill in all required fields");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      showErrorToast("File size must be less than 5MB");
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'uploads_documents');
      formData.append('givenName', name.trim());
      formData.append('documentType', type);
      formData.append('description', description || '');
      formData.append('isActive', String(isActive));
      formData.append('solutionIds', JSON.stringify(selectedSolutions.map(id => parseInt(id)).filter(id => !isNaN(id))));
      
      let accountIdsToSend: number[] | null;
      if (isCustomerRole && customerId) {
        accountIdsToSend = [customerId];
      } else if (isNASelected) {
        accountIdsToSend = null;
      } else {
        accountIdsToSend = selectedAccounts;
      }
      formData.append('accountIds', JSON.stringify(accountIdsToSend));
      
      if (projectId) {
        formData.append('projectId', projectId.toString());
      }

      console.log('Uploading document with data:', {
        fileName: file.name,
        fileSize: file.size,
        givenName: name.trim(),
        documentType: type,
        folder: 'uploads_documents',
        customerId,
        projectId,
        accountIds: accountIdsToSend
      });

      const uploadUrl = (isCustomerRole && customerId)
        ? `/api/customers/${customerId}/documents`
        : '/api/documents';

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to upload document');
      }

      const result = await response.json();
      console.log('Upload successful:', result);

      showSuccessToast("Document uploaded successfully");

      setName("");
      setFile(null);
      setType("");
      setSelectedSolutions([]);
      setSelectedAccounts([]);
      setDescription("");
      setOpen(false);

      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["system-health-storage"] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "documents"] });
      }
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (error) {
      console.error('Upload error:', error);
      showErrorToast("Upload failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleSolutionToggle = (productId: string) => {
    setSelectedSolutions(prev => 
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleAllSolutions = () => {
    if (isAllSolutionsSelected) {
      setSelectedSolutions([]);
    } else {
      setSelectedSolutions(products.map((p: any) => p.id.toString()));
    }
  };

  const isAllSolutionsSelected = products.length > 0 && selectedSolutions.length === products.length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) {
        showErrorToast("Error", "File size must be less than 5MB");
        return;
      }
      setFile(selectedFile);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Upload Document
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Given Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a descriptive name for this document"
              required
            />
          </div>

          <div>
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mp3,.wav"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Maximum file size: 5MB</p>
          </div>

          <div>
            <Label htmlFor="type">Type *</Label>
            <Select value={type} onValueChange={setType} required>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Architecture"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-500" />Architecture</div></SelectItem>
                <SelectItem value="Product Info"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-purple-500" />Product Info</div></SelectItem>
                <SelectItem value="Visio"><div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-orange-500" />Visio</div></SelectItem>
                <SelectItem value="Reference"><div className="flex items-center gap-2"><BookMarked className="h-4 w-4 text-green-500" />Reference</div></SelectItem>
                <SelectItem value="Documentation"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-cyan-500" />Documentation</div></SelectItem>
                <SelectItem value="Battlecard"><div className="flex items-center gap-2"><Swords className="h-4 w-4 text-orange-500" />Battlecard</div></SelectItem>
                <SelectItem value="Datasheet"><div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-blue-500" />Datasheet</div></SelectItem>
                <SelectItem value="Internal Notes"><div className="flex items-center gap-2"><StickyNote className="h-4 w-4 text-yellow-500" />Internal Notes</div></SelectItem>
                <SelectItem value="Win/Loss Info"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-emerald-500" />Win/Loss Info</div></SelectItem>
                <SelectItem value="Demo Notes"><div className="flex items-center gap-2"><MonitorPlay className="h-4 w-4 text-purple-500" />Demo Notes</div></SelectItem>
                <SelectItem value="Other"><div className="flex items-center gap-2"><File className="h-4 w-4 text-slate-500" />Other</div></SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Solutions</Label>
            <div className="grid grid-cols-1 gap-2 mt-2 max-h-32 overflow-y-auto border rounded-md p-3">
              <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                <Checkbox
                  id="solution-all"
                  checked={isAllSolutionsSelected}
                  onCheckedChange={toggleAllSolutions}
                />
                <Label htmlFor="solution-all" className="text-sm font-semibold cursor-pointer">
                  All Solutions
                </Label>
              </div>

              {Array.isArray(products) && products.map((product: any) => (
                <div key={product.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`solution-${product.id}`}
                    checked={selectedSolutions.includes(product.id.toString())}
                    onCheckedChange={() => handleSolutionToggle(product.id.toString())}
                  />
                  <Label htmlFor={`solution-${product.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                    <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={`${product.name} icon`} className="w-5 h-5 shrink-0" />
                    {product.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {!isCustomerRole && (
            <div>
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-500" />
                Accounts
              </Label>
              <div className="grid grid-cols-1 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-md p-3">
                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox
                    id="account-na"
                    checked={isNASelected}
                    onCheckedChange={toggleNA}
                  />
                  <Label htmlFor="account-na" className="text-sm font-semibold cursor-pointer text-gray-600">
                    N/A (Not shown in customer portals)
                  </Label>
                </div>

                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox
                    id="account-all"
                    checked={isAllAccountsSelected}
                    onCheckedChange={toggleAllAccounts}
                  />
                  <Label htmlFor="account-all" className="text-sm font-semibold cursor-pointer">
                    All Accounts
                  </Label>
                </div>

                {Array.isArray(accounts) && accounts.map((account: any) => (
                  <div key={account.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`account-${account.id}`}
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={() => handleAccountToggle(account.id)}
                    />
                    <Label htmlFor={`account-${account.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                      {account.logoUrl ? (
                        <img 
                          src={account.logoUrl}
                          alt={`${account.accountName} logo`}
                          className="w-5 h-5 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <Building2 className="h-4 w-4 text-gray-400" />
                      )}
                      {account.accountName}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Select "N/A" to exclude from customer portals, "All Accounts" to show to all accounts, or choose specific accounts.</p>
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter a description for this document"
              className="w-full mt-1 p-2 border border-gray-300 rounded-md text-sm field-sizing-content min-h-[60px] max-h-[300px] overflow-y-auto resize-none"
            />
          </div>

          <div className="flex justify-between items-center pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="doc-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label
                htmlFor="doc-active"
                className={`text-sm font-medium cursor-pointer ${isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}
              >
                {isActive ? "Active" : "Inactive"}
              </Label>
            </div>
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploadMutation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {uploadMutation.isPending ? (
                  <Upload className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload Document
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
