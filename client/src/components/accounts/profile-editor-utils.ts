import type { UserProfile } from "./profile-editor-types";

/**
 * Profile Completeness. `crmConnected` adds the user's CRM link as one more
 * item (true/false); null leaves it out (no CRM chosen, or an outside user
 * who never uses it).
 */
export function calculateCompleteness(userProfile: UserProfile | undefined, crmConnected: boolean | null = null): number {
  if (!userProfile) return 0;
  const fields: unknown[] = [
    userProfile.firstName,
    userProfile.lastName,
    userProfile.accountId ? "linked" : undefined,
    userProfile.title,
    userProfile.region,
    userProfile.department,
  ];
  if (crmConnected !== null) fields.push(crmConnected ? "connected" : undefined);
  const filled = fields.filter(f => f && (typeof f === 'string' ? f.trim() : true)).length;
  return Math.round((filled / fields.length) * 100);
}
