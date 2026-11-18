import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  FolderPlus,
  ClipboardPenLine,
  Boxes,
  Trash2, 
  GripVertical,
  Clock,
  Target,
  CheckSquare,
  PackageCheck,
  Folder,
  FileText,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { DangerIconButton } from '@/components/shared/danger-icon-button';
import { DEPARTMENTS } from '@/config/departments';
import { hexToRgba, useJourneyStages } from '@/components/value-journey/use-value-journey';
import {
  MapTemplateOffsetFields,
  MapTemplateScheduleChip,
  absoluteOffsets,
  readOffsets,
} from './map-template-offset-fields';
import type { 
  MapTemplatePhase,
  MapTemplateStep, 
  MapTemplateTask
} from '@shared/schema';

// Extended types for tree editing with children arrays. Database-generated
// columns (id, templateId, phaseId, stepId, createdAt, updatedAt) are made
// optional so that newly-created draft rows in the editor are well-typed
// before they are persisted.
type EditableSchemaFields = 'id' | 'templateId' | 'phaseId' | 'stepId' | 'createdAt' | 'updatedAt';

export interface MapTemplatePhaseWithChildren
  extends Omit<MapTemplatePhase, EditableSchemaFields> {
  id?: number;
  templateId?: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  steps: MapTemplateStepWithChildren[];
}

export interface MapTemplateStepWithChildren
  extends Omit<MapTemplateStep, EditableSchemaFields | 'phaseLocalKey'> {
  id?: number;
  phaseId?: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  tasks: MapTemplateTask[];
  phaseLocalKey?: string; // Editor-only field for tracking
}

interface TreeEditorProps {
  phases: MapTemplatePhaseWithChildren[];
  onPhasesChange: (phases: MapTemplatePhaseWithChildren[]) => void;
  readonly?: boolean;
  onValidationChange?: (hasErrors: boolean) => void; // For hooking validation into save flow
}

// Status options for Steps. Option 2 dark-mode pairing — saturated
// 600 in light, 700 in dark.
const STATUS_OPTIONS = [
  { value: 'not_started', labelKey: 'notStarted', color: 'bg-gray-600 dark:bg-gray-700' },
  { value: 'in_progress', labelKey: 'inProgress', color: 'bg-blue-600 dark:bg-blue-700' },
  { value: 'blocked', labelKey: 'blocked', color: 'bg-red-600 dark:bg-red-700' },
  { value: 'complete', labelKey: 'complete', color: 'bg-green-600 dark:bg-green-700' },
  { value: 'deferred', labelKey: 'deferred', color: 'bg-yellow-600 dark:bg-yellow-700' },
  { value: 'stalled', labelKey: 'stalled', color: 'bg-orange-600 dark:bg-orange-700' },
  { value: 'at_risk', labelKey: 'atRisk', color: 'bg-purple-600 dark:bg-purple-700' }
];

const SELECT_CLASS = 'mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-background rounded-md text-sm';

