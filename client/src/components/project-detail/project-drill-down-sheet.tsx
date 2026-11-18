import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Eye, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { PocWithRelations } from "@shared/schema";

interface ProjectDrillDownSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  projects: PocWithRelations[];
  description?: string;
}

export function ProjectDrillDownSheet({
  isOpen,
  onOpenChange,
  title,
  projects,
  description
}: ProjectDrillDownSheetProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:w-[640px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>
            {description || t('projects.drillDown.foundProjects', { count: projects.length })}
          </SheetDescription>
        </SheetHeader>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('projects.drillDown.project')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('projects.drillDown.dates')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-gray-500">
                    {t('projects.drillDown.noProjectsFound')}
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-blue-600">
                          {project.customerName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {project.solutionName || t('projects.drillDown.noSolution')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">{t('projects.drillDown.endLabel')}</span>
                          {project.endDate ? format(new Date(project.endDate), 'MMM d') : '-'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false);
                          setLocation(`/project/${project.id}?source=drilldown`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
