import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DependencyCard, type DependencyRecord, type SuccessCriterion, type Product } from "./AssumptionsDependenciesTab";

interface CriterionDependenciesDrawerProps {
  open: boolean;
  onClose: () => void;
  lineNumber?: number;
  criterionText?: string;
  deps: DependencyRecord[];
  products: Product[];
  successCriteria: SuccessCriterion[];
  allUsers?: { id: string; role?: string | null }[];
}

export function CriterionDependenciesDrawer({
  open,
  onClose,
  lineNumber,
  criterionText,
  deps,
  products,
  successCriteria,
  allUsers = [],
}: CriterionDependenciesDrawerProps) {
  const { t } = useTranslation();
  const isAllDepsMode = criterionText == null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 py-4 border-b bg-purple-900 dark:bg-purple-950/70 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-white">
            {isAllDepsMode ? (
              <Link2 className="h-5 w-5 text-purple-300 shrink-0" />
            ) : (
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-purple-300 text-purple-900 text-xs font-bold shrink-0">
                {lineNumber}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              {!isAllDepsMode && (
                <Link2 className="h-4 w-4 text-purple-300 shrink-0" />
              )}
              <span className="text-sm font-medium leading-snug line-clamp-2 text-white">
                {isAllDepsMode ? t("projects.dependencies.allProjectDependencies") : criterionText}
              </span>
            </span>
          </SheetTitle>
          <p className="text-xs text-purple-300 mt-1 pl-9">
            {isAllDepsMode
              ? t("projects.dependencies.dependencyCount", { count: deps.length })
              : t("projects.dependencies.linkedDependencyCount", { count: deps.length })}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <TooltipProvider>
            {deps.map((dep) => (
              <DependencyCard
                key={dep.id}
                item={dep}
                products={products}
                successCriteria={successCriteria}
                canEdit={false}
                readOnly={true}
                onEdit={() => {}}
                onDelete={() => {}}
                allUsers={allUsers}
              />
            ))}
          </TooltipProvider>
          {deps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isAllDepsMode
                ? t("projects.dependencies.noDepsProject")
                : t("projects.dependencies.noDepsCriterion")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
