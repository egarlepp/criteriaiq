import React from "react";
import { UseFormReturn } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import type { FormData } from "./types";
import { parseProjectWorkingDays } from "@shared/project-duration";

// Loose shapes used by the template-loaded hook. Templates persist arbitrary
// document/link metadata in localStorage, so we only constrain the fields the
// hook actually reads / writes.
type TemplateUploadedFile = {
  name?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  isExistingDocument?: boolean;
  documentId?: number | string;
  documentData?: unknown;
};

interface UseTemplateHandlingParams {
  form: UseFormReturn<FormData>;
  toast: ReturnType<typeof useToast>["toast"];
  onSolutionChange?: (solutions: string[]) => void;
  setSelectedDocuments: React.Dispatch<React.SetStateAction<any[]>>;
  setUploadedFiles: React.Dispatch<
    React.SetStateAction<Array<File | TemplateUploadedFile>>
  >;
  setProjectLinks: React.Dispatch<
    React.SetStateAction<
      Array<{
        linkType: string;
        url: string;
        description: string;
        name?: string;
        linkId?: string;
      }>
    >
  >;
  /** Receives the template's duration in working days (null = not set). */
  setPlannedWorkingDays?: (days: number | null) => void;
}

/**
 * Custom hook to manage template selection and application
 * Handles loading template data and populating form fields
 */
export function useTemplateHandling({
  form,
  toast,
  onSolutionChange,
  setSelectedDocuments,
  setUploadedFiles,
  setProjectLinks,
  setPlannedWorkingDays,
}: UseTemplateHandlingParams) {
  /**
   * Handle template selection - Load comprehensive template data from localStorage
   */
  const handleTemplateSelection = (templateId: string) => {
    try {
      // Load the comprehensive template data from localStorage
      const savedTemplate = localStorage.getItem(`template_${templateId}`);
      if (!savedTemplate) {
        showErrorToast("Template not found", "This template data is not available. Please try using a saved template.");
        return;
      }

      const templateData = JSON.parse(savedTemplate);
      console.log("Loading template from dropdown:", templateData);

      // Populate all form fields with comprehensive template data
      form.setValue("businessProblem", templateData.businessProblem || "");
      form.setValue("solutionDescription", templateData.solutionDescription || "");
      form.setValue("customerObjective", templateData.customerObjective || "");
      form.setValue("policyConsiderations", templateData.policyConsiderations || "");
      form.setValue("notes", templateData.notes || "");
      form.setValue("tags", templateData.tags || []);
      form.setValue("type", templateData.type || "");
      form.setValue("environment", templateData.environment || "");

      // Set solution names (do NOT set industry - let user select manually)
      if (templateData.solutionName && Array.isArray(templateData.solutionName)) {
        form.setValue("solutionName", templateData.solutionName);
        if (onSolutionChange) {
          onSolutionChange(templateData.solutionName);
        }
      }

      // Set project documents from template
      if (templateData.projectDocuments && Array.isArray(templateData.projectDocuments)) {
        console.log("Setting project documents from template dropdown:", templateData.projectDocuments);
        setSelectedDocuments(templateData.projectDocuments);
        const templateDocuments = templateData.projectDocuments.map((doc: any) => ({
          name: doc.givenName || doc.fileName || `Document ${doc.id}`,
          size: doc.fileSize || 0,
          type: doc.fileType || "application/octet-stream",
          lastModified: new Date(doc.createdAt || Date.now()).getTime(),
          isExistingDocument: true,
          documentId: doc.id,
          documentData: doc,
        }));
        setUploadedFiles(templateDocuments);
        form.setValue("uploadedFiles", templateDocuments, { shouldDirty: true });
      }

      // Set project links from template
      if (templateData.projectLinks && Array.isArray(templateData.projectLinks)) {
        setProjectLinks(templateData.projectLinks);
      }

      setPlannedWorkingDays?.(parseProjectWorkingDays(templateData.durationWorkingDays));

      // Notify parent component about success criteria if available
      if (templateData.successCriteria && Array.isArray(templateData.successCriteria)) {
        // Store it in sessionStorage so the parent component can pick it up
        sessionStorage.setItem(
          "templateSuccessCriteria",
          JSON.stringify(templateData.successCriteria)
        );

        // Trigger a custom event to notify the parent
        window.dispatchEvent(
          new CustomEvent("templateSuccessCriteriaLoaded", {
            detail: templateData.successCriteria,
          })
        );
      }

      toast({
        title: "Template applied",
        description: `Template "${templateData.name}" has been applied. All fields have been populated and are editable.`,
      });
    } catch (error) {
      console.error("Error loading template:", error);
      showErrorToast("Error loading template", "Failed to load template data. Please try again.");
    }
  };

  return {
    handleTemplateSelection,
  };
}
