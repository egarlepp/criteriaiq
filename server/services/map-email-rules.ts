// Runs Workflow Automation rules for MAP events (phase, step and task
// assigned / completed / due soon / status changed), so an admin's rule can
// email about them. Before, MAP events reached only the bell, the digest and
// webhooks. Nothing is emailed unless a rule exists for the event, and each
// recipient's Profile and project MAP email choices still apply
// (server/email/map-email-preferences.ts, checked by the engine).
import { onAutomationEvent } from "./automation-events";
import { evaluateAndExecute } from "../email/email-automation-engine";
import { mapEventDedupKey, parseMapEventKey } from "../email/map-email-preferences";

let registered = false;

/** Called once at boot. */
export function registerMapEmailRules(): void {
  if (registered) return;
  registered = true;
  onAutomationEvent((event) => {
    if (!parseMapEventKey(event.triggerKey) || event.projectId == null) return;
    void evaluateAndExecute({
      triggerKey: event.triggerKey,
      projectId: String(event.projectId),
      userId: event.userId,
      metadata: event.metadata,
      dedupKey: mapEventDedupKey(event.triggerKey, event.metadata),
    }).catch((err: unknown) => {
      console.error(`[map-email-rules] Rules for "${event.triggerKey}" failed:`, err);
    });
  });
}
