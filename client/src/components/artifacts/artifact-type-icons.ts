import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Building2,
  Cloud,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Globe,
  GraduationCap,
  Headphones,
  LineChart,
  MonitorPlay,
  Package,
  PlayCircle,
  StickyNote,
  Swords,
  Trophy,
  Video,
} from "lucide-react";

export interface ArtifactTypeIcon {
  icon: LucideIcon;
  /** Tailwind text color class; readable on light and dark surfaces. */
  color: string;
}

/** Icon and color per document type (Upload Document's type list). */
export const DOCUMENT_TYPE_ICONS: Record<string, ArtifactTypeIcon> = {
  Architecture: { icon: Building2, color: "text-blue-500" },
  "Product Info": { icon: Package, color: "text-purple-500" },
  Visio: { icon: GitBranch, color: "text-orange-500" },
  Reference: { icon: BookMarked, color: "text-green-500" },
  Documentation: { icon: FileText, color: "text-cyan-500" },
  Battlecard: { icon: Swords, color: "text-orange-500" },
  Datasheet: { icon: FileSpreadsheet, color: "text-blue-500" },
  "Internal Notes": { icon: StickyNote, color: "text-yellow-500" },
  "Win/Loss Info": { icon: Trophy, color: "text-emerald-500" },
  "Demo Notes": { icon: MonitorPlay, color: "text-purple-500" },
  Other: { icon: File, color: "text-slate-500" },
};

/** Icon and color per link type (Artifacts › Links). */
export const LINK_TYPE_ICONS: Record<string, ArtifactTypeIcon> = {
  Documentation: { icon: FileText, color: "text-cyan-500" },
  Tutorial: { icon: GraduationCap, color: "text-indigo-500" },
  Reference: { icon: BookMarked, color: "text-green-500" },
  "Product Info": { icon: Package, color: "text-purple-500" },
  Support: { icon: Headphones, color: "text-pink-500" },
  Demo: { icon: PlayCircle, color: "text-amber-500" },
  Video: { icon: Video, color: "text-red-500" },
  Download: { icon: Download, color: "text-teal-500" },
  Architecture: { icon: Building2, color: "text-blue-500" },
  CloudLAB: { icon: Cloud, color: "text-sky-500" },
  Portal: { icon: Globe, color: "text-emerald-500" },
  Battlecard: { icon: Swords, color: "text-orange-500" },
  Analyst: { icon: LineChart, color: "text-teal-500" },
  Website: { icon: Globe, color: "text-blue-500" },
  Other: { icon: File, color: "text-slate-500" },
};

/** The document type's icon; unknown or missing types get Other's. */
export function documentTypeIcon(type: string | null | undefined): ArtifactTypeIcon {
  return (type && DOCUMENT_TYPE_ICONS[type]) || DOCUMENT_TYPE_ICONS.Other;
}

/** The link type's icon; unknown or missing types get Other's. */
export function linkTypeIcon(type: string | null | undefined): ArtifactTypeIcon {
  return (type && LINK_TYPE_ICONS[type]) || LINK_TYPE_ICONS.Other;
}
