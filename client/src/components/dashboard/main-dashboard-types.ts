import { PocWithRelations } from "@shared/schema";
import { KPIDrawerConfig } from "@/components/dashboard-widgets/KPIDetailDrawer";

export interface DrillDownState {
  isOpen: boolean;
  title: string;
  projects: PocWithRelations[];
}
