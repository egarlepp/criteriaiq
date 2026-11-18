import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState } from "react";
import { formatDateForDisplay } from "@/lib/date-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { TiptapEditor } from "@/components/rich-text/TiptapEditor";
import {
  FolderCode,
  Code,
  Terminal,
  FileJson,
  FileCode,
  Database,
  Settings,
  FileText,
  Braces,
  Hash,
  X,
  Users
} from "lucide-react";

interface UploadCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

const scriptTypes = [
  { value: "PowerShell", label: "PowerShell", icon: Terminal, color: "text-blue-500" },
  { value: "JavaScript", label: "JavaScript", icon: FileCode, color: "text-yellow-500" },
  { value: "TypeScript", label: "TypeScript", icon: FileCode, color: "text-blue-600" },
  { value: "Python", label: "Python", icon: Code, color: "text-green-500" },
  { value: "Bash", label: "Bash / Shell", icon: Terminal, color: "text-gray-600" },
  { value: "JSON", label: "JSON", icon: FileJson, color: "text-orange-500" },
  { value: "SQL", label: "SQL", icon: Database, color: "text-purple-500" },
  { value: "YAML", label: "YAML", icon: Settings, color: "text-pink-500" },
  { value: "XML", label: "XML", icon: Braces, color: "text-red-500" },
  { value: "CSS", label: "CSS", icon: Hash, color: "text-cyan-500" },
  { value: "HTML", label: "HTML", icon: FileText, color: "text-orange-600" },
  { value: "Go", label: "Go", icon: Code, color: "text-sky-500" },
  { value: "Rust", label: "Rust", icon: Code, color: "text-amber-600" },
  { value: "C#", label: "C#", icon: Code, color: "text-violet-500" },
  { value: "Other", label: "Other", icon: FileText, color: "text-slate-500" },
];

export function UploadCodeDialog({ open, onOpenChange, onUploadSuccess }: UploadCodeDialogProps) {
  const [name, setName] = useState("");
  const [scriptType, setScriptType] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSolutions, setSelectedSolutions] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [isNASelected, setIsNASelected] = useState(true);
  const [isActive, setIsActive] = useState(true);
  
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isCustomerRole = user?.role === "Customer";

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
  const isAllSolutionsSelected = products.length > 0 && selectedSolutions.length === products.length;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/code-scripts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/code-scripts"] });
      showSuccessToast("Code script created successfully");
      onOpenChange(false);
      resetForm();
      onUploadSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error creating code script", error.message || "Failed to create code script");
    },
  });

  const resetForm = () => {
    setName("");
    setScriptType("");
    setContent("");
    setDescription("");
    setSelectedSolutions([]);
    setSelectedAccounts([]);
    setIsNASelected(true);
    setIsActive(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showErrorToast("Error", "Please enter a name for the code script");
      return;
    }

    if (!scriptType) {
      showErrorToast("Error", "Please select a script type");
      return;
    }

    if (!content.trim()) {
      showErrorToast("Error", "Please enter the code content");
      return;
    }

    let accountIdsToSend: number[] | null;
    if (isCustomerRole) {
      accountIdsToSend = null;
    } else if (isNASelected) {
      accountIdsToSend = null;
    } else {
      accountIdsToSend = selectedAccounts;
    }

    const payload = {
      name: name.trim(),
      scriptType,
      content: content,
      description: description.trim(),
      solutionIds: selectedSolutions.map(id => parseInt(id)),
      accountIds: accountIdsToSend,
      isActive,
      owner: user?.role || "Unknown",
      ownerId: user?.id || "",
    };

    createMutation.mutate(payload);
  };

  const handleSolutionChange = (productId: string) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderCode className="h-5 w-5 text-blue-600" />
            Create Code Script
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter script name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scriptType" className="text-sm font-medium">Script Type *</Label>
              <Select value={scriptType} onValueChange={setScriptType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select script type" />
                </SelectTrigger>
                <SelectContent>
                  {scriptTypes.map((type) => {
                    const IconComponent = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <IconComponent className={`h-4 w-4 ${type.color}`} />
                          {type.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the code script"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content" className="text-sm font-medium">Code Content *</Label>
            <TiptapEditor
              value={content}
              onChange={setContent}
              toolbar="code"
              size="md"
              minHeight="200px"
              maxHeight="400px"
              placeholder="Click 'Insert Code Block' to add syntax-highlighted code..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Related Solutions</Label>
            <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
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
              {products.map((product: any) => (
                <div key={product.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`solution-${product.id}`}
                    checked={selectedSolutions.includes(product.id.toString())}
                    onCheckedChange={() => handleSolutionChange(product.id.toString())}
                  />
                  <Label
                    htmlFor={`solution-${product.id}`}
                    className="text-sm font-normal cursor-pointer flex items-center gap-2"
                  >
                    <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={`${product.name} icon`} className="w-5 h-5 shrink-0" />
                    {product.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {!isCustomerRole && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Account Assignment
              </Label>
              <div className="text-xs text-gray-500 mb-2">
                Control which customer portals can see this code script
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox
                    id="account-na"
                    checked={isNASelected}
                    onCheckedChange={toggleNA}
                  />
                  <Label htmlFor="account-na" className="text-sm font-semibold cursor-pointer text-gray-600">
                    N/A (Not visible in customer portals)
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
                {accounts.map((account: any) => (
                  <div key={account.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`account-${account.id}`}
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={() => handleAccountToggle(account.id)}
                    />
                    <Label htmlFor={`account-${account.id}`} className="text-sm font-normal cursor-pointer">
                      {account.accountName || account.businessName}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedAccounts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedAccounts.map(accountId => {
                    const account = accounts.find((a: any) => a.id === accountId);
                    return account ? (
                      <span
                        key={accountId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs"
                      >
                        {account.accountName || account.businessName}
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-blue-900 dark:hover:text-blue-100"
                          onClick={() => handleAccountToggle(accountId)}
                        />
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="code-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label
                htmlFor="code-active"
                className={`text-sm font-medium cursor-pointer ${isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}
              >
                {isActive ? "Active" : "Inactive"}
              </Label>
            </div>
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <FolderCode className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FolderCode className="mr-2 h-4 w-4" />
                    Create Script
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}