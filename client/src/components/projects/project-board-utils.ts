import { apiRequest } from "@/lib/queryClient";
import {
  Project,
  StatusDimension,
  StatusOption,
  AuditEvent,
  DISPLAY_NAME_BY_EDITABLE_DIM,
  RANDOM_PASTEL_COLORS,
} from "./project-board-types";

export function parseCurrency(value: string | null | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function normalizeOwnerObject(ownerData: any): { id: string; firstName: string; lastName: string; fullName: string; role?: { name: string; displayName: string; color: string } } | null {
  if (!ownerData?.id) return null;

  const firstName = ownerData.firstName || ownerData.first_name || "";
  const lastName = ownerData.lastName || ownerData.last_name || "";
  const fullName = ownerData.fullName || ownerData.full_name || 
                   (firstName && lastName ? `${firstName} ${lastName}`.trim() : 
                    ownerData.email || "");

  return {
    id: ownerData.id,
    firstName,
    lastName,
    fullName,
    role: ownerData.role || undefined
  };
}

export function mapApiProjectToComponent(apiProject: any): Project {
  const accountRep = normalizeOwnerObject(apiProject.accountRep || apiProject.account_rep);
  const primaryEngineer = normalizeOwnerObject(apiProject.primaryEngineer || apiProject.primary_engineer);
  const specialistEngineer = normalizeOwnerObject(apiProject.specialistEngineer || apiProject.specialist_engineer);

  return {
    id: apiProject.id,
    name: apiProject.solution_name || apiProject.customer_name || "Untitled Project",
    customer: apiProject.customer_name || "",
    accountRepId: apiProject.accountRepId != null ? String(apiProject.accountRepId) : null,
    primaryEngineerId: apiProject.primaryEngineerId != null ? String(apiProject.primaryEngineerId) : null,
    specialistEngineerId: apiProject.specialistEngineerId != null ? String(apiProject.specialistEngineerId) : null,
    supportingEngineerIds: (apiProject.supporting_engineers || []).map(String),
    internalStatus: apiProject.status || "",
    customerStatus: apiProject.customer_status || "",
    riskLevel: apiProject.risk || "",
    ranking: apiProject.ranking || "",
    acv: parseCurrency(apiProject.opportunity_acv_value),
    opportunityAcvValue: apiProject.opportunity_acv_value || "",
    productAbbreviations: apiProject.productAbbreviations || apiProject.product_abbreviations || [],
    loeDays: apiProject.loeDays || apiProject.loe_days || 0,
    updatedAt: apiProject.updated_at || new Date().toISOString(),
    notes: apiProject.notes || "",
    products: apiProject.tags || [],
    startDate: apiProject.startDate || apiProject.start_date || null,
    endDate: apiProject.endDate || apiProject.end_date || null,
    completedDate: apiProject.completedDate || apiProject.completed_date || null,
    accountRep,
    primaryEngineer,
    specialistEngineer,
    endDateFlag: apiProject.endDateFlag || null,
    customerRegion: apiProject.customer_region || null,
    customerIndustryId: apiProject.customer_industry_id || null,
    teamId: apiProject.team_id ?? null,
    subteamId: apiProject.subteam_id ?? null,
    customerIndustryName: apiProject.customer_industry_name || null,
    customerIndustryIcon: apiProject.customer_industry_icon || null,
    salesStage: apiProject.salesStage || apiProject.sales_stage || null,
    forecastCategory: apiProject.forecastCategory || apiProject.forecast_category || null,
    currentSituation: apiProject.currentSituation || apiProject.current_situation || null,
  };
}

export async function fetchStatuses(dim: StatusDimension): Promise<StatusOption[]> {
  if (dim === 'internal') {
    try {
      const configs: any = await apiRequest("GET", "/api/status-configs");
      return configs.map((c: any) => {
        const normalizedId = c.name.toLowerCase();
        return {
          id: normalizedId,
          label: c.name,
          color: c.color || "#6B7280",
          icon: c.icon || undefined
        };
      });
    } catch (error) {
      console.error("Error fetching status configs:", error);
      return [];
    }
  } else if (dim === 'risk') {
    try {
      const configs: any = await apiRequest("GET", "/api/risk-level-configs");
      return configs.map((c: any) => {
        return {
          id: c.name,
          label: c.name,
          color: c.color || "#6B7280",
          icon: c.icon || undefined
        };
      });
    } catch (error) {
      console.error("Error fetching risk level configs:", error);
      return [];
    }
  } else if (dim === 'ranking') {
    try {
      const configs: any = await apiRequest("GET", "/api/ranking-configs");
      return configs.map((c: any) => {
        return {
          id: c.name,
          label: c.name,
          color: c.color || "#6B7280",
          icon: c.icon || undefined
        };
      });
    } catch (error) {
      console.error("Error fetching ranking configs:", error);
      return [];
    }
  }
  return [];
}

export async function fetchProjects(view: "all" | "mine", me: string, dimension: StatusDimension): Promise<Project[]> {
  const params = new URLSearchParams({ view, dimension });
  const data: any = await apiRequest("GET", `/api/projects/kanban?${params.toString()}`);
  return (data || []).map(mapApiProjectToComponent);
}

export async function updateProjectStatus(projectId: number, dim: StatusDimension, newStatusId: string): Promise<void> {
  await apiRequest("PATCH", `/api/projects/${projectId}/status`, { dimension: dim, statusId: newStatusId });
}

export async function updateProjectMeta(projectId: number, patch: Partial<Project>): Promise<void> {
}

export async function persistOrder(dim: StatusDimension, statusId: string, orderedIds: number[]): Promise<void> {
}

export async function persistColumnOrder(dim: StatusDimension, orderedStatusIds: string[], userId?: string): Promise<void> {
  if (!userId) {
    console.error("Cannot persist column order: userId is required");
    return;
  }

  try {
    await fetch(`/api/board-preferences/${userId}/${dim}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columnOrder: orderedStatusIds
      })
    });
  } catch (error) {
    console.error("Failed to persist column order:", error);
  }
}

export async function loadUserColumnOrder(userId: string, dimension: StatusDimension): Promise<string[] | null> {
  try {
    const response = await fetch(`/api/board-preferences/${userId}/${dimension}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data?.columnOrder || null;
  } catch (error) {
    console.error("Failed to load user column order:", error);
    return null;
  }
}

export async function persistAudit(events: AuditEvent[], currentUser: any): Promise<void> {
  try {
    await fetch("/api/board-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events.map(e => ({
          ...e,
          user: currentUser?.id || e.user
        }))
      })
    });
  } catch (error) {
    console.error("Failed to persist audit events:", error);
  }
}

