// The user fields a CRM contact owns once imported (server/crm/account-contacts.ts).
// The server keeps them on save; the user dialog shows them read-only.
export const CRM_CONTACT_FIELDS = ["firstName", "lastName", "title"] as const;
export type CrmContactField = (typeof CRM_CONTACT_FIELDS)[number];
