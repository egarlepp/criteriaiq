// @vitest-environment node
//
// Account Users from CRM contacts, against the real Postgres in
// DATABASE_URL (skips without one). The CRM is a fake session. Covers the
// three security rules Eric confirmed: imported users can't sign in until
// invited, a CRM email change is only flagged, and a contact gone from the
// CRM account is flagged, not deactivated.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const crm = vi.hoisted(() => ({
  contacts: [] as Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; title: string | null }>,
  connected: true,
}));
const mail = vi.hoisted(() => ({ sendWelcomeEmail: vi.fn(async () => true) }));

vi.mock("../crm/index", () => ({
  getActiveCrmProvider: async () => ({
    id: "hubspot",
    isRecordId: (id: string) => /^\d{1,20}$/.test(id),
    connectForUser: async () => (crm.connected ? { contactsForAccount: async () => crm.contacts } : null),
  }),
}));
vi.mock("../email/email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWelcomeEmail: mail.sendWelcomeEmail }));

import { db } from "../db";
import { storage } from "../storage";
import { customers, users } from "@shared/schema";
import {
  acceptCrmEmail,
  importAccountContacts,
  inviteContactUser,
  listAccountContacts,
  stopContactSync,
} from "../crm/account-contacts";

const MARKER = "ACC-TEST";
const DOMAIN = "acc-test-acme.io";
const url = (id: string) => `https://app.hubspot.com/contacts/1/record/0-2/${id}`;
const engineer = { id: "u-engineer", role: "Engineer" };
const admin = { id: "u-admin", role: "Admin" };

async function cleanup(): Promise<void> {
  if (!db) return;
  await db.delete(users).where(sql`${users.email} LIKE ${"%" + DOMAIN} OR ${users.email} LIKE ${"%acc-test-other.io"}`);
  await db.delete(customers).where(sql`${customers.accountName} LIKE ${MARKER + "%"}`);
}

async function linkedAccount() {
  return storage.createCustomer({
    accountName: `${MARKER} Acme`,
    salesforceAccountUrl: url("820001"),
    approvedEmailDomains: [DOMAIN],
  } as never);
}

describe.skipIf(!process.env.DATABASE_URL)("Account Users from CRM contacts", () => {
  beforeAll(cleanup);
  afterEach(async () => {
    crm.contacts = [];
    crm.connected = true;
    mail.sendWelcomeEmail.mockClear();
    await cleanup();
  });
  afterAll(cleanup);

  it("lists contacts with what each one is, and imports profiles that can't sign in", async () => {
    const account = await linkedAccount();
    crm.contacts = [
      { id: "1", firstName: "Ana", lastName: "Lima", email: `ana@${DOMAIN}`, title: "CTO" },
      { id: "2", firstName: "Bo", lastName: "Chen", email: "bo@acc-test-other.io", title: null },
      { id: "3", firstName: "Cy", lastName: "Personal", email: "cy@gmail.com", title: null },
    ];

    const list = await listAccountContacts(account.id, engineer.id);
    expect(list.status).toBe("ok");
    if (list.status !== "ok") return;
    expect(list.contacts.map((c) => [c.id, c.state, c.reason ?? null])).toEqual([
      ["1", "available", null],
      ["2", "adminOnly", null],
      ["3", "blocked", "personalDomain"],
    ]);

    const result = await importAccountContacts(account.id, ["1", "2", "3"], engineer);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.results.map((r) => [r.contactId, r.outcome])).toEqual([
      ["1", "imported"],
      ["2", "skipped"],
      ["3", "skipped"],
    ]);
    const ana = await storage.getUser(result.results[0].userId!);
    expect(ana).toMatchObject({
      accountId: account.id,
      role: "Customer",
      isActive: false,
      isApproved: false,
      crmProvider: "hubspot",
      crmContactId: "1",
      title: "CTO",
    });
    expect(mail.sendWelcomeEmail).not.toHaveBeenCalled();

    // An Admin may import the unapproved domain.
    const byAdmin = await importAccountContacts(account.id, ["2"], admin);
    expect(byAdmin.status === "ok" && byAdmin.results[0].outcome).toBe("imported");
  });

  it("links an existing user of the account instead of creating a second one", async () => {
    const account = await linkedAccount();
    const existing = await storage.createUser({
      id: "user_acc_test_existing",
      email: `dee@${DOMAIN}`,
      firstName: "Dee",
      lastName: "Old",
      role: "Customer",
      accountId: account.id,
      isActive: true,
    } as never);
    crm.contacts = [{ id: "4", firstName: "Dee", lastName: "New", email: `DEE@${DOMAIN}`, title: "VP" }];
    const result = await importAccountContacts(account.id, ["4"], engineer);
    expect(result.status === "ok" && result.results[0]).toMatchObject({ outcome: "linked", userId: existing.id });
    const after = await storage.getUser(existing.id);
    // Linked, not re-created, and access untouched.
    expect(after).toMatchObject({ crmContactId: "4", lastName: "New", title: "VP", isActive: true });
  });

  it("keeps imported users in step: names follow, a new email is flagged, a removed contact is flagged", async () => {
    const account = await linkedAccount();
    crm.contacts = [
      { id: "5", firstName: "Eve", lastName: "Old", email: `eve@${DOMAIN}`, title: null },
      { id: "6", firstName: "Fay", lastName: "Gone", email: `fay@${DOMAIN}`, title: null },
    ];
    const imported = await importAccountContacts(account.id, ["5", "6"], engineer);
    if (imported.status !== "ok") throw new Error("import failed");
    const [eveId, fayId] = imported.results.map((r) => r.userId!);
    await inviteContactUser(account.id, fayId, admin.id);

    crm.contacts = [{ id: "5", firstName: "Eve", lastName: "Renamed", email: `eve.new@${DOMAIN}`, title: "Head of IT" }];
    const list = await listAccountContacts(account.id, engineer.id);
    if (list.status !== "ok") throw new Error("list failed");

    const eve = await storage.getUser(eveId);
    expect(eve).toMatchObject({ lastName: "Renamed", title: "Head of IT", email: `eve@${DOMAIN}`, crmEmail: `eve.new@${DOMAIN}` });
    expect(list.contacts[0].user).toEqual({ isActive: false, crmEmail: `eve.new@${DOMAIN}` });

    const fay = await storage.getUser(fayId);
    expect(fay?.crmContactMissingAt).toBeInstanceOf(Date);
    // Flagged, not deactivated.
    expect(fay?.isActive).toBe(true);
    expect(list.missing.map((m) => m.userId)).toEqual([fayId]);

    // An Admin accepts the email; unticking keeps the user as added in CriteriaIQ.
    expect(await acceptCrmEmail(account.id, eveId)).toBe("accepted");
    expect((await storage.getUser(eveId))?.email).toBe(`eve.new@${DOMAIN}`);
    expect(await stopContactSync(account.id, fayId)).toBe("stopped");
    expect(await storage.getUser(fayId)).toMatchObject({ crmContactId: null, crmContactMissingAt: null, isActive: true });
  });

  it("Invite gives login access once and sends the welcome email", async () => {
    const account = await linkedAccount();
    crm.contacts = [{ id: "7", firstName: "Gus", lastName: "Hill", email: `gus@${DOMAIN}`, title: null }];
    const imported = await importAccountContacts(account.id, ["7"], engineer);
    if (imported.status !== "ok") throw new Error("import failed");
    const gusId = imported.results[0].userId!;
    expect(await inviteContactUser(account.id, gusId, admin.id)).toBe("invited");
    expect(await storage.getUser(gusId)).toMatchObject({ isActive: true, isApproved: true, approvedBy: admin.id });
    expect(mail.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(await inviteContactUser(account.id, gusId, admin.id)).toBe("already_active");
    // Not a contact user of another account.
    expect(await inviteContactUser(account.id + 100000, gusId, admin.id)).toBe("not_found");
  });

  it("answers why there is nothing to list", async () => {
    const unlinked = await storage.createCustomer({ accountName: `${MARKER} Unlinked` } as never);
    expect((await listAccountContacts(unlinked.id, engineer.id)).status).toBe("not_linked");
    const account = await linkedAccount();
    crm.connected = false;
    expect((await listAccountContacts(account.id, engineer.id)).status).toBe("not_connected");
  });
});
