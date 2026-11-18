import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface PillProject {
  id: number;
  label: string;
}

interface ProjectPillsProps {
  projects: PillProject[];
  /** The picked project; null is "All". */
  selected: number | null;
  onSelect(projectId: number | null): void;
  /** A number on each project's pill (unread messages, open to-dos); 0 or missing shows none. */
  counts: Map<number, number>;
  /** Accessible name of the group. */
  label: string;
  /** Accessible name of a pill with a count, e.g. "FD-AAN-159, 2 unread messages". */
  countLabel(name: string, count: number): string;
  /** data-testid prefix: `${prefix}-all`, `${prefix}-${id}`. */
  testIdPrefix: string;
}

/**
 * "All" plus one pill per project, each with its count, that filter a side
 * panel card on the Account Portal (Messages, Waiting on). Wraps onto more
 * lines rather than scrolling.
 */
export function ProjectPills({ projects, selected, onSelect, counts, label, countLabel, testIdPrefix }: ProjectPillsProps) {
  const { t } = useTranslation();
  const pillClass = (active: boolean) =>
    cn(
      "inline-flex max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-slate-200 bg-card text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
    );

  return (
    // A button group, not role="tablist": index.css styles every tablist as a
    // full-width tab bar. data-state opts the buttons out of index.css
    // painting every bg-primary button solid.
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      <button
        type="button"
        aria-pressed={selected === null}
        data-state={selected === null ? "on" : "off"}
        onClick={() => onSelect(null)}
        className={pillClass(selected === null)}
        data-testid={`${testIdPrefix}-all`}
      >
        {t("workspace.portalMessages.all")}
      </button>
      {projects.map((project) => {
        const active = project.id === selected;
        const count = counts.get(project.id) ?? 0;
        return (
          <button
            key={project.id}
            type="button"
            aria-pressed={active}
            data-state={active ? "on" : "off"}
            onClick={() => onSelect(project.id)}
            className={pillClass(active)}
            title={project.label}
            aria-label={count > 0 ? countLabel(project.label, count) : project.label}
            data-testid={`${testIdPrefix}-${project.id}`}
          >
            <span className="truncate">{project.label}</span>
            {count > 0 ? (
              <span
                className={cn(
                  "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none",
                  active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                )}
                aria-hidden="true"
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
