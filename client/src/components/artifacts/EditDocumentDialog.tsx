import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Edit, Upload, Building2, Package, GitBranch, BookMarked, FileText, File, X, Users, Swords, FileSpreadsheet, StickyNote, Trophy, MonitorPlay } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDateForDisplay } from "@/lib/date-utils";

interface EditDocumentData {
  id: number;
  givenName: string;
  description?: string;
  documentType?: string;
  solutionIds?: number[] | string[];
  accountIds?: number[] | null;
  originalName?: string;
  storedPath?: string;
  createdAt?: string;
  updatedAt?: string;
  owner?: string;
  isActive?: boolean;
}

interface EditDocumentDialogProps {
  document: EditDocumentData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditSuccess?: () => void;
}

export function EditDocumentDialog({ document, open, onOpenChange, onEditSuccess }: EditDocumentDialogProps) {
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

  const isCustomerRole = user?.role === "Customer";

  useEffect(() => {
    if (document) {
      setName(document.givenName);
      setDescription(document.description || "");
      setType(document.documentType || "");
      const normalizedSolutionIds = (document.solutionIds || []).map((id) => String(id));
      setSelectedSolutions(normalizedSolutionIds);
      setFile(null);
      setIsActive(document.isActive !== undefined ? document.isActive : true);

      if (document.accountIds === null || document.accountIds === undefined) {
        setIsNASelected(true);
        setSelectedAccounts([]);
      } else if (document.accountIds.length === 0) {
        setIsNASelected(false);
        setSelectedAccounts([]);
      } else {
        setIsNASelected(false);
        setSelectedAccounts(document.accountIds);
      }
    }
  }, [document]);

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

  const handleAccountToggle = (accountId: number) => {
    setIsNASelected(false);
    setSelectedAccounts((prev) => {
      const newSelection = prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
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

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!document) throw new Error("No document selected");

      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PUT",
        body: data,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update document");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["system-health-storage"] });
      showSuccessToast("Success", "Document updated successfully");
      onOpenChange(false);
      resetForm();
      onEditSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update document");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!document) {
      showErrorToast("Error", "No document selected for editing");
      return;
    }

    if (!name.trim()) {
      showErrorToast("Error", "Please enter a document name");
      return;
    }

    const formData = new FormData();
    formData.append("givenName", name.trim());
    formData.append("description", description);
    formData.append("documentType", type);
    formData.append("isActive", String(isActive));
    formData.append("solutionIds", JSON.stringify(selectedSolutions.map(id => parseInt(id)).filter(id => !isNaN(id))));

    let accountIdsToSend: number[] | null;
    if (isCustomerRole) {
      accountIdsToSend = document.accountIds !== undefined ? document.accountIds : null;
    } else if (isNASelected) {
      accountIdsToSend = null;
    } else {
      accountIdsToSend = selectedAccounts;
    }
    formData.append("accountIds", JSON.stringify(accountIdsToSend));

    if (file) {
      formData.append("file", file);
    }

    updateMutation.mutate(formData);
  };

  const handleSolutionChange = (productId: string) => {
    setSelectedSolutions((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
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

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Document
          </DialogTitle>
        </DialogHeader>

        {/* Read-only metadata block */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 border text-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created</p>
            <p className="text-foreground">{document.createdAt ? formatDateForDisplay(document.createdAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Last Updated</p>
            <p className="text-foreground">{document.updatedAt ? formatDateForDisplay(document.updatedAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created By</p>
            <p className="text-foreground">{document.owner || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Updated By</p>
            <p className="text-foreground">{document.owner || "—"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">Document Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter document name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the document"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type" className="text-sm font-medium">Document Type</Label>
            <Select value={type} onValueChange={setType}>
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

          <div className="space-y-2">
            <Label className="text-sm font-medium">Related Solutions</Label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
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
                  <Label htmlFor={`solution-${product.id}`} className="text-sm font-normal cursor-pointer flex items-center gap-2">
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
                Control which customer portals can see this document
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox id="account-na" checked={isNASelected} onCheckedChange={toggleNA} />
                  <Label htmlFor="account-na" className="text-sm font-semibold cursor-pointer text-gray-600">
                    N/A (Not visible in customer portals)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox id="account-all" checked={isAllAccountsSelected} onCheckedChange={toggleAllAccounts} />
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
                  {selectedAccounts.map((accountId) => {
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

          <div className="space-y-2">
            <Label htmlFor="file" className="text-sm font-medium">Replace File (Optional)</Label>
            <div className="space-y-2">
              <div className="text-xs text-gray-600">Current file: {document.originalName || "—"}</div>
              <Input
                id="file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif"
              />
              <div className="text-xs text-gray-500">
                Leave empty to keep the current file. Upload a new file to replace it.
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="doc-edit-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label
                htmlFor="doc-edit-active"
                className={`text-sm font-medium cursor-pointer ${isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}
              >
                {isActive ? "Active" : "Inactive"}
              </Label>
            </div>
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {updateMutation.isPending ? (
                  <>
                    <Upload className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Edit className="mr-2 h-4 w-4" />
                    Update Document
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
