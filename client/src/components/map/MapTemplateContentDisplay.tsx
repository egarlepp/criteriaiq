import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClipboardPenLine, Boxes, PackageCheck, ChevronRight, ChevronDown, Clock, Calendar, LayoutTemplate } from "lucide-react";

// Helper function to calculate total hours from tasks
const calculateTaskHours = (tasks: any[]): number => {
  if (!tasks || tasks.length === 0) return 0;
  
  return tasks.reduce((total, task) => {
    const hours = (task as any).expectedHours;
    const numericHours = Number(hours) || 0;
    return total + numericHours;
  }, 0);
};

// Helper function to calculate phase rollup totals
const calculatePhaseRollup = (steps: any[]): { totalDays: number; totalHours: number } => {
  let totalDays = 0;
  let totalHours = 0;
  
  if (!steps || steps.length === 0) {
    return { totalDays, totalHours };
  }
  
  steps.forEach(step => {
    // Add step days
    const stepDays = (step as any).expectedDays;
    totalDays += Number(stepDays) || 0;
    
    // Add task hours from all tasks in this step
    if (step.tasks && Array.isArray(step.tasks)) {
      totalHours += calculateTaskHours(step.tasks);
    }
  });
  
  return { totalDays, totalHours };
};

// Helper function to calculate template summary totals
const calculateTemplateSummary = (phases: any[]): { phaseCount: number; stepCount: number; taskCount: number; totalDays: number; totalHours: number } => {
  let stepCount = 0;
  let taskCount = 0;
  let totalDays = 0;
  let totalHours = 0;
  
  if (!phases || phases.length === 0) {
    return { phaseCount: 0, stepCount, taskCount, totalDays, totalHours };
  }
  
  phases.forEach(phase => {
    if (phase.steps && Array.isArray(phase.steps)) {
      stepCount += phase.steps.length;
      
      phase.steps.forEach((step: any) => {
        // Add step days
        totalDays += Number((step as any).expectedDays) || 0;
        
        // Count and sum tasks
        if (step.tasks && Array.isArray(step.tasks)) {
          taskCount += step.tasks.length;
          totalHours += calculateTaskHours(step.tasks);
        }
      });
    }
  });
  
  return { phaseCount: phases.length, stepCount, taskCount, totalDays, totalHours };
};

// Helper function to determine phase border color (for template view)
const getPhaseBorderColor = (): string => {
  return '#E5E7EB'; // Default gray border for templates
};

interface MapTemplateContentDisplayProps {
  templateContent: {
    phases: Array<{
      id: number;
      name: string;
      description: string | null;
      orderIndex: number;
      steps: Array<{
        id: number;
        name: string;
        description: string | null;
        orderIndex: number;
        tasks: Array<{
          id: number;
          name: string;
          description: string | null;
          orderIndex: number;
        }>;
      }>;
    }>;
  } | null;
  showSummary?: boolean;
}