export function groupByField(projects: Project[], field: keyof Project) {
  const map: Record<string, Project[]> = {};
  for (const p of projects) {
    const key = (p[field] as string) || "_unset";
    (map[key] ||= []).push(p);
  }
  return map;
}

export function timeAgo(iso?: string) {
  const then = iso ? new Date(iso).getTime() : Date.now();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

export function humanMoney(n?: number) {
  if (n == null) return "$0";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

export function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

export function statusLabel(configMap: Record<StatusDimension, StatusOption[]>, dim: StatusDimension, statusId?: string) {
  if (!statusId) return "(none)";
  const list = configMap[dim] || [];
  const found = list?.find((s) => s.id === statusId);
  return found ? found.label : statusId;
}

export function friendlyDim(dim: StatusDimension) {
    return DISPLAY_NAME_BY_EDITABLE_DIM[dim];
}

export function copyToClipboard(text: string) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
}

export function getAcvBandBackgroundColor(index: number): string {
  const lightGreen = "#86efac";
  const mediumGreen = "#4ade80";
  const darkGreen = "#22c55e";

  if (index >= 0 && index <= 3) {
    return lightGreen;
  } else if (index >= 4 && index <= 5) {
    return mediumGreen;
  } else if (index >= 6 && index <= 7) {
    return darkGreen;
  }

  return lightGreen;
}

export function getRandomPastelColor(usedColors: Set<string>): string {
  const availableColors = RANDOM_PASTEL_COLORS.filter(c => !usedColors.has(c));
  if (availableColors.length === 0) {
    return RANDOM_PASTEL_COLORS[Math.floor(Math.random() * RANDOM_PASTEL_COLORS.length)];
  }
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}

export function hexToRgb(hex: string) {
  const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthand, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "107, 114, 128";
}

export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

export const loadScript = (src: string) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });
};

export async function loadHtml2Canvas() {
  if ((window as any).html2canvas) return (window as any).html2canvas;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  return (window as any).html2canvas;
}

export async function loadJsPDF() {
  if ((window as any).jspdf) return (window as any).jspdf.jsPDF;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  return (window as any).jspdf.jsPDF;
}

export function convertConfigsToStatusOptions(configs: any[], dimension: StatusDimension): StatusOption[] {
  return configs.map((config: any) => ({
    id: dimension === 'internal' ? config.name.toLowerCase() : config.name,
    label: config.name,
    color: config.color || "#6B7280",
    icon: config.icon || undefined
  }));
}
