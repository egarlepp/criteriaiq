import { useState, useEffect } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Tag } from "@shared/schema";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Search,
  Hash,
  Palette
} from "lucide-react";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";

const tagFormSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(100, "Tag name must be less than 100 characters"),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Please enter a valid hex color"),
  description: z.string().optional(),
});

type TagFormData = z.infer<typeof tagFormSchema>;

const colorOptions = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

export default function Tags() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteTagId, setPendingDeleteTagId] = useState<number | null>(null);

  const form = useForm<TagFormData>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      name: "",
      color: "#3B82F6",
      description: "",
    },
  });

  // Fetch tags
  const { data: tags, isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    enabled: isAuthenticated,
  });

  // State for consolidated tags from all system areas
  const [allSystemTags, setAllSystemTags] = useState<string[]>([]);

  // Consolidate tags from all sources
  useEffect(() => {
    if (isAuthenticated) {
      // Sample tags from different areas - in real app, these would come from APIs
      const templateTags = ["Security", "Compliance", "Backup", "Monitoring"]; // From templates
      const productTags = ["DLP", "Analytics", "Performance", "Integration"]; // From success criteria products
      const criteriaSystemTags = ["Reporting", "Management", "Audit", "Training"]; // From criteria library
      const dbTags = tags?.map(tag => tag.name) || []; // From tag management system

      const consolidated = Array.from(new Set([...templateTags, ...productTags, ...criteriaSystemTags, ...dbTags]));
      setAllSystemTags(consolidated);
    }
  }, [tags, isAuthenticated]);

  // Create/Update tag mutation
  const tagMutation = useMutation({
    mutationFn: async (tagData: TagFormData) => {
      const url = editingTag ? `/api/tags/${editingTag.id}` : "/api/tags";
      const method = editingTag ? "PATCH" : "POST";

      return await apiRequest(method, url, {
        ...tagData,
        createdBy: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({
        title: editingTag ? "Tag Updated" : "Tag Created",
        description: `Tag "${form.getValues("name")}" has been ${editingTag ? "updated" : "created"} successfully.`,
      });
      setIsDialogOpen(false);
      setEditingTag(null);
      form.reset();
    },
    onError: (error) => {
      showErrorToast("Error", error.message || "Failed to save tag");
    },
  });

  // Delete tag mutation
  const deleteMutation = useMutation({
    mutationFn: async (tagId: number) => {
      return await apiRequest("DELETE", `/api/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({
        title: "Tag Deleted",
        description: "Tag has been deleted successfully.",
      });
    },
    onError: (error) => {
      showErrorToast("Error", error.message || "Failed to delete tag");
    },
  });

  const filteredTags = tags?.filter(tag => 
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tag.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Filter consolidated system tags based on search
  const filteredSystemTags = allSystemTags.filter(tag =>
    tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Color mapping for system tags to match success criteria
  const getTagColor = (tagName: string) => {
    const tagColors = {
      "Security": "#EF4444",
      "Compliance": "#3B82F6", 
      "DLP": "#10B981",
      "Backup": "#F59E0B",
      "Monitoring": "#8B5CF6",
      "Analytics": "#EC4899",
      "Performance": "#06B6D4",
      "Reporting": "#84CC16",
      "Integration": "#F97316",
      "Management": "#6366F1",
      "Audit": "#F59E0B",
      "Training": "#8B5CF6"
    };
    return tagColors[tagName as keyof typeof tagColors] || "#64748B";
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    form.reset({
      name: tag.name,
      color: tag.color || "#3B82F6",
      description: tag.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: TagFormData) => {
    tagMutation.mutate(data);
  };

  const handleDelete = (tagId: number) => {
    setPendingDeleteTagId(tagId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTag = () => {
    if (pendingDeleteTagId !== null) {
      deleteMutation.mutate(pendingDeleteTagId);
      setPendingDeleteTagId(null);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingTag(null);
    form.reset();
  };

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen text-gray-600 dark:text-gray-400">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-gray-600 dark:text-gray-400">Please log in to manage tags.</div>;
  }

  return (
    <div className="space-y-6">
      <Header 
        title="Tag Management" 
        subtitle="Create and manage tags for organizing your POCs"
      />

      <div className="p-6 h-screen overflow-y-auto">
        <div className="w-full">
          {/* Header Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 text-gray-400 dark:text-gray-500" size={16} />
              <Input
                placeholder="Search tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setEditingTag(null)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingTag ? "Edit Tag" : "Create New Tag"}
                  </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tag Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter tag name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              <div className="flex items-center space-x-2">
                                <div 
                                  className="w-8 h-8 rounded border"
                                  style={{ backgroundColor: field.value }}
                                />
                                <Input 
                                  placeholder="#3B82F6" 
                                  {...field}
                                  className="font-mono"
                                />
                              </div>
                              <div className="grid grid-cols-5 gap-2">
                                {colorOptions.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color }}
                                    onClick={() => field.onChange(color)}
                                  />
                                ))}
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe when to use this tag..."
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center space-x-2 pt-4">
                      <Button 
                        type="submit" 
                        disabled={tagMutation.isPending}
                        className="flex-1"
                      >
                        {tagMutation.isPending ? "Saving..." : (editingTag ? "Update Tag" : "Create Tag")}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={handleDialogClose}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* System Tags Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Hash className="h-5 w-5" />
              All System Tags ({filteredSystemTags.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {filteredSystemTags.map((tag) => (
                <Badge 
                  key={tag}
                  variant="secondary" 
                  className="text-sm text-white rounded-full px-3 py-1"
                  style={{ backgroundColor: getTagColor(tag) }}
                >
                  {tag}
                </Badge>
              ))}
              {filteredSystemTags.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No tags found matching your search.</p>
              )}
            </div>
          </div>

          {/* Managed Tags Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Palette className="h-5 w-5" />
              Managed Tags ({filteredTags.length})
            </h3>
            {tagsLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading tags...</p>
            </div>
          ) : filteredTags.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Hash className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {searchTerm ? "No tags found" : "No tags created yet"}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  {searchTerm 
                    ? "Try adjusting your search criteria."
                    : "Create your first tag to start organizing your POCs."
                  }
                </p>
                {!searchTerm && (
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Tag
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTags.map((tag) => (
                <Card key={tag.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <Badge 
                        className="text-white font-medium"
                        style={{ backgroundColor: tag.color || '#6B7280' }}
                      >
                        <Hash className="h-3 w-3 mr-1" />
                        {tag.name}
                      </Badge>
                      <ResponsiveTableActionsMenu
                        actions={[
                          {
                            id: 'edit',
                            label: 'Edit tag',
                            icon: Edit2,
                            onClick: () => handleEdit(tag)
                          },
                          {
                            id: 'delete',
                            label: 'Delete tag',
                            icon: Trash2,
                            onClick: () => handleDelete(tag.id),
                            variant: 'destructive'
                          }
                        ]}
                      />
                    </div>

                    {tag.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{tag.description}</p>
                    )}

                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Created {tag.createdAt ? new Date(tag.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Delete Tag Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Tag"
        description="Are you sure you want to delete this tag? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTag}
        onCancel={() => setPendingDeleteTagId(null)}
        variant="destructive"
      />
    </div>
  );
}