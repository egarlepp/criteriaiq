import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { UseFormReturn } from "react-hook-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getTagColor, normalizeTagName } from "@/lib/tagUtils";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import type { Tag } from "@shared/schema";
import type { FormData } from "./types";

interface UseTagManagementParams {
  form: UseFormReturn<FormData>;
  allTags: Tag[] | undefined;
  toast: ReturnType<typeof useToast>["toast"];
}

/**
 * Custom hook to manage tag input, suggestions, and creation
 * Handles tag addition, removal, and suggested tags rotation
 */
export function useTagManagement({ form, allTags, toast }: UseTagManagementParams) {
  const [tagInput, setTagInput] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<Tag[]>([]);
  const [suggestedTagsIndex, setSuggestedTagsIndex] = useState(0);

  // Mutation to create custom tags
  const createTagMutation = useMutation({
    mutationFn: async (tagData: { name: string; color: string }) => {
      return await apiRequest("POST", "/api/tags", tagData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    },
  });

  // Update suggested tags whenever available tags change
  const updateSuggestedTags = () => {
    if (allTags && allTags.length > 0) {
      const currentTags = form.getValues("tags") || [];
      const filteredTags = allTags.filter(tag => !currentTags.includes(tag.name));
      if (filteredTags.length === 0) {
        setSuggestedTags([]);
        return;
      }

      const startIndex = suggestedTagsIndex % filteredTags.length;
      const endIndex = Math.min(startIndex + 5, filteredTags.length);
      const suggested = filteredTags.slice(startIndex, endIndex);

      // If we don't have enough tags, wrap around
      if (suggested.length < 5 && filteredTags.length > 5) {
        const remaining = 5 - suggested.length;
        const wrapped = filteredTags.slice(0, remaining);
        suggested.push(...wrapped);
      }

      setSuggestedTags(suggested);
    }
  };

  // Handle adding a tag
  const handleAddTag = async (tagName: string) => {
    const normalizedTag = normalizeTagName(tagName);
    const currentTags = form.getValues("tags") || [];

    if (!currentTags.includes(normalizedTag)) {
      // Check if this is a new custom tag (not in allTags)
      const existingTag = allTags?.find(
        tag => tag.name.toLowerCase() === normalizedTag.toLowerCase()
      );

      if (!existingTag) {
        // This is a new custom tag - save it to database
        try {
          await createTagMutation.mutateAsync({
            name: normalizedTag,
            color: getTagColor(normalizedTag), // Use the color from tagUtils for consistency
          });
          toast({
            title: "Success",
            description: `Custom tag "${normalizedTag}" created successfully`,
          });
        } catch (error) {
          console.error("Failed to create custom tag:", error);
          showErrorToast("Error", "Failed to create custom tag");
          return; // Don't add the tag to the form if creation failed
        }
      }

      form.setValue("tags", [...currentTags, normalizedTag]);
      // Update suggested tags after adding
      setTimeout(() => updateSuggestedTags(), 0);
    }
    setTagInput("");
  };

  // Handle removing a tag
  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tags") || [];
    form.setValue(
      "tags",
      currentTags.filter(tag => tag !== tagToRemove)
    );
    // Update suggested tags after removing
    setTimeout(() => updateSuggestedTags(), 0);
  };

  // Update suggested tags when available tags change or index changes
  useEffect(() => {
    updateSuggestedTags();
  }, [allTags, suggestedTagsIndex]);

  // Update suggested tags when form tags change
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "tags") {
        updateSuggestedTags();
      }
    });
    return () => subscription.unsubscribe();
  }, [form, allTags]);

  return {
    tagInput,
    setTagInput,
    suggestedTags,
    suggestedTagsIndex,
    setSuggestedTagsIndex,
    handleAddTag,
    handleRemoveTag,
    updateSuggestedTags,
  };
}
