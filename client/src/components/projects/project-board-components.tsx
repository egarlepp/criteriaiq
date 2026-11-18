import React, {
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { createPortal } from "react-dom";

import {
  useDroppable,
} from "@dnd-kit/core";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  MoreVertical,
  RotateCcw,
  Activity,
  Users,
} from "lucide-react";

import { toast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { lightenColor } from "@/lib/color-utils";

import {
  Project,
  TagsLookup,
  EASE,
  DUR,
  SPRING_LAND_MS,
  R12,
  SHADOW_SM,
  SHADOW_MD,
} from "./project-board-types";

import {
  parseCurrency,
  humanMoney,
  timeAgo,
  hexToRgb,
  sum,
  copyToClipboard,
} from "./project-board-utils";

export function DirtyDot({ show }: { show: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full transition-colors duration-300 ${show ? "bg-amber-500 shadow-[0_0_6px_2px_rgba(245,158,11,0.4)]" : "bg-transparent"}`} />;
}

export function AssignmentAvatars({ p, roles }: { p: Project; roles: any[] }) {
  const getInitials = (firstName?: string, lastName?: string): string => {
    if (!firstName || !lastName) return "";
    return `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
  };

  const getRoleStyle = (user: any): React.CSSProperties => {
    const roleColor = user?.role?.color;

    if (!roleColor || typeof roleColor !== 'string' || roleColor.trim() === '') {
      return {
        backgroundColor: '#f1f5f9',
        color: '#334155',
        borderColor: '#e2e8f0',
      };
    }

    try {
      return {
        backgroundColor: lightenColor(roleColor, 85),
        color: roleColor,
        borderColor: lightenColor(roleColor, 70),
      };
    } catch (error) {
      console.warn(`Failed to process role color ${roleColor}:`, error);
      return {
        backgroundColor: '#f1f5f9',
        color: '#334155',
        borderColor: '#e2e8f0',
      };
    }
  };

  const items: { id: string; label: string; title: string; style?: React.CSSProperties }[] = [];

  if (p.accountRep?.id) {
    const initials = getInitials(p.accountRep.firstName, p.accountRep.lastName);
    items.push({ 
      id: "ar", 
      label: initials || "AR", 
      title: `Account Rep: ${p.accountRep.fullName || "Account Rep"}`, 
      style: getRoleStyle(p.accountRep)
    });
  }

  if (p.primaryEngineer?.id) {
    const initials = getInitials(p.primaryEngineer.firstName, p.primaryEngineer.lastName);
    items.push({ 
      id: "pe", 
      label: initials || "PE", 
      title: `Primary Engineer: ${p.primaryEngineer.fullName || "Primary Engineer"}`, 
      style: getRoleStyle(p.primaryEngineer)
    });
  }

  if (p.specialistEngineer?.id) {
    const initials = getInitials(p.specialistEngineer.firstName, p.specialistEngineer.lastName);
    items.push({ 
      id: "se", 
      label: initials || "SE", 
      title: `Specialist Engineer: ${p.specialistEngineer.fullName || "Specialist Engineer"}`, 
      style: getRoleStyle(p.specialistEngineer)
    });
  }

  if ((p.supportingEngineerIds || []).length) {
    items.push({ 
      id: "su", 
      label: "SU", 
      title: "Supporting Engineers", 
      style: {
        backgroundColor: '#f1f5f9',
        color: '#334155',
        borderColor: '#e2e8f0',
      }
    });
  }

  return (
    <div className="relative group flex items-center -space-x-1.5">
      {items.map((x) => (
        <span 
          key={x.id} 
          className="w-5 h-5 rounded-full text-[9px] inline-flex items-center justify-center border ring-1 ring-white dark:ring-slate-900" 
          style={x.style}
          title={x.title}
        >
          {x.label}
        </span>
      ))}
    </div>
  );
}

export function IconToggleSwitch({ checked, onChange, iconLeft, iconRight, titleLeft, titleRight }: { checked: boolean, onChange: (v: boolean) => void, iconLeft: ReactNode, iconRight: ReactNode, titleLeft: string, titleRight: string }) {
    return (
        <TooltipProvider>
            <div className="flex items-center gap-3 select-none">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className={`cursor-pointer transition-colors duration-200 ${!checked ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} onClick={() => onChange(false)}>
                            {iconLeft}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        {titleLeft}
                    </TooltipContent>
                </Tooltip>
                <div 
                   className="relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer bg-slate-200 dark:bg-slate-700"
                   onClick={() => onChange(!checked)}
                >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className={`cursor-pointer transition-colors duration-200 ${checked ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} onClick={() => onChange(true)}>
                            {iconRight}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        {titleRight}
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    )
}

export function ProjectStatsView({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const c = projects.length;
  const sumAcv = sum(projects.map((p) => p.acv || 0));
  const avgAcv = c ? Math.round(sumAcv / c) : 0;
  const avgLoe = c ? Math.round(sum(projects.map((p) => p.loeDays || 0)) / c) : 0;

  return (
    <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-slate-600 dark:text-slate-400 mt-1.5">
      <div className="flex items-center gap-1.5" title={t('projects.board.totalAcv')}>
        <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        <span className="opacity-70">{t('projects.board.totalAcv')}:</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{humanMoney(sumAcv)}</span>
      </div>
      <div className="flex items-center gap-1.5" title={t('projects.board.averageAcv')}>
        <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        <span className="opacity-70">{t('projects.board.avgAcv')}:</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{humanMoney(avgAcv)}</span>
      </div>
      <div className="flex items-center gap-1.5" title={t('projects.board.averageLoe')}>
        <Activity className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        <span className="opacity-70">{t('projects.board.avgLoe')}:</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{avgLoe}d</span>
      </div>
      <div className="flex items-center gap-1.5" title={t('projects.board.dealCount')}>
        <Users className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        <span className="opacity-70">{t('projects.board.numDeals')}:</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{c}</span>
      </div>
    </div>
  );
}

export function ColumnShell({ sortableId, disabled, children }: { sortableId: string; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId, disabled });
  const style: React.CSSProperties = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition: `transform ${DUR}ms ${EASE}`,
    zIndex: isDragging ? 40 : 1,
    touchAction: "none",
    userSelect: "none",
  };
  return (
    <div 
      ref={setNodeRef} 
      {...attributes} 
      {...listeners} 
      style={style} 
      className={`select-none outline-none ${disabled ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-grab"}`}
    >
      {children}
    </div>
  );
}

export function useClickAway(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ref, cb]);
}

