// @vitest-environment node
//
// {{json x}} sits inside quoted JSON string values in the built-in webhook
// templates ("data": "{{json metadata}}"). It must render to a body that
// parses, with the value restored as a real nested object.

import { describe, expect, it, vi } from "vitest";
import Handlebars from "handlebars";

vi.mock("../../storage.js", () => ({ storage: {} }));

const { restoreJsonValues } = await import("../webhook-service");
const { WEBHOOK_TEMPLATES } = await import("../webhook-templates");

function render(template: string, data: Record<string, unknown>) {
  return restoreJsonValues(JSON.parse(Handlebars.compile(template)(data)));
}

describe("json template helper", () => {
  const metadata = { projectName: 'Acme "POC"', nested: { a: 1, list: ["x", "y"] }, note: "line1\nline2" };

  it("renders nested objects with quotes and newlines as real JSON values", () => {
    const body = render('{"event": "{{triggerKey}}", "data": "{{json metadata}}"}', {
      triggerKey: "project.updated",
      metadata,
    });
    expect(body).toEqual({ event: "project.updated", data: metadata });
  });

  it("renders a missing value as null", () => {
    expect(render('{"data": "{{json missing}}"}', {})).toEqual({ data: null });
  });

  it("keeps surrounding text when json is embedded in a longer string", () => {
    expect(render('{"text": "ids: {{json ids}}"}', { ids: [1, 2] })).toEqual({ text: "ids: [1,2]" });
  });

  it("every built-in template renders to valid JSON with nested metadata", () => {
    for (const [id, def] of Object.entries(WEBHOOK_TEMPLATES)) {
      const source = typeof def.template === "string" ? def.template : JSON.stringify(def.template);
      expect(() => render(source, { ...metadata, metadata, changes: { status: "done" } }), id).not.toThrow();
    }
  });
});
