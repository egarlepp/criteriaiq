import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALIDATION_RECORD_SETTINGS,
  VALIDATION_RECORD_LABEL_PRESETS,
  validationRecordEnglishName,
  validationRecordSettingsSchema,
} from "../crm-validation-record";

const parse = (patch: Record<string, unknown>) =>
  validationRecordSettingsSchema.safeParse({ ...DEFAULT_VALIDATION_RECORD_SETTINGS, ...patch });

describe("validationRecordSettingsSchema", () => {
  it("accepts the defaults", () => {
    expect(validationRecordSettingsSchema.safeParse(DEFAULT_VALIDATION_RECORD_SETTINGS).success).toBe(true);
  });

  it("accepts every preset name", () => {
    for (const label of ["evaluation", "poc", "pov", "poc_pov", "pox", "project"]) {
      expect(parse({ label }).success).toBe(true);
    }
  });

  it("requires a custom name when label is custom", () => {
    expect(parse({ label: "custom", customLabel: "" }).success).toBe(false);
    expect(parse({ label: "custom", customLabel: "  " }).success).toBe(false);
    expect(parse({ label: "custom", customLabel: "Pilot" }).success).toBe(true);
  });

  it("caps the custom name at 40 characters", () => {
    expect(parse({ label: "custom", customLabel: "x".repeat(41) }).success).toBe(false);
  });

  it("rejects Salesforce API names that could break a SOQL query", () => {
    for (const objectApiName of ["Evaluation__c; DELETE", "1Bad__c", "Eval'__c", ""]) {
      expect(parse({ salesforce: { objectApiName, opportunityLookupField: "Opportunity__c" } }).success).toBe(false);
    }
    expect(parse({ salesforce: { objectApiName: "POC__c", opportunityLookupField: "Opp__c" } }).success).toBe(true);
  });

  it("accepts HubSpot object types in id, qualified and standard form, or empty", () => {
    for (const objectType of ["", "2-1234567", "p_poc_records", "deals"]) {
      expect(parse({ hubspot: { objectType } }).success).toBe(true);
    }
    expect(parse({ hubspot: { objectType: "Deals!" } }).success).toBe(false);
  });
});

describe("validationRecordEnglishName", () => {
  it("names every preset", () => {
    for (const label of VALIDATION_RECORD_LABEL_PRESETS.filter((p) => p !== "custom")) {
      expect(validationRecordEnglishName({ label, customLabel: "" })).toMatch(/\S/);
    }
    expect(validationRecordEnglishName({ label: "pox", customLabel: "" })).toBe("POx");
  });

  it("returns a custom name as typed, falling back to Evaluation when blank", () => {
    expect(validationRecordEnglishName({ label: "custom", customLabel: "Technical Win" })).toBe("Technical Win");
    expect(validationRecordEnglishName({ label: "custom", customLabel: " " })).toBe("Evaluation");
  });
});
