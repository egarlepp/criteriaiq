import { describe, expect, it } from "vitest";
import {
  buildReportCsv,
  buildReportHtmlTable,
  checkReportRecipients,
  describeReportDateWindow,
  formatReportValue,
  reportCsvFilename,
  resolveReportDateWindow,
} from "../scheduled-report-format";
import { isKnownReportField } from "../report-fields";
import { SYSTEM_REPORTS, getSystemReport } from "@shared/system-reports";

const NOW = new Date("2026-10-31T12:00:00Z");

describe("resolveReportDateWindow", () => {
  it("calendar presets end now", () => {
    const w = resolveReportDateWindow({ dateRangeMode: "calendar", dateRange: "last_7_days" }, NOW);
    expect(w).toEqual({ mode: "calendar", start: new Date("2026-10-24T12:00:00Z"), end: NOW });
    const ytd = resolveReportDateWindow({ dateRange: "year_to_date" }, NOW);
    expect(ytd).toMatchObject({ mode: "calendar", start: new Date("2026-01-01T00:00:00Z") });
    const quarter = resolveReportDateWindow({ dateRange: "last_quarter" }, NOW);
    expect(quarter).toMatchObject({ start: new Date("2026-07-31T12:00:00Z") });
  });

  it("defaults to the last 30 days", () => {
    expect(resolveReportDateWindow({}, NOW)).toMatchObject({ start: new Date("2026-10-01T12:00:00Z") });
  });

  it("custom calendar range covers whole days and must be complete and ordered", () => {
    const w = resolveReportDateWindow({ dateRange: "custom", customStartDate: "2026-09-01", customEndDate: "2026-09-30" }, NOW);
    expect(w).toEqual({
      mode: "calendar",
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-09-30T23:59:59.999Z"),
    });
    expect(() => resolveReportDateWindow({ dateRange: "custom", customStartDate: "2026-09-01" }, NOW)).toThrow(/incomplete/);
    expect(() =>
      resolveReportDateWindow({ dateRange: "custom", customStartDate: "2026-10-01", customEndDate: "2026-09-01" }, NOW),
    ).toThrow(/after/);
  });

  it("project mode bounds start and end dates independently", () => {
    expect(resolveReportDateWindow({ dateRangeMode: "project" }, NOW)).toEqual({ mode: "project", start: {}, end: {} });
    const w = resolveReportDateWindow(
      { dateRangeMode: "project", projectStartDateRef: "start_last_30_days", projectEndDateRef: "custom_end", customEndDate: "2026-12-31" },
      NOW,
    );
    expect(w).toEqual({
      mode: "project",
      start: { from: new Date("2026-10-01T12:00:00Z"), to: NOW },
      end: { to: new Date("2026-12-31T23:59:59.999Z") },
    });
    expect(() => resolveReportDateWindow({ dateRangeMode: "project", projectStartDateRef: "custom_start" }, NOW)).toThrow(
      /custom start/,
    );
  });

  it("describes the window in one line", () => {
    expect(describeReportDateWindow({ mode: "calendar", start: new Date("2026-10-01"), end: NOW })).toBe(
      "Projects active 2026-10-01 to 2026-10-31",
    );
    expect(describeReportDateWindow({ mode: "project", start: {}, end: {} })).toBe("All projects");
    expect(describeReportDateWindow({ mode: "project", start: { from: new Date("2026-10-01") }, end: { to: NOW } })).toBe(
      "Projects with start date on or after 2026-10-01 and end date on or before 2026-10-31",
    );
  });
});

describe("checkReportRecipients", () => {
  const users = [
    { email: "SE@corp.com", role: "se", isActive: true, isApproved: true },
    { email: "old@corp.com", role: "se", isActive: false, isApproved: true },
    { email: "pending@corp.com", role: "admin", isActive: true, isApproved: false },
    { email: "cust@client.com", role: "Customer", isActive: true, isApproved: true },
  ];

  it("keeps active approved staff (case-insensitive) and skips everyone else once", () => {
    const check = checkReportRecipients(
      ["se@corp.com", "SE@corp.com", "old@corp.com", "pending@corp.com", "cust@client.com", "nobody@x.com", " "],
      users,
    );
    expect(check.allowed).toEqual(["se@corp.com"]);
    expect(check.skipped).toEqual([
      { email: "old@corp.com", reason: "inactive" },
      { email: "pending@corp.com", reason: "inactive" },
      { email: "cust@client.com", reason: "outside_user" },
      { email: "nobody@x.com", reason: "not_a_user" },
    ]);
  });
});

describe("report output", () => {
  const columns = [
    { key: "name", label: "Name" },
    { key: "acv", label: "ACV", type: "number" },
    { key: "start", label: "Start, date", type: "date" },
    { key: "tags", label: "Tags" },
  ];

  it("formats values as plain text", () => {
    expect(formatReportValue(null)).toBe("");
    expect(formatReportValue(new Date("2026-10-31T12:00:00Z"))).toBe("2026-10-31");
    expect(formatReportValue("2026-10-31T12:00:00Z", "date")).toBe("2026-10-31");
    expect(formatReportValue(["a", null, "b"])).toBe("a; b");
    expect(formatReportValue(true)).toBe("Yes");
  });

  it("builds RFC 4180 CSV and defuses spreadsheet formulas in text only", () => {
    const csv = buildReportCsv(columns, [
      { name: 'Acme "East", Inc', acv: -5, start: new Date("2026-10-01T00:00:00Z"), tags: ["x"] },
      { name: "=HYPERLINK(1)", acv: null, start: null, tags: "-2+3" },
      { name: "line\nbreak", acv: 10 },
    ]);
    expect(csv).toBe(
      'Name,ACV,"Start, date",Tags\r\n' +
        '"Acme ""East"", Inc",-5,2026-10-01,x\r\n' +
        "'=HYPERLINK(1),,,'-2+3\r\n" +
        '"line\nbreak",10,,\r\n',
    );
  });

  it("escapes HTML in the table", () => {
    const html = buildReportHtmlTable([{ key: "n", label: "<b>Name</b>" }], [{ n: "<script>x</script>" }]);
    expect(html).toContain("&lt;b&gt;Name&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("names the CSV after the report and day", () => {
    expect(reportCsvFilename("Project Status Report", NOW)).toBe("project-status-report-2026-10-31.csv");
    expect(reportCsvFilename("¿¿", NOW)).toBe("report-2026-10-31.csv");
  });
});

describe("built-in report definitions", () => {
  it("keep the ids Schedule Report has always saved", () => {
    expect(SYSTEM_REPORTS.map((r) => r.id)).toEqual([
      "project-status",
      "customer-activity",
      "team-performance",
      "risk-analysis",
      "success-criteria",
      "map-progress",
    ]);
    expect(getSystemReport("risk-analysis")?.name).toBe("Risk Analysis Report");
    expect(getSystemReport("nope")).toBeUndefined();
  });

  it("use only fields the report catalog knows (or the legacy primaryEngineer)", () => {
    for (const report of SYSTEM_REPORTS) {
      for (const field of [...report.selectedFields, ...report.filters.map((f) => f.field)]) {
        expect(field === "primaryEngineer" || isKnownReportField(field), `${report.id}: ${field}`).toBe(true);
      }
    }
  });

  it("MAP Progress selects the project id it needs for task counts", () => {
    const map = getSystemReport("map-progress");
    expect(map?.includeMapProgress).toBe(true);
    expect(map?.selectedFields).toContain("id");
  });
});
