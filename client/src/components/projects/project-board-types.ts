export const EASE = "cubic-bezier(0.22,1,0.36,1)";
export const DUR = 120;
export const SPRING_LAND_MS = 160;
export const R12 = "12px";
export const SHADOW_SM = "0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)";
export const SHADOW_MD = "0 4px 12px rgba(0,0,0,.10)";

export type Project = {
  id: number;
  name: string;
  customer?: string;
  accountRepId?: string | null;
  primaryEngineerId?: string | null;
  specialistEngineerId?: string | null;
  supportingEngineerIds?: string[] | null;
  internalStatus?: string;
  customerStatus?: string;
  riskLevel?: string;
  ranking?: string;
  acv?: number;
  opportunityAcvValue?: string;
  productAbbreviations?: string[];
  loeDays?: number;
  updatedAt?: string;
  startDate?: string | null;
  endDate?: string | null;
  completedDate?: string | null;
  notes?: string;
  products?: string[];
  accountRep?: { id: string; firstName: string; lastName: string; fullName: string; role?: { name: string; displayName: string; color: string } } | null;
  primaryEngineer?: { id: string; firstName: string; lastName: string; fullName: string; role?: { name: string; displayName: string; color: string } } | null;
  specialistEngineer?: { id: string; firstName: string; lastName: string; fullName: string; role?: { name: string; displayName: string; color: string } } | null;
  endDateFlag?: { name: string; badgeColor: string; priority: number } | null;
  customerRegion?: string | null;
  customerIndustryId?: number | null;
  teamId?: number | null;
  subteamId?: number | null;
  customerIndustryName?: string | null;
  customerIndustryIcon?: string | null;
  salesStage?: string | null;
  forecastCategory?: string | null;
  currentSituation?: string | null;
};

export type StatusDimension = "internal" | "risk" | "ranking";
export type StatusOption = { id: string; label: string; color: string; icon?: string };
export type SwimlaneDimension = "none" | "rep" | "primary_se" | "specialist_se";

export type NonEditableDimension =
  | "salesStage"
  | "forecastCategory"
  | "acvBands"
  | "customerStatus"
  | "loe"
  | "byAccount"
  | "byDate"
  | "solutions";

type FilterDef = { type: "acvBands"; min: number; max: number };
export type FilterColumn = { id: string; label: string; filter: FilterDef };

export const DISPLAY_NAME_BY_EDITABLE_DIM: Record<StatusDimension, string> = {
  internal: "Internal Status",
  risk: "Risk Level",
  ranking: "Ranking",
};
export const DISPLAY_NAME_BY_NON_EDITABLE: Record<NonEditableDimension, string> = {
  salesStage: "Sales Stage",
  forecastCategory: "Forecast Category",
  acvBands: "ACV Bands",
  customerStatus: "Acct Status",
  loe: "LOE (days)",
  byAccount: "Account:",
  byDate: "Updated By Date",
  solutions: "Solutions",
};
export const statusFieldByDimension: Record<StatusDimension, keyof Project> = {
  internal: "internalStatus",
  risk: "riskLevel",
  ranking: "ranking",
};

export type TagConfig = { id: number; name: string; color: string; description?: string };
export type TagsLookup = Record<string, string>;

export type AuditEvent =
  | { ts: number; user: string; type: "move"; projectId: number; dim: StatusDimension; from?: string; to: string }
  | { ts: number; user: string; type: "reorder"; dim: StatusDimension; statusId: string; ids: number[] }
  | { ts: number; user: string; type: "columns-reorder"; dim: StatusDimension; order: string[] }
  | { ts: number; user: string; type: "meta"; projectId: number; patch: Partial<Project> };

export interface ProjectBoardProps {
  filterContainerRef?: React.RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
  showMyProjects?: boolean;
}

export const RANDOM_PASTEL_COLORS = [
  "#FDE68A",
  "#A7F3D0",
  "#BFDBFE",
  "#DDD6FE",
  "#FBCFE8",
  "#FED7AA",
  "#99F6E4",
  "#E9D5FF",
  "#FECACA",
  "#BBF7D0",
  "#C7D2FE",
  "#FECDD3",
];
