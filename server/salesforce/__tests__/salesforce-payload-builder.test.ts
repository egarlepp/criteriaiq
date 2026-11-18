// @vitest-environment node
//
// Regression coverage for a real bug found while extracting
// buildInboundPayload/buildOutboundPayload out of salesforce-sync-service.ts
// (Workstream 4 Phase 0/1, Salesforce mapping validation + dry-run).
//
// salesforceMappingService.translateValue() returns a `{success, value,
// error}` object, but the pre-extraction code in syncInbound()/
// syncOutbound() assigned that object directly to `translatedValue`
// instead of unwrapping `.value` — so any field with a value-map
// translation configured wrote a stringified object into the target
// field instead of the translated value, and a strict-mode
// ("error_and_log") unmapped value wrote a `{success:false,...}` object
// rather than being skipped/reported. These tests pin the fixed
// behavior: a translation is only applied when it succeeds; a failed
// strict-mode translation is skipped and surfaced via
// `translationErrors`, never written to `updateData`.
//
// buildInboundPayload/buildOutboundPayload are pure functions (no
// database access) — only getCQIRecord (untested here, a thin DB
// passthrough) needs storage.

import { describe, it, expect } from "vitest";
import {
  buildInboundPayload,
  buildOutboundPayload,
  type RecordLinkShape,
  type SyncPolicyShape,
} from "../salesforce-payload-builder";

// Minimal FieldMapping fixture — only the fields the builders and
// translateValue() actually read.
function mapping(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    cqiEntity: "project",
    cqiFieldKey: "status",
    cqiFieldLabel: "Project Status",
    cqiFieldType: "picklist",
    sfObjectApiName: "Opportunity",
    sfObjectLabel: "Opportunity",
    sfFieldApiName: "StageName",
    sfFieldLabel: "Stage",
    sfFieldType: "picklist",
    direction: "bidirectional",
    transformKey: null,
    defaultValue: null,
    unmappedBehavior: "use_default",
    isCaseInsensitive: false,
    isRequired: false,
    isActive: true,
    orderIndex: 0,
    valueMaps: [] as Array<{
      id: number;
      cqiValue: string;
      sfValue: string;
      isDefault: boolean;
      isPrimaryOutbound: boolean;
    }>,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

const policy = (conflictStrategy: SyncPolicyShape["conflictStrategy"] = "salesforce_wins"): SyncPolicyShape => ({
  conflictStrategy,
});

const link = (overrides: Partial<RecordLinkShape> = {}): RecordLinkShape => ({
  sfObjectType: "Opportunity",
  sfRecordId: "006xx0000000001",
  lastInboundSync: null,
  lastOutboundSync: null,
  ...overrides,
});

describe("buildOutboundPayload", () => {
  it("passes a value through unchanged when no value maps are configured", () => {
    const result = buildOutboundPayload(
      { status: "In Progress" },
      { StageName: "Old Value" },
      [mapping({ valueMaps: [] })],
      policy(),
      link()
    );

    expect(result.updateData.StageName).toBe("In Progress");
    expect(result.translationErrors).toHaveLength(0);
    expect(result.changes).toEqual([{ field: "StageName", oldValue: "Old Value", newValue: "In Progress" }]);
  });

  it("unwraps translateValue()'s {success,value} result instead of writing the object (the bug being fixed)", () => {
    const result = buildOutboundPayload(
      { status: "Active" },
      { StageName: "Old" },
      [
        mapping({
          valueMaps: [{ id: 1, cqiValue: "Active", sfValue: "In Progress (SF)", isDefault: false, isPrimaryOutbound: false }],
        }),
      ],
      policy(),
      link()
    );

    // Previously this would have been the raw {success:true,value:"..."}
    // object, not the string.
    expect(result.updateData.StageName).toBe("In Progress (SF)");
    expect(typeof result.updateData.StageName).toBe("string");
  });

  it("prefers the isPrimaryOutbound value maps when multiple CQI values map to different SF values", () => {
    const result = buildOutboundPayload(
      { status: "Won" },
      { StageName: "Old" },
      [
        mapping({
          valueMaps: [
            { id: 1, cqiValue: "Won", sfValue: "Closed Won A", isDefault: false, isPrimaryOutbound: false },
            { id: 2, cqiValue: "Won", sfValue: "Closed Won B", isDefault: false, isPrimaryOutbound: true },
          ],
        }),
      ],
      policy(),
      link()
    );

    expect(result.updateData.StageName).toBe("Closed Won B");
  });

  it("skips the field and records a translationError under error_and_log with no match, instead of writing a garbage object", () => {
    const result = buildOutboundPayload(
      { status: "SomeUnmappedValue" },
      { StageName: "Old" },
      [
        mapping({
          unmappedBehavior: "error_and_log",
          valueMaps: [{ id: 1, cqiValue: "Won", sfValue: "Closed Won", isDefault: false, isPrimaryOutbound: false }],
        }),
      ],
      policy(),
      link()
    );

    expect(result.updateData.StageName).toBeUndefined();
    expect(result.changes).toHaveLength(0);
    expect(result.translationErrors).toEqual([
      { field: "StageName", rawValue: "SomeUnmappedValue", error: expect.any(String) },
    ]);
  });

  it("falls back to the default value map under use_default with no exact match", () => {
    const result = buildOutboundPayload(
      { status: "SomeUnmappedValue" },
      { StageName: "Old" },
      [
        mapping({
          unmappedBehavior: "use_default",
          valueMaps: [
            { id: 1, cqiValue: "Won", sfValue: "Closed Won", isDefault: false, isPrimaryOutbound: false },
            { id: 2, cqiValue: "__default__", sfValue: "Open", isDefault: true, isPrimaryOutbound: false },
          ],
        }),
      ],
      policy(),
      link()
    );

    expect(result.updateData.StageName).toBe("Open");
    expect(result.translationErrors).toHaveLength(0);
  });

  it("skips the field as a conflict (does not overwrite Salesforce) when salesforce_wins and the record was previously inbound-synced", () => {
    const result = buildOutboundPayload(
      { status: "Active" },
      { StageName: "Different SF Value" },
      [mapping({ valueMaps: [] })],
      policy("salesforce_wins"),
      link({ lastInboundSync: new Date() })
    );

    expect(result.updateData.StageName).toBeUndefined();
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolvedBy).toBe("salesforce_wins");
  });

  it("always includes Id in the update payload", () => {
    const result = buildOutboundPayload({ status: "x" }, { StageName: "x" }, [], policy(), link({ sfRecordId: "006ABC" }));
    expect(result.updateData.Id).toBe("006ABC");
  });

  it("skips fields mapped as inbound-only", () => {
    const result = buildOutboundPayload(
      { status: "Active" },
      { StageName: "Old" },
      [mapping({ direction: "inbound", valueMaps: [] })],
      policy(),
      link()
    );
    expect(result.updateData.StageName).toBeUndefined();
    expect(result.changes).toHaveLength(0);
  });
});

