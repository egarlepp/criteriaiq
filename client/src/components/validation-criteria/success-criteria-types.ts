export interface Product {
  id: number;
  name: string;
  description?: string;
  isActive?: boolean;
  tags?: string[];
  solutionIcon?: string;
}

export interface ComponentEntity {
  id: number;
  productId: number;
  name: string;
  description?: string;
}

export interface CriteriaLibrary {
  id: number;
  productId: number;
  name: string;
  description?: string;
}

export interface ExpectedOutcome {
  id: number;
  criteriaId: number;
  name: string;
  description?: string;
}

export interface ActionItem {
  id: number;
  expectedOutcomeId: number;
  name: string;
  description?: string;
}

export interface SuccessCriteria {
  id?: number;
  projectId?: number;
  productId?: number | null;
  productName: string;
  componentId?: number | null;
  componentName?: string;
  valueMappingId?: number | null;
  valueMappingName?: string | null;
  criterion: string;
  expectedOutcome: string;
  actionItem: string;
  status: string;
  /** must_have (default) or nice_to_have; see shared/value-journey.ts. */
  priority?: string;
  criteriaId: number | null;
  expectedOutcomeId: number | null;
  actionItemId: number | null;
  notes?: string | null;
  isActive?: boolean;
  lineNumber?: number | null;
  tempId?: string;
  // Inner flags are optional because callers (template loading,
  // form initialization) populate only the subset of fields they
  // know about. The form reads them with optional chaining.
  activeFields?: {
    component?: boolean;
    valueMapping?: boolean;
    expectedOutcome?: boolean;
    actionItem?: boolean;
  };
  showHiddenFields?: {
    component?: boolean;
    criteria?: boolean;
    expectedOutcome?: boolean;
    actionItem?: boolean;
  };
}

export interface SuccessCriteriaFormProps {
  criteria: Partial<SuccessCriteria>[];
  onChange: (criteria: Partial<SuccessCriteria>[]) => void;
  selectedSolutions?: string[];
  showExistingCriteria?: boolean;
  dependencyCount?: number;
  projectDependencies?: {
    id: number;
    showOnSuccessCriteria?: boolean;
    successCriteriaId?: number | null;
    successCriteriaIds?: number[] | null;
    [key: string]: any;
  }[];
}
