import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Tag } from "@shared/schema";
import type {
  ApiUser,
  ApiCustomer,
  ApiIndustry,
  ApiTemplate,
  ApiRole,
  ApiComplianceRegulation,
} from "./types";

/**
 * One shared empty array for every list that hasn't loaded yet. A literal
 * `= []` default makes a new array on each render, so effects that depend on
 * these lists (the edit form's reset, keyed on `users`) re-ran every render
 * and looped until React stopped with "Maximum update depth exceeded" while
 * /api/users was still in flight.
 */
const EMPTY: never[] = [];
function emptyList<T>(): T[] {
  return EMPTY as unknown as T[];
}

/**
 * Custom hook to consolidate all data-fetching queries for the project form
 * This centralizes all API queries and reduces code duplication in the main component
 */
export function useProjectFormData(params: {
  isAuthenticated: boolean;
  currentIndustryId?: number;
  selectedCustomerId?: number;
}) {
  const { isAuthenticated, currentIndustryId, selectedCustomerId } = params;

  // Fetch all tags (system and custom)
  const { data: systemTags } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  // Fetch industries
  const { data: industries = emptyList<ApiIndustry>() } = useQuery<ApiIndustry[]>({
    queryKey: ["/api/industries"],
  });

  // Fetch roles for color mapping
  const { data: roles = emptyList<ApiRole>() } = useQuery<ApiRole[]>({
    queryKey: ["/api/roles"],
  });

  // Fetch compliance regulations
  const { data: complianceRegulations = emptyList<ApiComplianceRegulation>() } = useQuery<ApiComplianceRegulation[]>({
    queryKey: ["/api/compliance"],
  });

  // Fetch products (solutions)
  const { data: apiProducts = emptyList<any>() } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
    staleTime: 0,
  });

  // Fetch users with Engineer role
  const { data: salesEngineers = emptyList<ApiUser>() } = useQuery<ApiUser[]>({
    queryKey: ["/api/users"],
  });

  // Fetch templates
  const { data: apiTemplates = emptyList<ApiTemplate>() } = useQuery<ApiTemplate[]>({
    queryKey: ["/api/templates"],
  });

  // Merge API templates with localStorage updates
  const templates = (apiTemplates as any[]).map((template: any) => {
    const savedTemplate = localStorage.getItem(`template_${template.id}`);
    if (savedTemplate) {
      try {
        const parsedTemplate = JSON.parse(savedTemplate);
        return {
          ...template,
          name: parsedTemplate.name || template.name,
          industry: parsedTemplate.environment || parsedTemplate.industry || template.industry,
          solutionType: parsedTemplate.type || template.solutionType,
        };
      } catch (e) {
        return template;
      }
    }
    return template;
  });

  // Fetch customers
  const { data: customers = emptyList<ApiCustomer>() } = useQuery<ApiCustomer[]>({
    queryKey: ["/api/customers"],
  });

  // Fetch all users
  const { data: users = emptyList<ApiUser>() } = useQuery<ApiUser[]>({
    queryKey: ["/api/users"],
  });

  // Fetch industry-specific compliance regulations
  const { data: industryComplianceRegulations = emptyList<ApiComplianceRegulation>() } = useQuery<ApiComplianceRegulation[]>({
    queryKey: ["/api/industries", currentIndustryId, "compliance-regulations"],
    queryFn: () =>
      currentIndustryId
        ? apiRequest("GET", `/api/industries/${currentIndustryId}/compliance-regulations`)
        : Promise.resolve([]),
    enabled: !!currentIndustryId,
    staleTime: 300000,
  });

  // Fetch customer users for TCC selection
  const { data: customerUsersForTcc = emptyList<ApiUser>() } = useQuery<ApiUser[]>({
    queryKey: ["/api/customers", selectedCustomerId, "customer-users"],
    queryFn: () =>
      selectedCustomerId
        ? apiRequest("GET", `/api/customers/${selectedCustomerId}/customer-users`)
        : Promise.resolve([]),
    enabled: !!selectedCustomerId,
  });

  // Fetch current user. The endpoint is /api/auth/user (there is no
  // /api/user/me) — querying the wrong path made the SPA serve index.html,
  // tripping the apiRequest non-JSON guard and logging a spurious error on the
  // Create page even when the user never opened it. Same key as useAuth(), so
  // this shares that cache rather than issuing a second request.
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  return {
    systemTags,
    industries,
    roles,
    complianceRegulations,
    products: apiProducts,
    salesEngineers,
    templates,
    customers,
    users,
    industryComplianceRegulations,
    customerUsersForTcc,
    user,
  };
}
