/**
 * Project Form Module - Barrel Export
 * 
 * This module provides a clean, organized structure for the project form
 * with all related components, utilities, types, and hooks.
 */

// Main component
export { ProjectForm } from "./project-form";

// Sub-components
export { ProjectDocumentSelector } from "./project-document-selector";
export { ProjectLinkSelector } from "./project-link-selector";
export { MapTemplateSelector } from "./MapTemplateSelector";
export { MapTemplateSummary } from "./MapTemplateSummary";
export { MapDrawer } from "./MapDrawer";

// Types and schema
export type {
  FormData,
  ProjectFormProps,
  UploadFormData,
  ProjectLink,
  ConfirmationDialogState,
  CustomerUser,
  UserWithId,
  ApiUser,
  ApiCustomer,
  ApiIndustry,
  ApiTemplate,
  ApiRole,
  ApiComplianceRegulation,
} from "./types";
export { formSchema } from "./types";

// Utilities
export {
  formatDateForInput,
  calculateTotalDays,
  countWorkingDays,
} from "./utils";

// Custom hooks
export { useProjectFormData } from "./useProjectFormData";
export { useTagManagement } from "./useTagManagement";
export { useTemplateHandling } from "./useTemplateHandling";
