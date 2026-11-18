import { describe, it, expect } from "vitest";
import { decideDemoLoginRequest, DEMO_GUARD_TABLES, type DemoLoginDecision } from "../demo-login-guard";

const ME = "visitor-1";
const decide = (method: string, path: string, extra: { query?: Record<string, unknown>; body?: unknown } = {}) =>
  decideDemoLoginRequest({ method, path, userId: ME, ...extra });
const blocked = (d: DemoLoginDecision) => !d.allow;
const checks = (d: DemoLoginDecision) => (d.allow ? d.checks : null);

describe("decideDemoLoginRequest", () => {
  it("refuses people, teams, roles and Demo Mode changes", () => {
    expect(blocked(decide("POST", "/api/users"))).toBe(true);
    expect(blocked(decide("POST", "/api/teams"))).toBe(true);
    expect(blocked(decide("PUT", "/api/roles/3"))).toBe(true);
    expect(blocked(decide("POST", "/api/demo/wipe"))).toBe(true);
    expect(blocked(decide("GET", "/api/demo/logins"))).toBe(true);
  });

  it("still lets the banner read Demo Mode status", () => {
    expect(decide("GET", "/api/demo/status")).toEqual({ allow: true, checks: [] });
  });

  it("refuses pages that show real records or secrets", () => {
    for (const path of ["/api/audit-logins", "/api/archive/projects", "/api/email-logs", "/api/system/secrets", "/api/admin/backup/list", "/api/view-as/options", "/api/salesforce/opportunities"]) {
      expect(blocked(decide("GET", path))).toBe(true);
    }
    expect(blocked(decide("GET", "/api/error-logs"))).toBe(true);
    expect(blocked(decide("POST", "/api/error-logs"))).toBe(false);
  });

  it("keeps real settings read-only", () => {
    expect(blocked(decide("GET", "/api/status-configs"))).toBe(false);
    expect(blocked(decide("PUT", "/api/status-configs/1"))).toBe(true);
    expect(blocked(decide("POST", "/api/email-configuration"))).toBe(true);
    expect(blocked(decide("POST", "/api/email-automation/config"))).toBe(true);
  });

  it("blocks password changes and profile edits but allows display preferences", () => {
    expect(blocked(decide("POST", "/api/users/me/password"))).toBe(true);
    expect(blocked(decide("PUT", "/api/users/me", { body: { firstName: "Mallory" } }))).toBe(true);
    expect(decide("PUT", "/api/users/me", { body: { theme: "dark", preferredLocale: "de-DE" } })).toEqual({ allow: true, checks: [] });
  });

  it("allows sign-in and MFA enrollment", () => {
    expect(blocked(decide("POST", "/api/login"))).toBe(false);
    expect(blocked(decide("POST", "/api/mfa/totp/setup"))).toBe(false);
    expect(blocked(decide("POST", "/api/logout"))).toBe(false);
  });

  it("checks that a record named in the path is demo data", () => {
    expect(checks(decide("GET", "/api/projects/42"))).toEqual([{ table: "projects", id: 42 }]);
    expect(checks(decide("PATCH", "/api/products/7"))).toEqual([{ table: "products", id: 7 }]);
    expect(checks(decide("PUT", "/api/map/tasks/9"))).toEqual([{ table: "map_tasks", id: 9 }]);
    expect(checks(decide("DELETE", "/api/gaps/5"))).toEqual([
      { table: "project_gaps", id: 5, via: { column: "project_id", table: "projects" } },
    ]);
    // Reads of project outcomes name the project; writes name the outcome.
    expect(checks(decide("GET", "/api/project-outcomes/12"))).toEqual([{ table: "projects", id: 12 }]);
    expect(checks(decide("PATCH", "/api/project-outcomes/12"))).toEqual([
      { table: "project_outcomes", id: 12, via: { column: "project_id", table: "projects" } },
    ]);
  });

  it("checks project and account ids in the query and body", () => {
    expect(checks(decide("GET", "/api/success-criteria", { query: { projectId: "8" } }))).toEqual([{ table: "projects", id: 8 }]);
    expect(checks(decide("POST", "/api/project-assumptions", { body: { projectId: 8, customerId: 3 } }))).toEqual([
      { table: "projects", id: 8 },
      { table: "customers", id: 3 },
    ]);
  });

  it("refuses changes that reach the CRM, send email or spend on AI", () => {
    expect(blocked(decide("POST", "/api/customers/3/crm-refresh"))).toBe(true);
    expect(blocked(decide("POST", "/api/email-templates/2/send-test"))).toBe(true);
    expect(blocked(decide("POST", "/api/projects/4/analyze-risk"))).toBe(true);
    expect(blocked(decide("POST", "/api/tags/system/reset-defaults"))).toBe(true);
  });

  it("lets the visitor read only their own permissions and demo people", () => {
    expect(blocked(decide("GET", "/api/user-permissions"))).toBe(true);
    expect(blocked(decide("GET", "/api/user-permissions/someone-else"))).toBe(true);
    expect(decide("GET", `/api/user-permissions/${ME}`)).toEqual({ allow: true, checks: [] });
    expect(checks(decide("GET", "/api/users/someone-else"))).toEqual([{ table: "users", id: "someone-else" }]);
    expect(blocked(decide("PUT", "/api/users/someone-else"))).toBe(true);
  });

  it("serves only demo, branding and the visitor's own files", () => {
    expect(decide("GET", "/api/files/demo/documents/a.pdf")).toEqual({ allow: true, checks: [] });
    expect(decide("GET", `/api/files/system/documents/${ME}/a.pdf`)).toEqual({ allow: true, checks: [] });
    expect(decide("GET", "/api/files/system/documents/other/a.pdf")).toEqual({ allow: false, status: 404 });
    expect(checks(decide("GET", "/api/files/accounts/6/documents/a.pdf"))).toEqual([{ table: "customers", id: 6 }]);
  });

  it("only puts known table names into SQL", () => {
    for (const path of ["/api/projects/1", "/api/gaps/1", "/api/map/steps/1", "/api/dashboard/layouts/1"]) {
      const d = decide("DELETE", path);
      for (const c of checks(d) ?? []) expect(DEMO_GUARD_TABLES.has(c.table)).toBe(true);
    }
  });
});