export default function MapTemplateTreeEditor({ phases, onPhasesChange, readonly = false, onValidationChange }: TreeEditorProps) {
  const { t } = useTranslation();
  const { data: journeyStages = [] } = useJourneyStages();
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<{ type: string; phaseIndex: number; stepIndex?: number; taskIndex?: number } | null>(null);

  // Validation helper functions
  const errorAt = (location: string, message: string) =>
    t('templates.mapTreeEditor.errors.format', { location, message: t(`templates.mapTreeEditor.errors.${message}`) });

  // Offsets: non-negative, and the due offset not before the start offset.
  const offsetErrors = (item: { defaultStartOffsetDays?: number | null; defaultDueOffsetDays?: number | null }, location: string): string[] => {
    const { start, due } = readOffsets(item);
    if (start < 0 || due < 0) return [errorAt(location, 'offsetsNegative')];
    if (due < start) return [errorAt(location, 'dueBeforeStart')];
    return [];
  };

  const validatePhase = (phase: MapTemplatePhaseWithChildren, phaseIndex: number): string[] => {
    const errors: string[] = [];
    const location = t('templates.mapTreeEditor.location.phase', { phase: phaseIndex + 1 });
    if (!phase.name?.trim()) errors.push(errorAt(location, 'nameRequired'));
    if ((phase.expectedDays || 0) < 0) errors.push(errorAt(location, 'expectedDaysNegative'));
    errors.push(...offsetErrors(phase, location));
    return errors;
  };

  const validateStep = (step: MapTemplateStepWithChildren, phaseIndex: number, stepIndex: number): string[] => {
    const errors: string[] = [];
    const location = t('templates.mapTreeEditor.location.step', { phase: phaseIndex + 1, step: stepIndex + 1 });
    if (!step.name?.trim()) errors.push(errorAt(location, 'nameRequired'));
    if ((step.expectedDays || 0) < 0) errors.push(errorAt(location, 'expectedDaysNegative'));
    errors.push(...offsetErrors(step, location));
    return errors;
  };

  const validateTask = (task: MapTemplateTask, phaseIndex: number, stepIndex: number, taskIndex: number): string[] => {
    const errors: string[] = [];
    const location = t('templates.mapTreeEditor.location.task', { phase: phaseIndex + 1, step: stepIndex + 1, task: taskIndex + 1 });
    if (!task.name?.trim()) errors.push(errorAt(location, 'nameRequired'));
    if ((Number(task.expectedHours) || 0) < 0) errors.push(errorAt(location, 'expectedHoursNegative'));
    errors.push(...offsetErrors(task, location));
    return errors;
  };

  // Validate all tree data
  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    
    phases.forEach((phase, phaseIndex) => {
      errors.push(...validatePhase(phase, phaseIndex));
      phase.steps?.forEach((step, stepIndex) => {
        errors.push(...validateStep(step, phaseIndex, stepIndex));
        step.tasks?.forEach((task, taskIndex) => {
          errors.push(...validateTask(task, phaseIndex, stepIndex, taskIndex));
        });
      });
    });
    
    return errors;
  };

  // Auto-expand all phases on mount for better UX
  useEffect(() => {
    setExpandedPhases(new Set(phases.map((_, index) => index)));
  }, [phases.length]);

  // Notify parent of validation changes
  useEffect(() => {
    const validationErrors = getValidationErrors();
    onValidationChange?.(validationErrors.length > 0);
  }, [phases, onValidationChange]);

  // Toggle phase expansion
  const togglePhase = (phaseIndex: number) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(phaseIndex)) {
        newSet.delete(phaseIndex);
      } else {
        newSet.add(phaseIndex);
      }
      return newSet;
    });
  };

  // Toggle step expansion
  const toggleStep = (phaseIndex: number, stepIndex: number) => {
    const key = `${phaseIndex}-${stepIndex}`;
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Add new phase
  const addPhase = () => {
    const phaseLocalKey = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPhase: MapTemplatePhaseWithChildren = {
      localKey: phaseLocalKey,
      name: t('templates.mapTreeEditor.phaseN', { n: phases.length + 1 }),
      description: '',
      expectedDays: 0,
      orderIndex: phases.length,
      defaultStartOffsetDays: 0,
      defaultDueOffsetDays: 7,
      sendExternalEmails: true,
      isDemo: false,
      stageId: null,
      steps: [],
    };
    onPhasesChange([...phases, newPhase]);
  };

  // Add new step to phase
  const addStep = (phaseIndex: number) => {
    const updatedPhases = [...phases];
    const phase = updatedPhases[phaseIndex];
    const stepLocalKey = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newStep: MapTemplateStepWithChildren = {
      localKey: stepLocalKey,
      name: t('templates.mapTreeEditor.stepN', { n: phase.steps.length + 1 }),
      description: '',
      expectedDays: 0,
      defaultStatus: 'not_started',
      teamOwned: 'N/A',
      orderIndex: phase.steps.length,
      defaultStartOffsetDays: 0,
      defaultDueOffsetDays: 7,
      sendExternalEmails: true,
      isDemo: false,
      phaseLocalKey: stepLocalKey,
      tasks: [],
    };
    
    phase.steps.push(newStep);
    
    // Sync parent phase's expectedDays (new step starts at 0, but for consistency)
    updatedPhases[phaseIndex].expectedDays = calculatePhaseExpectedDays(updatedPhases[phaseIndex]);
    
    onPhasesChange(updatedPhases);

    // Auto-expand the step
    const stepKey = `${phaseIndex}-${phase.steps.length - 1}`;
    setExpandedSteps(prev => new Set([...prev, stepKey]));
  };

  // Add new task to step
  const addTask = (phaseIndex: number, stepIndex: number) => {
    const updatedPhases = [...phases];
    const step = updatedPhases[phaseIndex].steps[stepIndex];
    
    const newTask: MapTemplateTask = {
      name: t('templates.mapTreeEditor.taskN', { n: step.tasks.length + 1 }),
      description: '',
      expectedHours: '0',
      defaultStatus: 'not_started',
      teamOwned: 'N/A',
      orderIndex: step.tasks.length,
      defaultStartOffsetDays: 0,
      defaultDueOffsetDays: 7,
      sendExternalEmails: true
    } as MapTemplateTask;
    
    step.tasks.push(newTask);
    onPhasesChange(updatedPhases);
  };

  // Update phase. Generic over the field key so each call site is checked
  // against the matching property type on `MapTemplatePhaseWithChildren`.
  const updatePhase = <K extends keyof MapTemplatePhaseWithChildren>(
    phaseIndex: number,
    field: K,
    value: MapTemplatePhaseWithChildren[K],
  ) => {
    const updatedPhases = [...phases];
    updatedPhases[phaseIndex] = { ...updatedPhases[phaseIndex], [field]: value };
    onPhasesChange(updatedPhases);
  };

  // Update step
  const updateStep = <K extends keyof MapTemplateStepWithChildren>(
    phaseIndex: number,
    stepIndex: number,
    field: K,
    value: MapTemplateStepWithChildren[K],
  ) => {
    const updatedPhases = [...phases];
    const phase = updatedPhases[phaseIndex];
    const updatedSteps = [...phase.steps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], [field]: value };
    updatedPhases[phaseIndex] = { ...phase, steps: updatedSteps };

    // If expectedDays changed, sync the parent phase's expectedDays
    if (field === 'expectedDays') {
      updatedPhases[phaseIndex].expectedDays = calculatePhaseExpectedDays(updatedPhases[phaseIndex]);
    }

    onPhasesChange(updatedPhases);
  };

  // Update task
  const updateTask = <K extends keyof MapTemplateTask>(
    phaseIndex: number,
    stepIndex: number,
    taskIndex: number,
    field: K,
    value: MapTemplateTask[K],
  ) => {
    const updatedPhases = [...phases];
    const phase = updatedPhases[phaseIndex];
    const updatedSteps = [...phase.steps];
    const step = updatedSteps[stepIndex];
    const updatedTasks = [...step.tasks];
    updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], [field]: value };
    updatedSteps[stepIndex] = { ...step, tasks: updatedTasks };
    updatedPhases[phaseIndex] = { ...phase, steps: updatedSteps };
    onPhasesChange(updatedPhases);
  };

  // Delete phase
  const deletePhase = (phaseIndex: number) => {
    const updatedPhases = phases.filter((_, index) => index !== phaseIndex);
    // Reorder remaining phases
    updatedPhases.forEach((phase, index) => {
      phase.orderIndex = index;
    });
    onPhasesChange(updatedPhases);
  };

  // Delete step
  const deleteStep = (phaseIndex: number, stepIndex: number) => {
    const updatedPhases = [...phases];
    updatedPhases[phaseIndex].steps = updatedPhases[phaseIndex].steps.filter((_, index) => index !== stepIndex);
    // Reorder remaining steps
    updatedPhases[phaseIndex].steps.forEach((step, index) => {
      step.orderIndex = index;
    });
    
    // Sync parent phase's expectedDays after deleting step
    updatedPhases[phaseIndex].expectedDays = calculatePhaseExpectedDays(updatedPhases[phaseIndex]);
    
    onPhasesChange(updatedPhases);
  };

  // Delete task
  const deleteTask = (phaseIndex: number, stepIndex: number, taskIndex: number) => {
    const updatedPhases = [...phases];
    updatedPhases[phaseIndex].steps[stepIndex].tasks = updatedPhases[phaseIndex].steps[stepIndex].tasks.filter((_, index) => index !== taskIndex);
    // Reorder remaining tasks
    updatedPhases[phaseIndex].steps[stepIndex].tasks.forEach((task, index) => {
      task.orderIndex = index;
    });
    onPhasesChange(updatedPhases);
  };

  // Helper function to format hours consistently as 00.00h
  const formatHours = (hours: number | string | null | undefined): string => {
    const numHours = typeof hours === 'number' ? hours : parseFloat(String(hours)) || 0;
    return t('templates.mapTreeEditor.hoursShort', { hours: numHours.toFixed(2) });
  };

  // Calculate rollup hours for step (sum of task hours)
  const calculateStepHours = (step: MapTemplateStepWithChildren): number => {
    return step.tasks.reduce((total, task) => {
      const hours = typeof task.expectedHours === 'number' 
        ? task.expectedHours 
        : parseFloat(String(task.expectedHours)) || 0;
      return total + hours;
    }, 0);
  };

  // Calculate rollup hours for phase (sum of all step task hours)
  const calculatePhaseHours = (phase: MapTemplatePhaseWithChildren): number => {
    return phase.steps.reduce((total, step) => total + calculateStepHours(step), 0);
  };

  // Calculate expected days for a phase (sum of all step days)
  const calculatePhaseExpectedDays = (phase: MapTemplatePhaseWithChildren): number => {
    return phase.steps.reduce((total, step) => total + (step.expectedDays || 0), 0);
  };

  // Calculate total template hours
  const calculateTotalHours = (): number => {
    return phases.reduce((total, phase) => total + calculatePhaseHours(phase), 0);
  };

  // Calculate total template days
  const calculateTotalDays = (): number => {
    return phases.reduce((total, phase) => total + calculatePhaseExpectedDays(phase), 0);
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusConfig = STATUS_OPTIONS.find(option => option.value === status);
    return (
      <Badge className={cn(statusConfig?.color || 'bg-gray-600', 'text-white text-xs')}>
        {statusConfig ? t(`templates.mapTreeEditor.status.${statusConfig.labelKey}`) : status}
      </Badge>
    );
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, type: string, phaseIndex: number, stepIndex?: number, taskIndex?: number) => {
    if (readonly) return;
    setDraggedItem({ type, phaseIndex, stepIndex, taskIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetType: string, targetPhaseIndex: number, targetStepIndex?: number, targetTaskIndex?: number) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event from bubbling up to parent drop zones
    if (!draggedItem || readonly) return;

    const newPhases = [...phases];
    
    // Handle different drag-and-drop scenarios
    if (draggedItem.type === 'phase' && targetType === 'phase') {
      // Reorder phases
      const draggedPhase = newPhases[draggedItem.phaseIndex];
      newPhases.splice(draggedItem.phaseIndex, 1);
      newPhases.splice(targetPhaseIndex, 0, draggedPhase);
      
      // Update order indices
      newPhases.forEach((phase, index) => {
        phase.orderIndex = index;
      });
    } 
    else if (draggedItem.type === 'step' && targetType === 'step' && draggedItem.stepIndex !== undefined && targetStepIndex !== undefined) {
      // Reorder steps within the same phase or between phases
      const sourcePhase = newPhases[draggedItem.phaseIndex];
      const targetPhase = newPhases[targetPhaseIndex];
      const draggedStep = sourcePhase.steps[draggedItem.stepIndex];
      
      // Remove from source
      sourcePhase.steps.splice(draggedItem.stepIndex, 1);
      
      // Add to target
      targetPhase.steps.splice(targetStepIndex, 0, draggedStep);
      
      // Update order indices for both phases
      sourcePhase.steps.forEach((step, index) => {
        step.orderIndex = index;
      });
      targetPhase.steps.forEach((step, index) => {
        step.orderIndex = index;
      });
      
      // Sync expectedDays for both affected phases
      newPhases[draggedItem.phaseIndex].expectedDays = calculatePhaseExpectedDays(newPhases[draggedItem.phaseIndex]);
      newPhases[targetPhaseIndex].expectedDays = calculatePhaseExpectedDays(newPhases[targetPhaseIndex]);
    }
    else if (draggedItem.type === 'task' && draggedItem.stepIndex !== undefined && draggedItem.taskIndex !== undefined) {
      // Handle task drops - can drop onto another task OR onto a step
      // Only proceed if the target is valid (task or step), otherwise ignore the drop
      if ((targetType === 'task' && targetStepIndex !== undefined && targetTaskIndex !== undefined) ||
          (targetType === 'step' && targetStepIndex !== undefined)) {
        
        const sourceStep = newPhases[draggedItem.phaseIndex].steps[draggedItem.stepIndex];
        const draggedTask = sourceStep.tasks[draggedItem.taskIndex];
        
        // Remove from source first
        sourceStep.tasks.splice(draggedItem.taskIndex, 1);
        
        if (targetType === 'task' && targetStepIndex !== undefined && targetTaskIndex !== undefined) {
          // Dropping onto another task - insert at that position
          const targetStep = newPhases[targetPhaseIndex].steps[targetStepIndex];
          
          // Adjust target index if dropping within same step after the removed item
          let adjustedTargetIndex = targetTaskIndex;
          if (draggedItem.phaseIndex === targetPhaseIndex && 
              draggedItem.stepIndex === targetStepIndex && 
              draggedItem.taskIndex < targetTaskIndex) {
            adjustedTargetIndex = targetTaskIndex - 1;
          }
          
          targetStep.tasks.splice(adjustedTargetIndex, 0, draggedTask);
          
          // Update order indices for target step
          targetStep.tasks.forEach((task, index) => {
            task.orderIndex = index;
          });
        } else if (targetType === 'step' && targetStepIndex !== undefined) {
          // Dropping onto a step - append to end of that step's tasks
          const targetStep = newPhases[targetPhaseIndex].steps[targetStepIndex];
          draggedTask.orderIndex = targetStep.tasks.length;
          targetStep.tasks.push(draggedTask);
          
          // Update order indices for target step
          targetStep.tasks.forEach((task, index) => {
            task.orderIndex = index;
          });
        }
        
        // Update order indices for source step
        sourceStep.tasks.forEach((task, index) => {
          task.orderIndex = index;
        });
      }
      // If target is not a valid task/step drop zone, ignore the drop (task stays in place)
    }
    
    onPhasesChange(newPhases);
    setDraggedItem(null);
  };


  // Calculate rollup values for expectedDays and expectedHours
  const calculateRollups = () => {
    const phasesWithRollups = phases.map(phase => {
      const stepsWithRollups = phase.steps.map(step => {
        // Calculate step rollup from tasks
        const totalTaskHours = step.tasks.reduce((sum, task) => sum + (Number(task.expectedHours) || 0), 0);
        const totalTaskDays = Math.ceil(totalTaskHours / 8); // Assuming 8-hour work days
        
        return {
          ...step,
          calculatedExpectedDays: Math.max(step.expectedDays || 0, totalTaskDays),
          calculatedExpectedHours: totalTaskHours
        };
      });
      
      // Calculate phase rollup from steps
      const totalStepDays = stepsWithRollups.reduce((sum, step) => sum + (step.calculatedExpectedDays || 0), 0);
      const totalStepHours = stepsWithRollups.reduce((sum, step) => sum + (step.calculatedExpectedHours || 0), 0);
      
      return {
        ...phase,
        steps: stepsWithRollups,
        calculatedExpectedDays: Math.max(phase.expectedDays || 0, totalStepDays),
        calculatedExpectedHours: totalStepHours
      };
    });
    
    return phasesWithRollups;
  };

  const phasesWithRollups = calculateRollups();

  return (
    <div className="space-y-4">
      {/* Validation Errors Display */}
      {!readonly && (() => {
        const validationErrors = getValidationErrors();
        if (validationErrors.length > 0) {
          return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">{t('templates.mapTreeEditor.validationTitle')}</h4>
              <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          );
        }
        return null;
      })()}
      
      {/* Summary Stats */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <ClipboardPenLine className="h-4 w-4 text-blue-600" />
                <div className="text-2xl font-bold text-blue-600">{phases.length}</div>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">{t('templates.mapTreeEditor.stats.phases')}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Boxes className="h-4 w-4 text-blue-600" />
                <div className="text-2xl font-bold text-blue-600">{phases.reduce((total, phase) => total + phase.steps.length, 0)}</div>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">{t('templates.mapTreeEditor.stats.steps')}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Clock className="h-4 w-4 text-blue-600" />
                <div className="text-2xl font-bold text-blue-600">{formatHours(calculateTotalHours())}</div>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">{t('templates.mapTreeEditor.stats.totalHours')}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Calendar className="h-4 w-4 text-blue-600" />
                <div className="text-2xl font-bold text-blue-600">{calculateTotalDays()}</div>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">{t('templates.mapTreeEditor.stats.totalDays')}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Phase Button */}
      {!readonly && (
        <Button onClick={addPhase} className="w-full">
          <ClipboardPenLine className="h-4 w-4 mr-2" />
          {t('templates.mapTreeEditor.addPhase')}
        </Button>
      )}

      {/* Phases Tree */}
      <div className="space-y-3">
        {phases.map((phase, phaseIndex) => {
          const phaseSpan = absoluteOffsets(0, phase);
          return (
          <Card 
            key={phaseIndex} 
            className="border-l-4 border-purple-500"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'phase', phaseIndex)}
          >
            <CardContent className="p-4">
              {/* Phase Header */}
              <div 
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => togglePhase(phaseIndex)}
              >
                {!readonly && (
                  <div 
                    className="cursor-move"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'phase', phaseIndex)}
                  >
                    <GripVertical className="h-4 w-4 text-gray-400" />
                  </div>
                )}
                {expandedPhases.has(phaseIndex) ? (
                  <ChevronDown className="h-4 w-4 text-purple-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-purple-600" />
                )}
                <ClipboardPenLine className="h-4 w-4 text-purple-600" />
                <span className="font-semibold text-purple-800 dark:text-purple-200">{t('templates.mapTreeEditor.phaseN', { n: phaseIndex + 1 })}</span>
                {(() => {
                  const stage = journeyStages.find((s) => s.id === phase.stageId);
                  return stage ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold dark:brightness-150"
                      style={{ backgroundColor: hexToRgba(stage.color, 0.14), color: stage.color }}
                      data-testid={`template-phase-stage-${phaseIndex}`}
                    >
                      {stage.name}
                    </span>
                  ) : null;
                })()}
                <div className="flex items-center gap-2 ml-auto">
                  <MapTemplateScheduleChip start={phaseSpan.start} due={phaseSpan.due} />
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatHours(calculatePhaseHours(phase))}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {t('templates.mapTreeEditor.daysShort', { days: calculatePhaseExpectedDays(phase) })}
                  </div>
                  {!readonly && (
                    <DangerIconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePhase(phaseIndex);
                      }}
                      aria-label={t('templates.mapTreeEditor.deletePhase')}
                    >
                      <Trash2 />
                    </DangerIconButton>
                  )}
                </div>
              </div>

              {/* Phase Content */}
              {expandedPhases.has(phaseIndex) && (
                <div className="mt-4 space-y-4">
                  {/* Phase Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.phaseName')}</Label>
                      <Input
                        value={phase.name}
                        onChange={(e) => updatePhase(phaseIndex, 'name', e.target.value)}
                        readOnly={readonly}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">
                        {t('templates.mapTreeEditor.fields.expectedDays')}
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-normal">{t('templates.mapTreeEditor.fields.autoCalculated')}</span>
                      </Label>
                      <Input
                        type="number"
                        value={calculatePhaseExpectedDays(phase)}
                        readOnly
                        className="mt-1 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                        title={t('templates.mapTreeEditor.fields.autoCalculatedTitle')}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`template-phase-stage-select-${phaseIndex}`} className="text-sm font-medium">{t('valueJourney.map.stage')}</Label>
                      <select
                        id={`template-phase-stage-select-${phaseIndex}`}
                        value={phase.stageId ?? ''}
                        onChange={(e) => updatePhase(phaseIndex, 'stageId', e.target.value ? Number(e.target.value) : null)}
                        disabled={readonly}
                        className={SELECT_CLASS}
                      >
                        <option value="">{t('valueJourney.map.noStage')}</option>
                        {journeyStages.map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.name}</option>
                        ))}
                      </select>
                    </div>
                    <MapTemplateOffsetFields
                      level="phase"
                      item={phase}
                      readonly={readonly}
                      onChange={(field, value) => updatePhase(phaseIndex, field, value)}
                      helpClassName="md:col-span-2"
                    />
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.description')}</Label>
                      <Textarea
                        value={phase.description ?? ''}
                        onChange={(e) => updatePhase(phaseIndex, 'description', e.target.value)}
                        readOnly={readonly}
                        className="mt-1"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Add Step Button */}
                  {!readonly && (
                    <Button 
                      onClick={() => addStep(phaseIndex)}
                      size="sm"
                      className="ml-6"
                    >
                      <Boxes className="h-4 w-4 mr-2" />
                      {t('templates.mapTreeEditor.addStep')}
                    </Button>
                  )}

                  {/* Steps */}
                  <div className="ml-6 space-y-3">
                    {phase.steps.map((step, stepIndex) => {
                      const stepKey = `${phaseIndex}-${stepIndex}`;
                      const isStepExpanded = expandedSteps.has(stepKey);
                      const stepSpan = absoluteOffsets(phaseSpan.start, step);
                      
                      return (
                        <Card 
                          key={stepIndex} 
                          className="border-l-4 border-blue-500"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'step', phaseIndex, stepIndex)}
                        >
                          <CardContent className="p-3">
                            {/* Step Header */}
                            <div 
                              className="flex items-center gap-2 cursor-pointer"
                              onClick={() => toggleStep(phaseIndex, stepIndex)}
                            >
                              {!readonly && (
                                <div 
                                  className="cursor-move"
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, 'step', phaseIndex, stepIndex)}
                                >
                                  <GripVertical className="h-4 w-4 text-gray-400" />
                                </div>
                              )}
                              {isStepExpanded ? (
                                <ChevronDown className="h-4 w-4 text-blue-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-blue-600" />
                              )}
                              <Boxes className="h-4 w-4 text-blue-600" />
                              <span className="font-medium text-blue-800 dark:text-blue-200">{t('templates.mapTreeEditor.stepN', { n: stepIndex + 1 })}</span>
                              {getStatusBadge(step.defaultStatus)}
                              <div className="flex items-center gap-2 ml-auto">
                                <MapTemplateScheduleChip start={stepSpan.start} due={stepSpan.due} />
                                <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                  <Clock className="h-3 w-3" />
                                  {formatHours(calculateStepHours(step))}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                  <Calendar className="h-3 w-3" />
                                  {t('templates.mapTreeEditor.daysShort', { days: step.expectedDays ?? 0 })}
                                </div>
                                {!readonly && (
                                  <DangerIconButton
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteStep(phaseIndex, stepIndex);
                                    }}
                                    aria-label={t('templates.mapTreeEditor.deleteStep')}
                                  >
                                    <Trash2 />
                                  </DangerIconButton>
                                )}
                              </div>
                            </div>

                            {/* Step Content */}
                            {isStepExpanded && (
                              <div className="mt-3 space-y-3">
                                {/* Step Details */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                  <div>
                                    <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.stepName')}</Label>
                                    <Input
                                      value={step.name}
                                      onChange={(e) => updateStep(phaseIndex, stepIndex, 'name', e.target.value)}
                                      readOnly={readonly}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.teamOwned')}</Label>
                                    <select
                                      value={step.teamOwned || 'N/A'}
                                      onChange={(e) => updateStep(phaseIndex, stepIndex, 'teamOwned', e.target.value)}
                                      disabled={readonly}
                                      className={SELECT_CLASS}
                                    >
                                      {DEPARTMENTS.map(dept => (
                                        <option key={dept.value} value={dept.value}>
                                          {t(dept.labelKey, { defaultValue: dept.label })}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.expectedDays')}</Label>
                                    <Input
                                      type="number"
                                      value={step.expectedDays ?? 0}
                                      onChange={(e) => updateStep(phaseIndex, stepIndex, 'expectedDays', parseInt(e.target.value) || 0)}
                                      readOnly={readonly}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.defaultStatus')}</Label>
                                    <select
                                      value={step.defaultStatus}
                                      onChange={(e) => updateStep(phaseIndex, stepIndex, 'defaultStatus', e.target.value)}
                                      disabled={readonly}
                                      className={SELECT_CLASS}
                                    >
                                      {STATUS_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>
                                          {t(`templates.mapTreeEditor.status.${option.labelKey}`)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <MapTemplateOffsetFields
                                    level="step"
                                    item={step}
                                    readonly={readonly}
                                    onChange={(field, value) => updateStep(phaseIndex, stepIndex, field, value)}
                                    helpClassName="md:col-span-2"
                                  />
                                  <div className="md:col-span-4">
                                    <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.description')}</Label>
                                    <Textarea
                                      value={step.description ?? ''}
                                      onChange={(e) => updateStep(phaseIndex, stepIndex, 'description', e.target.value)}
                                      readOnly={readonly}
                                      className="mt-1"
                                      rows={2}
                                    />
                                  </div>
                                </div>

                                {/* Add Task Button */}
                                {!readonly && (
                                  <Button 
                                    onClick={() => addTask(phaseIndex, stepIndex)}
                                    size="sm"
                                    className="ml-6"
                                  >
                                    <PackageCheck className="h-4 w-4 mr-2" />
                                    {t('templates.mapTreeEditor.addTask')}
                                  </Button>
                                )}

                                {/* Tasks */}
                                <div className="ml-6 space-y-2">
                                  {step.tasks.map((task, taskIndex) => {
                                    const taskSpan = absoluteOffsets(stepSpan.start, task);
                                    return (
                                    <Card 
                                      key={taskIndex} 
                                      className="border-l-4 border-green-500"
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, 'task', phaseIndex, stepIndex, taskIndex)}
                                    >
                                      <CardContent className="p-3">
                                        <div className="flex items-center gap-2 mb-3">
                                          {!readonly && (
                                            <div 
                                              className="cursor-move"
                                              draggable
                                              onDragStart={(e) => handleDragStart(e, 'task', phaseIndex, stepIndex, taskIndex)}
                                            >
                                              <GripVertical className="h-4 w-4 text-gray-400" />
                                            </div>
                                          )}
                                          <PackageCheck className="h-4 w-4 text-green-600" />
                                          <span className="font-medium text-green-800 dark:text-green-200">{t('templates.mapTreeEditor.taskN', { n: taskIndex + 1 })}</span>
                                          {getStatusBadge(task.defaultStatus)}
                                          <div className="ml-auto">
                                            <MapTemplateScheduleChip start={taskSpan.start} due={taskSpan.due} />
                                          </div>
                                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                            <Clock className="h-3 w-3" />
                                            {formatHours(task.expectedHours)}
                                          </div>
                                          {!readonly && (
                                            <DangerIconButton
                                              onClick={() => deleteTask(phaseIndex, stepIndex, taskIndex)}
                                              aria-label={t('templates.mapTreeEditor.deleteTask')}
                                            >
                                              <Trash2 />
                                            </DangerIconButton>
                                          )}
                                        </div>

                                        {/* Task Details */}
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                          <div>
                                            <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.taskName')}</Label>
                                            <Input
                                              value={task.name}
                                              onChange={(e) => updateTask(phaseIndex, stepIndex, taskIndex, 'name', e.target.value)}
                                              readOnly={readonly}
                                              className="mt-1"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.teamOwned')}</Label>
                                            <select
                                              value={task.teamOwned || 'N/A'}
                                              onChange={(e) => updateTask(phaseIndex, stepIndex, taskIndex, 'teamOwned', e.target.value)}
                                              disabled={readonly}
                                              className={SELECT_CLASS}
                                            >
                                              {DEPARTMENTS.map(dept => (
                                                <option key={dept.value} value={dept.value}>
                                                  {t(dept.labelKey, { defaultValue: dept.label })}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.expectedHours')}</Label>
                                            <Input
                                              type="number"
                                              step="0.5"
                                              value={task.expectedHours ?? 0}
                                              onChange={(e) => updateTask(phaseIndex, stepIndex, taskIndex, 'expectedHours', String(parseFloat(e.target.value) || 0))}
                                              readOnly={readonly}
                                              className="mt-1"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.defaultStatus')}</Label>
                                            <select
                                              value={task.defaultStatus}
                                              onChange={(e) => updateTask(phaseIndex, stepIndex, taskIndex, 'defaultStatus', e.target.value)}
                                              disabled={readonly}
                                              className={SELECT_CLASS}
                                            >
                                              {STATUS_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>
                                                  {t(`templates.mapTreeEditor.status.${option.labelKey}`)}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <MapTemplateOffsetFields
                                            level="task"
                                            item={task}
                                            readonly={readonly}
                                            onChange={(field, value) => updateTask(phaseIndex, stepIndex, taskIndex, field, value)}
                                            helpClassName="md:col-span-2"
                                          />
                                          <div className="md:col-span-4">
                                            <Label className="text-sm font-medium">{t('templates.mapTreeEditor.fields.description')}</Label>
                                            <Textarea
                                              value={task.description ?? ''}
                                              onChange={(e) => updateTask(phaseIndex, stepIndex, taskIndex, 'description', e.target.value)}
                                              readOnly={readonly}
                                              className="mt-1"
                                              rows={2}
                                            />
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>

      {phases.length === 0 && !readonly && (
        <Card className="border-dashed border-2 border-gray-300 dark:border-gray-700">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('templates.mapTreeEditor.empty.title')}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{t('templates.mapTreeEditor.empty.body')}</p>
            <Button onClick={addPhase}>
              <Plus className="h-4 w-4 mr-2" />
              {t('templates.mapTreeEditor.addFirstPhase')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}