import { useState } from "react";
import { MapPhase } from "@/types/map";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Check, Clock, AlertTriangle, XCircle, Target, ClipboardPenLine } from "lucide-react";

interface MapPhaseProgressBarProps {
  phases: MapPhase[];
  selectedPhaseId: number | null;
  onPhaseClick: (phaseId: number | null) => void;
  getStepCounts: (phaseId: number) => { completed: number; total: number };
  calculatePhaseProgress: (phaseId: number) => number;
}

// `ringColor` is the soft outer ring of the phase circle (light tint
// in both modes). `fillColor` is the saturated inner-circle fill that
// holds the white "P1/P2/…" label. Naming convention: `bg-X-200
// dark:bg-X-900` for tints, `bg-X-600 dark:bg-X-700` for saturated
// fills (matches the rest of the app's tint pairing + Option 2
// from the dark-mode saturation review).
const statusConfig = {
  not_started: { ringColor: 'bg-gray-200 dark:bg-gray-800', fillColor: 'bg-gray-600 dark:bg-gray-700', icon: Clock, label: 'Not Started' },
  in_progress: { ringColor: 'bg-blue-200 dark:bg-blue-900', fillColor: 'bg-blue-600 dark:bg-blue-700', icon: Target, label: 'In Progress' },
  complete: { ringColor: 'bg-green-200 dark:bg-green-900', fillColor: 'bg-green-600 dark:bg-green-700', icon: Check, label: 'Complete' },
  blocked: { ringColor: 'bg-red-200 dark:bg-red-900', fillColor: 'bg-red-600 dark:bg-red-700', icon: AlertTriangle, label: 'Blocked' },
  deferred: { ringColor: 'bg-yellow-200 dark:bg-yellow-900', fillColor: 'bg-yellow-600 dark:bg-yellow-700', icon: XCircle, label: 'Deferred' },
  stalled: { ringColor: 'bg-orange-200 dark:bg-orange-900', fillColor: 'bg-orange-600 dark:bg-orange-700', icon: AlertTriangle, label: 'Stalled' },
  at_risk: { ringColor: 'bg-amber-200 dark:bg-amber-900', fillColor: 'bg-amber-600 dark:bg-amber-700', icon: AlertTriangle, label: 'At Risk' }
};

export function MapPhaseProgressBar({
  phases,
  selectedPhaseId,
  onPhaseClick,
  getStepCounts,
  calculatePhaseProgress
}: MapPhaseProgressBarProps) {
  const [hoveredPhaseId, setHoveredPhaseId] = useState<number | null>(null);

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Not set';
    try {
      return format(new Date(date), 'M/d/yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className="w-full py-6 px-4">
      <div className="flex items-center justify-center gap-0">
        {phases.map((phase, index) => {
          const statusInfo = statusConfig[phase.status as keyof typeof statusConfig] || statusConfig.not_started;
          const stepCounts = getStepCounts(phase.id);
          const progress = calculatePhaseProgress(phase.id);
          const isSelected = selectedPhaseId === phase.id;
          
          return (
            <div key={phase.id} className="flex items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={() => onPhaseClick(isSelected ? null : phase.id)}
                    onMouseEnter={() => setHoveredPhaseId(phase.id)}
                    onMouseLeave={() => setHoveredPhaseId(null)}
                    className={cn(
                      "relative flex items-center justify-center w-16 h-16 rounded-full transition-all",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                      statusInfo.ringColor,
                      isSelected && "ring-4 ring-blue-500 ring-offset-2"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-12 h-12 rounded-full text-white font-bold text-lg",
                      statusInfo.fillColor
                    )}>
                      P{index + 1}
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80" side="bottom" align="center">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-purple-600 flex items-center gap-2">
                        <ClipboardPenLine className="h-4 w-4" />
                        {phase.name}
                      </h4>
                      {phase.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{phase.description}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Steps:</span>
                        <span className="font-medium">{stepCounts.completed}/{stepCounts.total} completed</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Progress:</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Status:</span>
                        <span className={cn("font-medium", statusInfo.fillColor.split(' ')[0].replace('bg-', 'text-'))}>{statusInfo.label}</span>
                      </div>
                    </div>
                    <div className="border-t pt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <div className="flex justify-between">
                        <span>Started:</span>
                        <span>{formatDate(phase.startDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Due:</span>
                        <span>{formatDate(phase.dueDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completed:</span>
                        <span>{formatDate(phase.completedDate)}</span>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {index < phases.length - 1 && (
                <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 mx-1">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectedPhaseId && (
        <div className="text-center mt-3">
          <span className="text-sm text-blue-600 font-medium">
            Filtering by: {phases.find(p => p.id === selectedPhaseId)?.name}
            <button
              onClick={() => onPhaseClick(null)}
              className="ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
            >
              Clear filter
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
