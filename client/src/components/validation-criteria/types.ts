export interface Solution {
  id: number;
  name: string;
  abbreviation?: string;
  description?: string;
  tags?: string[];
  isActive?: boolean;
  isSystem?: boolean;
  solutionIcon?: string;
  /** A lucide icon name, shown when there is no graphic (solutionIcon). */
  solutionIconName?: string | null;
  documentationLinkId?: number | null;
  docsRepoConfigId?: number | null;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  creatorFirstName?: string;
  creatorLastName?: string;
  creatorEmail?: string;
  updatedByFirstName?: string;
  updatedByLastName?: string;
  updatedByEmail?: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
  updatedByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
}

export interface CriteriaLibrary {
  id: number;
  name: string;
  description?: string;
  solutionIds?: number[];
  isAllSolutions?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  creatorFirstName?: string;
  creatorLastName?: string;
  creatorEmail?: string;
  updatedByFirstName?: string;
  updatedByLastName?: string;
  updatedByEmail?: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
  updatedByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
}

export interface ExpectedOutcome {
  id: number;
  name: string;
  description?: string;
  criteriaIds?: number[];
  solutionIds?: number[];
  isAllSolutions?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  creatorFirstName?: string;
  creatorLastName?: string;
  creatorEmail?: string;
  updatedByFirstName?: string;
  updatedByLastName?: string;
  updatedByEmail?: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
  updatedByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
}

export interface ActionItem {
  id: number;
  name: string;
  description?: string;
  outcomeIds?: number[];
  solutionIds?: number[];
  isAllSolutions?: boolean;
  created_date?: string;
  created_by?: string;
  isActive?: boolean;
  isSystem?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  creatorFirstName?: string;
  creatorLastName?: string;
  creatorEmail?: string;
  updatedByFirstName?: string;
  updatedByLastName?: string;
  updatedByEmail?: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
  updatedByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
}

export interface ComponentItem {
  id: number;
  name: string;
  description?: string;
  solutionIds?: number[];
  isAllSolutions?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  created_date?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  creatorFirstName?: string;
  creatorLastName?: string;
  creatorEmail?: string;
  updatedByFirstName?: string;
  updatedByLastName?: string;
  updatedByEmail?: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
  updatedByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
}

export interface ValueMapping {
  id: number;
  name: string;
  description?: string;
  solutionIds?: number[];
  isAllSolutions?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  creatorFirstName?: string;
  creatorLastName?: string;
  creatorEmail?: string;
  updatedByFirstName?: string;
  updatedByLastName?: string;
  updatedByEmail?: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
  updatedByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  } | null;
}

export type DialogType = "solution" | "component" | "value-mapping" | "criteria" | "outcome" | "action";

export interface FormData {
  name: string;
  abbreviation: string;
  description: string;
  solutionIds: number[];
  isAllSolutions: boolean;
  tags: string[];
  isActive: boolean;
  isSystem: boolean;
  solutionIcon: string;
  solutionIconName: string;
  documentationLinkId: number | null;
  docsRepoConfigId: number | null;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface ValidationCriteriaTabProps {
  solutions: Solution[];
  components: ComponentItem[];
  criteria: CriteriaLibrary[];
  expectedOutcomes: ExpectedOutcome[];
  actionItems: ActionItem[];
  isAdmin: boolean;
  userId?: string;
  onAdd: (type: DialogType, parentId?: number) => void;
  onEdit: (type: DialogType, item: any) => void;
  onDelete: (type: DialogType, id: number) => void;
  getTagColor: (tagName: string) => string;
  getProjectCount: (solutionName: string) => number;
}
