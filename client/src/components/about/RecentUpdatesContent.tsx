import { Zap, CheckCircle2 } from "lucide-react";

export function RecentUpdatesContent() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Zap className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong className="text-amber-600 dark:text-amber-400">
            NEW: Value Journey:
          </strong>{" "}
          Plan, Build, Validate, Decide and Handoff stages label the MAP. Success criteria link to MAP tasks, and the customer agrees to the criteria before the validation starts.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Zap className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong className="text-amber-600 dark:text-amber-400">
            NEW: Customer workspace:
          </strong>{" "}
          The project page and Account Portal share one layout with a roadmap, calendar and project messages, and customers can mark their to-dos done.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Also new:</strong> Accounts linked to the CRM, teams synced from SSO and the CRM, an Evaluation Requests page, a redesigned MAP drawer and Reports page, and a full Demo Mode.
        </p>
      </div>
    </div>
  );
}