export function ColumnMenu({
  anchorRect,
  onClose,
  collapsed,
  onToggleCollapsed,
  onTempSortACV,
  onTempSortLOE,
  onCopyLink,
}: {
  anchorRect: DOMRect;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTempSortACV: () => void;
  onTempSortLOE: () => void;
  onCopyLink: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, onClose);
  const top = anchorRect.bottom + 6;
  const left = Math.min(window.innerWidth - 220, anchorRect.right - 180);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] w-[220px] rounded border bg-white dark:bg-slate-800 dark:border-slate-700 shadow-lg p-1 text-sm text-slate-700 dark:text-slate-200"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <button className="w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded flex items-center gap-2" onClick={() => { onToggleCollapsed(); onClose(); }}>
        {collapsed ? <ChevronRight className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
        {collapsed ? "Expand column" : "Collapse column"}
      </button>
      <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
      <button className="w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded" onClick={() => { onTempSortACV(); onClose(); }}>
        Sort by ACV (High-Low)
      </button>
      <button className="w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded" onClick={() => { onTempSortLOE(); onClose(); }}>
        Sort by LOE (High-Low)
      </button>
      <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
      <button className="w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded" onClick={() => { onCopyLink(); onClose(); }}>
        Copy column link
      </button>
    </div>,
    document.body
  );
}