export function MapTemplateContentDisplay({ templateContent, showSummary = true }: MapTemplateContentDisplayProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  if (!templateContent) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading content...</div>
    );
  }

  const summary = showSummary ? calculateTemplateSummary(templateContent.phases) : null;

  return (
    <div className="space-y-4">
      {/* Template Summary */}
      {showSummary && summary && (
        <div className="border rounded-lg p-4 bg-white dark:bg-gray-900 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" />
            Template Summary
          </h3>
          <div className="grid grid-cols-5 gap-4">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <ClipboardPenLine className="h-5 w-5" />
                <span className="text-2xl font-bold">{summary.phaseCount}</span>
              </div>
              <span className="text-sm text-muted-foreground">Phases</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Boxes className="h-5 w-5" />
                <span className="text-2xl font-bold">{summary.stepCount}</span>
              </div>
              <span className="text-sm text-muted-foreground">Steps</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <PackageCheck className="h-5 w-5" />
                <span className="text-2xl font-bold">{summary.taskCount}</span>
              </div>
              <span className="text-sm text-muted-foreground">Tasks</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-orange-600 mb-1">
                <Clock className="h-5 w-5" />
                <span className="text-2xl font-bold">{summary.totalHours.toFixed(summary.totalHours % 1 === 0 ? 0 : 1)}h</span>
              </div>
              <span className="text-sm text-muted-foreground">Hours</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-indigo-600 mb-1">
                <Calendar className="h-5 w-5" />
                <span className="text-2xl font-bold">{summary.totalDays}</span>
              </div>
              <span className="text-sm text-muted-foreground">Total Days</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Phases */}
      {templateContent.phases.map((phase, phaseIndex) => {
        const phaseRollup = calculatePhaseRollup(phase.steps || []);
        
        return (
          <div key={phase.id} className="border rounded-lg p-4" style={{
            backgroundColor: phaseIndex === 0 ? '#fffef5' : phaseIndex === 1 ? '#fff8f5' : phaseIndex === 2 ? '#f2f8fd' : phaseIndex === 3 ? '#fcf8fc' : phaseIndex === 4 ? '#f1f8f3' : '#ffffff',
            borderColor: getPhaseBorderColor(),
            borderWidth: '2px'
          }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-purple-600 flex items-center gap-2">
                <ClipboardPenLine className="h-4 w-4" />
                Phase {phaseIndex + 1}: {phase.name}
              </h4>
              <div className="flex items-center gap-3">
                {phaseRollup.totalDays > 0 && (
                  <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{phaseRollup.totalDays}d</span>
                  </div>
                )}
                {phaseRollup.totalHours > 0 && (
                  <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{phaseRollup.totalHours.toFixed(phaseRollup.totalHours % 1 === 0 ? 0 : 1)}h</span>
                  </div>
                )}
              </div>
            </div>
            {phase.description && (
              <p className="text-sm text-muted-foreground mb-3">{phase.description}</p>
            )}
            {phase.steps && phase.steps.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2 text-blue-600">
                  <Boxes className="h-4 w-4" />
                  Steps
                </Label>
                {phase.steps.map((step, stepIndex) => {
                  const stepId = `${phase.id}-${step.id}`;
                  const isExpanded = expandedSteps.has(stepId);
                  const hasTasks = step.tasks && step.tasks.length > 0;
                  const taskCount = step.tasks?.length || 0;
                  const stepTaskHours = hasTasks ? calculateTaskHours(step.tasks) : 0;
                  
                  return (
                    <div key={step.id} className="ml-4">
                      <Collapsible open={isExpanded} onOpenChange={() => toggleStepExpansion(stepId)}>
                        <CollapsibleTrigger asChild>
                          <div className="p-2 rounded text-sm cursor-pointer transition-colors flex items-center justify-between" style={{ backgroundColor: phaseIndex === 0 ? '#f5f3e5' : phaseIndex === 1 ? '#f5e8e5' : phaseIndex === 2 ? '#e2e8ed' : phaseIndex === 3 ? '#ece8ec' : phaseIndex === 4 ? '#e1e8e3' : '#f5f3e5' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = phaseIndex === 0 ? '#ebe9d5' : phaseIndex === 1 ? '#ebd8d5' : phaseIndex === 2 ? '#d2d8dd' : phaseIndex === 3 ? '#dcd8dc' : phaseIndex === 4 ? '#d1d8d3' : '#ebe9d5'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = phaseIndex === 0 ? '#f5f3e5' : phaseIndex === 1 ? '#f5e8e5' : phaseIndex === 2 ? '#e2e8ed' : phaseIndex === 3 ? '#ece8ec' : phaseIndex === 4 ? '#e1e8e3' : '#f5f3e5'}>
                            <div className="flex-1">
                              <span className="font-medium">
                                {stepIndex + 1}. {step.name} {taskCount > 0 && <span className="text-muted-foreground">({taskCount} Task{taskCount !== 1 ? 's' : ''})</span>}
                              </span>
                              {step.description && (
                                <p className="text-muted-foreground mt-1">{step.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2 shrink-0">
                              {(step as any).expectedDays !== undefined && (step as any).expectedDays !== null && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span>{(step as any).expectedDays}d</span>
                                </div>
                              )}
                              {stepTaskHours > 0 && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{stepTaskHours.toFixed(stepTaskHours % 1 === 0 ? 0 : 1)}h</span>
                                </div>
                              )}
                              {hasTasks && (
                                <>
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        {hasTasks && (
                          <CollapsibleContent className="mt-2">
                            <div className="ml-6 space-y-1">
                              <Label className="text-sm font-medium flex items-center gap-2 text-green-600">
                                <PackageCheck className="h-4 w-4" />
                                Tasks
                              </Label>
                              {step.tasks.map((task, taskIndex) => (
                                <div key={task.id} className="p-2 border rounded text-xs" style={{ backgroundColor: phaseIndex === 0 ? '#ebe9d5' : phaseIndex === 1 ? '#ebd8d5' : phaseIndex === 2 ? '#d2d8dd' : phaseIndex === 3 ? '#dcd8dc' : phaseIndex === 4 ? '#d1d8d3' : '#ebe9d5' }}>
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                      {taskIndex + 1}. {task.name}
                                    </span>
                                    {(task as any).expectedHours !== undefined && (task as any).expectedHours !== null && (
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        <span>{(task as any).expectedHours}h</span>
                                      </div>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-muted-foreground mt-1">{task.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        )}
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