describe("buildInboundPayload", () => {
  it("passes a value through unchanged when no value maps are configured", () => {
    const result = buildInboundPayload(
      { status: "Old CQI Value" },
      { StageName: "New SF Value" },
      [mapping({ valueMaps: [] })],
      policy(),
      link()
    );

    expect(result.updateData.status).toBe("New SF Value");
  });

  it("unwraps translateValue()'s result instead of writing the object (the bug being fixed)", () => {
    const result = buildInboundPayload(
      { status: "Old" },
      { StageName: "In Progress (SF)" },
      [
        mapping({
          valueMaps: [{ id: 1, cqiValue: "Active", sfValue: "In Progress (SF)", isDefault: false, isPrimaryOutbound: false }],
        }),
      ],
      policy(),
      link()
    );

    expect(result.updateData.status).toBe("Active");
    expect(typeof result.updateData.status).toBe("string");
  });

  it("skips the field and records a translationError under error_and_log with no match", () => {
    const result = buildInboundPayload(
      { status: "Old" },
      { StageName: "SomeUnmappedSfValue" },
      [
        mapping({
          unmappedBehavior: "error_and_log",
          valueMaps: [{ id: 1, cqiValue: "Active", sfValue: "In Progress (SF)", isDefault: false, isPrimaryOutbound: false }],
        }),
      ],
      policy(),
      link()
    );

    expect(result.updateData.status).toBeUndefined();
    expect(result.translationErrors).toEqual([
      { field: "status", rawValue: "SomeUnmappedSfValue", error: expect.any(String) },
    ]);
  });

  it("does not report a change when the SF value already matches the CQI value", () => {
    const result = buildInboundPayload(
      { status: "Same" },
      { StageName: "Same" },
      [mapping({ valueMaps: [] })],
      policy(),
      link()
    );
    expect(result.changes).toHaveLength(0);
    expect(Object.keys(result.updateData)).toHaveLength(0);
  });
});
