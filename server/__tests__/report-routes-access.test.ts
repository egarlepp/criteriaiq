// @vitest-environment node
//
// Reports read every project (deal fields, owning team) with no account
// scoping, so every report route must be staff only. Report Builder was
// archived (archive/analytics-builders/), and the routes only it called were
// removed; this test keeps them from coming back without a guard.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "../routes/audit-and-reports-routes.ts"),
  "utf8",
);

/** Each `app.<method>('<path>', ...middleware` registration in the file. */
function registrations(): Array<{ method: string; route: string; line: string }> {
  const out: Array<{ method: string; route: string; line: string }> = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]([^\n]*)/g;
  for (const m of source.matchAll(re)) {
    out.push({ method: m[1].toUpperCase(), route: m[2], line: m[3] });
  }
  return out;
}

const REPORT_ROUTE = /^\/api\/(custom-reports|built-in-reports|user-report-favorites|report-builder|report-schedules)/;

describe("report routes", () => {
  const reportRoutes = registrations().filter((r) => REPORT_ROUTE.test(r.route));

  it("finds the report routes", () => {
    expect(reportRoutes.map((r) => `${r.method} ${r.route}`).sort()).toEqual([
      "DELETE /api/custom-reports/:reportId",
      "DELETE /api/user-report-favorites",
      "GET /api/built-in-reports/:reportId/results",
      "GET /api/custom-reports",
      "GET /api/report-builder/fields",
      "GET /api/report-schedules",
      "GET /api/user-report-favorites",
      "POST /api/custom-reports/:reportId/execute",
      "POST /api/user-report-favorites",
    ]);
  });

  it.each(reportRoutes.map((r) => [`${r.method} ${r.route}`, r.line]))(
    "%s is staff only",
    (_name, line) => {
      expect(line).toContain("isAuthenticated");
      expect(line).toContain("requireInternalUser");
    },
  );
});
