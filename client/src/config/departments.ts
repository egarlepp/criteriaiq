import type { TFunction } from "i18next";
export const DEPARTMENTS = [
  { value: "N/A", label: "N/A", labelKey: "departments.na" },
  { value: "C-Level", label: "C-Level", labelKey: "departments.cLevel" },
  { value: "HR", label: "HR", labelKey: "departments.hr" },
  { value: "Finance", label: "Finance", labelKey: "departments.finance" },
  { value: "Marketing", label: "Marketing", labelKey: "departments.marketing" },
  { value: "Sales", label: "Sales", labelKey: "departments.sales" },
  { value: "Operations", label: "Operations", labelKey: "departments.operations" },
  { value: "Engineering", label: "Engineering", labelKey: "departments.engineering" },
  { value: "Security", label: "Security", labelKey: "departments.security" },
  { value: "Network", label: "Network", labelKey: "departments.network" },
  { value: "R&D", label: "R&D", labelKey: "departments.rnd" },
  { value: "Support", label: "Support", labelKey: "departments.support" },
  { value: "IT", label: "IT", labelKey: "departments.it" },
  { value: "CX", label: "CX", labelKey: "departments.cx" },
  { value: "Services", label: "Services", labelKey: "departments.services" },
  { value: "Product", label: "Product", labelKey: "departments.product" },
  { value: "Legal", label: "Legal", labelKey: "departments.legal" },
  { value: "Procurement", label: "Procurement", labelKey: "departments.procurement" },
  { value: "PMO", label: "PMO", labelKey: "departments.pmo" },
  { value: "Risk Management", label: "Risk Management", labelKey: "departments.riskManagement" },
  { value: "Asset Management", label: "Asset Management", labelKey: "departments.assetManagement" },
  { value: "Database", label: "Database", labelKey: "departments.database" },
  { value: "Other", label: "Other", labelKey: "departments.other" }
] as const;


export const getDepartmentLabel = (value: string, t?: TFunction) => {
  const department = DEPARTMENTS.find(d => d.value === value);
  if (!department) return value;
  if (t) return t(department.labelKey, { defaultValue: department.label });
  return department.label;
};