export function Column({
  dimLabel,
  title,
  statusId,
  color,
  count,
  isDragging,
  children,
  droppable,
  isEmpty,
  statsOpen,
  onToggleStats,
  statsContent,
  onColumnRef,
  onColumnScroll,
  collapsed,
  onToggleCollapsed,
  onTempSortACV,
  onTempSortLOE,
  icon,
  useDirectBackgroundColor,
}: {
  dimLabel: string;
  title: string;
  statusId: string;
  color: string;
  count: number;
  isDragging: boolean;
  children: React.ReactNode;
  droppable?: boolean;
  isEmpty: boolean;
  statsOpen: boolean;
  onToggleStats: () => void;
  statsContent?: React.ReactNode;
  onColumnRef?: (id: string, el: HTMLElement | null) => void;
  onColumnScroll?: (id: string, scrollTop: number) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTempSortACV: () => void;
  onTempSortLOE: () => void;
  icon?: any;
  useDirectBackgroundColor?: boolean;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: statusId });

  const trimmedColor = (color || "").trim();
  const isHexColor = trimmedColor.startsWith("#") && trimmedColor.length >= 4;

  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const colorRgb = isHexColor ? hexToRgb(trimmedColor) : "107, 114, 128";

  const inlineStyles = isHexColor ? {
    "--col-rgb": colorRgb,
  } as React.CSSProperties : {};

  const headerClass = isHexColor 
    ? useDirectBackgroundColor 
        ? `bg-[rgba(var(--col-rgb),1)] text-slate-800 border-slate-300 dark:text-slate-900`
        : `bg-[rgba(var(--col-rgb),0.3)] border-[rgba(var(--col-rgb),0.4)] text-slate-800 dark:bg-[rgba(var(--col-rgb),0.2)] dark:border-[rgba(var(--col-rgb),0.3)] dark:text-slate-100`
    : color;

  function openMenu() {
    if (!menuBtnRef.current) return;
    setAnchorRect(menuBtnRef.current.getBoundingClientRect());
    setMenuOpen(true);
  }

  return (
    <div className={`@container/col flex-col transition-all duration-300 ease-in-out ${collapsed ? "flex-none w-[20px] mx-1" : "flex-1 min-w-[300px] max-w-[380px] mx-2"}`}>
      <div
        className="mb-2 sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur rounded"
        style={{ borderRadius: R12, pointerEvents: "auto" }}
      >
        {collapsed ? (
           <TooltipProvider>
             <Tooltip>
               <TooltipTrigger asChild>
                 <div 
                   className={`h-[52px] flex flex-col items-center justify-center gap-4 rounded-md border cursor-pointer hover:brightness-95 transition-all ${headerClass}`}
                   style={inlineStyles}
                   onClick={onToggleCollapsed}
                 >
                     <ChevronRight className="w-4 h-4 opacity-70" />
                 </div>
               </TooltipTrigger>
               <TooltipContent>
                 <div className="flex flex-col items-center gap-0.5">
                   <span className="font-semibold">{dimLabel}: {title}</span>
                   <span className="text-[9px] opacity-75">{t('projects.board.clickToUncollapse')}</span>
                 </div>
               </TooltipContent>
             </Tooltip>
           </TooltipProvider>
        ) : (
        <div 
          className={`rounded-md border px-2 py-2 shadow-sm transition-all ${headerClass}`}
          style={inlineStyles}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1 min-w-0">
              <span className="opacity-70 shrink-0">{dimLabel}:</span>
              {icon && (() => {
                const isImageFile = typeof icon === 'string' && /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(icon);
                const isFullPath = typeof icon === 'string' && (icon.startsWith('/') || icon.startsWith('http'));
                if (isImageFile || isFullPath) {
                  const imgSrc = isFullPath ? icon : `/api/files/system/solution-icons/${icon}`;
                  return <img src={imgSrc} alt="" className="w-4 h-4 shrink-0 object-contain" style={{ filter: 'none' }} />;
                }
                return <DynamicIcon name={icon} className="w-4 h-4 shrink-0" />;
              })()}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate cursor-default">{title}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {title}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-normal opacity-60 shrink-0">({count})</span>
            </div>
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onToggleStats}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        {statsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {statsOpen ? "Hide stats" : "Show stats"}
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        ref={menuBtnRef}
                        onClick={openMenu}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Column actions
                    </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

          {statsOpen && statsContent && (
            <>
              <div className="h-px w-full my-1.5 bg-current opacity-10" />
              {statsContent}
            </>
          )}
        </div>
        )}
      </div>

      {menuOpen && anchorRect && (
        <ColumnMenu
          anchorRect={anchorRect}
          onClose={() => setMenuOpen(false)}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          onTempSortACV={onTempSortACV}
          onTempSortLOE={onTempSortLOE}
          onCopyLink={() => {
            copyToClipboard(`${location.origin}${location.pathname}#col-${statusId}`);
          }}
        />
      )}

      {!collapsed && (
        <div
          ref={(node) => {
            if (droppable) setNodeRef(node as any);
            onColumnRef?.(statusId, node as HTMLElement | null);
          }}
          onScroll={(e) => onColumnScroll?.(statusId, (e.currentTarget as HTMLElement).scrollTop)}
          id={statusId}
          className={`flex-1 overflow-y-auto overflow-x-hidden rounded-lg border p-2 flex flex-col gap-2 bg-slate-100/50 dark:bg-slate-900/20 ${
            droppable ? "bg-slate-100/50 dark:bg-slate-800/20" : ""
          } ${droppable && isOver ? "ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20" : ""}`}
          style={{ borderRadius: R12, boxShadow: "inset 0 2px 4px 0 rgba(0,0,0,0.02)" }}
        >
          {isEmpty ? (
            <div className="h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium italic">
              {droppable && isDragging ? "Drop here" : "No projects"}
            </div>
          ) : (
            <div className="min-w-0 flex flex-col gap-2 pb-2">{children}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function DraggableProjectCard({
  project,
  isActive,
  disabled,
  isDirty,
  showUndo,
  onUndo,
  onClick,
  compactMode,
  roles,
  tagsLookup,
}: {
  project: Project;
  isActive: boolean;
  disabled: boolean;
  isDirty?: boolean;
  showUndo?: boolean;
  onUndo?: () => void;
  onClick?: () => void;
  compactMode?: boolean;
  roles?: any[];
  tagsLookup?: TagsLookup;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(project.id), disabled });
  const style: React.CSSProperties = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition: `transform ${DUR}ms ${EASE}`,
    zIndex: isDragging ? 50 : 1,
    position: "relative",
    touchAction: "none",
    userSelect: "none",
    pointerEvents: disabled ? "none" : "auto",
  };
  return (
    <div 
      ref={setNodeRef} 
      {...attributes} 
      {...listeners} 
      onClick={onClick} 
      className={`outline-none ${disabled ? "opacity-60 cursor-not-allowed" : isDragging ? "cursor-grabbing" : "cursor-grab"}`} 
      style={style} 
      data-card-id={project.id}
    >
      <ProjectCard project={project} isActive={isActive || isDragging} isDirty={!!isDirty} showUndo={!!showUndo} onUndo={onUndo} compactMode={compactMode} roles={roles} tagsLookup={tagsLookup} />
    </div>
  );
}

export function ProjectCard({
  project,
  isActive = false,
  isDirty = false,
  showUndo = false,
  onUndo,
  compactMode = false,
  roles = [],
  tagsLookup = {},
}: {
  project: Project;
  isActive?: boolean;
  isDirty?: boolean;
  showUndo?: boolean;
  onUndo?: () => void;
  compactMode?: boolean;
  roles?: any[];
  tagsLookup?: TagsLookup;
}) {
  const { t } = useTranslation();
  const [landAnim, setLandAnim] = useState(false);
  useEffect(() => {
    if (!isActive) {
      setLandAnim(true);
      const timer = setTimeout(() => setLandAnim(false), SPRING_LAND_MS);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div
      className={`@container/card relative rounded-lg border border-l-4 p-3 bg-white dark:bg-slate-800 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 group`}
      style={{
        borderRadius: R12,
        boxShadow: isActive ? SHADOW_MD : SHADOW_SM,
        transition: `box-shadow ${DUR}ms ${EASE}, transform ${DUR}ms ${EASE}, border-color ${DUR}ms ${EASE}`,
        transform: isActive ? "scale(1.02)" : landAnim ? "scale(1.01)" : "scale(1)",
        backgroundColor: isDirty ? "#eff6ff" : undefined,
        borderColor: isDirty ? "#93c5fd" : undefined,
        borderLeftColor: project.endDateFlag?.badgeColor || '#e2e8f0',
      }}
      title={t('projects.board.clickToOpenQuickView')}
    >
      <div className="flex items-start justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="shrink-0 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4" />
          </span>
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate leading-tight" title={`ID: ${project.id} ${project.productAbbreviations && project.productAbbreviations.length > 0 ? `(${project.productAbbreviations.join('|')})` : ''}`}>
            ID: {project.id} {project.productAbbreviations && project.productAbbreviations.length > 0 && `(${project.productAbbreviations.join('|')})`}
          </div>
        </div>
        <AssignmentAvatars p={project} roles={roles} />
      </div>

      <div className="pl-6 mt-2 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate font-medium text-slate-600 dark:text-slate-300">{project.customer || "Prospect"}</span>
            <span className="text-slate-400 dark:text-slate-500 font-mono">{project.opportunityAcvValue ? `$${Math.round(parseCurrency(project.opportunityAcvValue)).toLocaleString()}` : humanMoney(project.acv)}</span>
        </div>

        {!compactMode && (
          <div className="@[340px]/col:flex hidden items-center justify-between gap-3 text-[11px] text-slate-400 dark:text-slate-500">
             <div className="flex items-center gap-3">
               <div className="flex items-center gap-1" title={t('projects.board.updated')}>
                   <Calendar className="w-3 h-3" />
                   <span>{timeAgo(project.updatedAt)}</span>
               </div>
               <div className="flex items-center gap-1" title="LOE">
                   <Activity className="w-3 h-3" />
                   <span>{project.loeDays}d</span>
               </div>
             </div>

             {project.products && project.products.length > 0 && (
               <div className="flex justify-end gap-1">
                 {project.products.slice(0, 2).map(tag => {
                   const hexColor = tagsLookup[tag] || "#6B7280";
                   const rgb = hexToRgb(hexColor);
                   return (
                     <span 
                       key={tag} 
                       className="text-[8px] px-1 py-0.5 rounded border font-medium bg-[rgba(var(--tag-rgb),0.15)] text-[rgb(var(--tag-rgb))] border-[rgba(var(--tag-rgb),0.3)] dark:bg-[rgba(var(--tag-rgb),0.25)] dark:text-[rgb(var(--tag-rgb))] dark:border-[rgba(var(--tag-rgb),0.5)]"
                       style={{ "--tag-rgb": rgb } as React.CSSProperties}
                     >
                       {tag}
                     </span>
                   );
                 })}
                 {project.products.length > 2 && (
                   <TooltipProvider>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <span className="text-[8px] px-1 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 cursor-default">
                           +{project.products.length - 2}
                         </span>
                       </TooltipTrigger>
                       <TooltipContent side="top" className="max-w-xs">
                         <div className="flex flex-wrap gap-1">
                           {project.products.slice(2).map(tag => {
                             const hexColor = tagsLookup[tag] || "#6B7280";
                             const rgb = hexToRgb(hexColor);
                             return (
                               <span 
                                 key={tag} 
                                 className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-[rgba(var(--tag-rgb),0.15)] text-[rgb(var(--tag-rgb))] border-[rgba(var(--tag-rgb),0.3)] dark:bg-[rgba(var(--tag-rgb),0.25)] dark:text-[rgb(var(--tag-rgb))] dark:border-[rgba(var(--tag-rgb),0.5)]"
                                 style={{ "--tag-rgb": rgb } as React.CSSProperties}
                               >
                                 {tag}
                               </span>
                             );
                           })}
                         </div>
                       </TooltipContent>
                     </Tooltip>
                   </TooltipProvider>
                 )}
               </div>
             )}
          </div>
        )}
      </div>

      {showUndo && (
        <button
          onClick={(e) => { e.stopPropagation(); onUndo?.(); }}
          className="absolute bottom-2 right-2 text-[10px] px-2 py-1 rounded-full border bg-white dark:bg-slate-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-sm flex items-center gap-1 z-10 font-medium"
          title={t('projects.board.undoMove')}
        >
          <RotateCcw className="w-3 h-3" />
          Undo
        </button>
      )}

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<{ children: ReactNode }, { hasError: boolean; message?: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(err: any) {
    showErrorToast(`Board crashed ${err?.message ? `– ${err.message}` : ""}`);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900">
          <div className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">{i18n.t('projects.board.errorTitle')}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-4 font-mono bg-slate-200 dark:bg-slate-800 p-2 rounded">{this.state.message}</div>
          <button onClick={() => location.reload()} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow">
            Reload Board
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
