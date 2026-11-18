/**
 * Link Type Normalization Utilities
 * 
 * NORMALIZATION ARCHITECTURE:
 * - Internal frontend format uses UNDERSCORED link types (solution_component, criteria_outcome, etc.)
 * - Database stores HYPHENATED link types (solution-component, criteria-outcome, etc.) for backward compatibility
 * - normalizeLinks() converts hyphens → underscores when data enters frontend (API → UI)
 * - denormalizeLinks() converts underscores → hyphens when data exits frontend (UI → API)
 * - This ensures all link comparisons and logic work correctly with consistent internal format
 */

/**
 * EDGE_TYPES constants define the internal (underscored) link type format
 */
export const EDGE_TYPES = {
  SComp: "solution_component",    // Solution → Component
  SC: "solution_criteria",        // Solution → Criteria (direct)
  CC: "component_criteria",       // Component → Criteria
  CO: "criteria_outcome",         // Criteria → Expected Outcome
  OA: "outcome_action",           // Expected Outcome → Action
  CA: "criteria_action",          // Criteria → Action (direct, when outcomes skipped)
  SVM: "solution_value_mapping",  // Solution → Value Mapping (direct)
  CompVM: "component_value_mapping", // Component → Value Mapping
  VMC: "value_mapping_criteria",  // Value Mapping → Criteria
} as const;

/**
 * Normalize a single link type by replacing hyphens with underscores
 * Database format (solution-component) → Frontend format (solution_component)
 */
export const normalizeLinkType = (linkType: string): string => {
  if (!linkType) return linkType;
  return linkType.replace(/-/g, '_');
};

/**
 * Denormalize a single link type by replacing underscores with hyphens
 * Frontend format (solution_component) → Database format (solution-component)
 */
export const denormalizeLinkType = (linkType: string): string => {
  if (!linkType) return linkType;
  return linkType.replace(/_/g, '-');
};

/**
 * Normalize all links in an array (API → Frontend)
 * Converts hyphenated link types to underscored format for internal use
 */
export const normalizeLinks = (links: any[]): any[] => {
  if (!Array.isArray(links)) return [];
  return links.map(link => ({
    ...link,
    type: normalizeLinkType(link.type)
  }));
};

/**
 * Denormalize all links in an array (Frontend → API)
 * Converts underscored link types back to hyphenated format for database storage
 */
export const denormalizeLinks = (links: any[]): any[] => {
  if (!Array.isArray(links)) return [];
  return links.map(link => ({
    ...link,
    type: denormalizeLinkType(link.type)
  }));
};

/**
 * Build links array from embedded relationship data in entities
 * This constructs the globalLibrary.links array from the relationship IDs embedded in each entity
 * 
 * @param entities - Object containing arrays of solutions, components, criteria, outcomes, and actions
 * @returns Array of link objects with fromId, toId, and type (in underscored format)
 */
export const buildLinksFromEntities = (entities: {
  solution?: any[],
  component?: any[],
  value_mapping?: any[],
  criteria?: any[],
  outcome?: any[],
  action?: any[]
}): any[] => {
  const links: any[] = [];
  
  // Build solution → component links
  if (entities.component && Array.isArray(entities.component)) {
    entities.component.forEach((component: any) => {
      if (component.solutionIds && Array.isArray(component.solutionIds) && component.id) {
        component.solutionIds.forEach((solutionId: number) => {
          links.push({
            fromId: solutionId,
            toId: component.id,
            type: EDGE_TYPES.SComp // Already in underscored format
          });
        });
      }
    });
  }
  
  // Build solution/component → value_mapping links
  if (entities.value_mapping && Array.isArray(entities.value_mapping)) {
    entities.value_mapping.forEach((vm: any) => {
      if (vm.solutionIds && Array.isArray(vm.solutionIds) && vm.id) {
        vm.solutionIds.forEach((solutionId: number) => {
          links.push({
            fromId: solutionId,
            toId: vm.id,
            type: EDGE_TYPES.SVM
          });
        });
      }
    });
  }

  // Build solution → criteria links (direct)
  if (entities.criteria && Array.isArray(entities.criteria)) {
    entities.criteria.forEach((criteria: any) => {
      if (criteria.solutionIds && Array.isArray(criteria.solutionIds) && criteria.id) {
        criteria.solutionIds.forEach((solutionId: number) => {
          links.push({
            fromId: solutionId,
            toId: criteria.id,
            type: EDGE_TYPES.SC // Already in underscored format
          });
        });
      }
    });
  }
  
  // Build criteria → outcome links
  if (entities.outcome && Array.isArray(entities.outcome)) {
    entities.outcome.forEach((outcome: any) => {
      if (outcome.criteriaIds && Array.isArray(outcome.criteriaIds) && outcome.id) {
        outcome.criteriaIds.forEach((criteriaId: number) => {
          links.push({
            fromId: criteriaId,
            toId: outcome.id,
            type: EDGE_TYPES.CO // Already in underscored format
          });
        });
      }
    });
  }
  
  // Build outcome → action links
  if (entities.action && Array.isArray(entities.action)) {
    entities.action.forEach((action: any) => {
      if (action.outcomeIds && Array.isArray(action.outcomeIds) && action.id) {
        action.outcomeIds.forEach((outcomeId: number) => {
          links.push({
            fromId: outcomeId,
            toId: action.id,
            type: EDGE_TYPES.OA // Already in underscored format
          });
        });
      }
    });
  }
  
  return links;
};
