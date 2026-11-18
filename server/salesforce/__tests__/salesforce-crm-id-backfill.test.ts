import { describe, expect, it, vi } from "vitest";
import {
  BackfillConfigError,
  runCrmIdBackfill,
  type BackfillCandidate,
  type BackfillDeps,
} from "../salesforce-crm-id-backfill";

const EVAL_A_15 = "a0X5e00000AbCdE";
const EVAL_A_18 = "a0X5e00000AbCdEEAV";
const EVAL_B_18 = "a0X5e00000AbCdFEAV"; // no Opportunity on the record
const EVAL_C_15 = "a0X5e00000ZZZZZ"; // not returned by Salesforce
const OPP_15 = "006A0000004kzLq";
const OPP_18 = "006A0000004kzLqIAI";
const ACCOUNT_15 = "001A0000006Vm9r";
const ACCOUNT_18 = "001A0000006Vm9rIAC";

const CANDIDATES: BackfillCandidate[] = [
  { id: 1, name: "Acme-1", customerName: "Acme", salesforceEvaluationLink: `https://acme.lightning.force.com/lightning/r/Evaluation__c/${EVAL_A_15}/view`, crmAccountId: null },
  { id: 2, name: null, customerName: "Beta", salesforceEvaluationLink: `https://acme.my.salesforce.com/${EVAL_B_18}`, crmAccountId: null },
  { id: 3, name: "Gamma-3", customerName: "Gamma", salesforceEvaluationLink: "Q3 evaluation", crmAccountId: null },
  { id: 4, name: "Delta-4", customerName: "Delta", salesforceEvaluationLink: `https://acme.my.salesforce.com/${EVAL_C_15}`, crmAccountId: null },
  // Same Evaluation as project 1, but an Account id is already set by hand.
  { id: 5, name: "Acme-5", customerName: "Acme", salesforceEvaluationLink: EVAL_A_18, crmAccountId: "001A0000006Vm9sIAC" },
];

function makeDeps(overrides: Partial<BackfillDeps> = {}) {
  const queries: string[] = [];
  const deps: BackfillDeps = {
    getEvaluationObject: async () => "Evaluation__c",
    getOpportunityIdMappings: async () => [
      { sfObjectApiName: "Opportunity", sfFieldApiName: "Id" },
      { sfObjectApiName: "evaluation__c", sfFieldApiName: "Related_Opportunity__c" },
    ],
    loadCandidates: async () => CANDIDATES.map((c) => ({ ...c })),
    query: vi.fn(async (soql: string) => {
      queries.push(soql);
      if (soql.includes("FROM Evaluation__c")) {
        return [
          { Id: EVAL_A_18, Related_Opportunity__c: OPP_15 },
          { Id: EVAL_B_18, Related_Opportunity__c: null },
        ];
      }
      if (soql.includes("FROM Opportunity")) return [{ Id: OPP_18, AccountId: ACCOUNT_15 }];
      return [];
    }),
    applyUpdate: vi.fn(async () => true),
    logChange: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, queries };
}

describe("runCrmIdBackfill dry run", () => {
  it("reports what it would fill and writes nothing", async () => {
    const { deps } = makeDeps();
    const report = await runCrmIdBackfill({ userId: "admin-1", dryRun: true }, deps);

    expect(deps.applyUpdate).not.toHaveBeenCalled();
    expect(deps.logChange).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dryRun: true,
      evaluationObject: "Evaluation__c",
      lookupField: "Related_Opportunity__c",
      candidates: 5,
      wouldFill: 2,
      filled: 0,
      skipped: 3,
    });

    const byId = new Map(report.items.map((i) => [i.projectId, i]));
    expect(byId.get(1)).toMatchObject({ status: "would_fill", evaluationId: EVAL_A_18, opportunityId: OPP_18, accountId: ACCOUNT_18 });
    expect(byId.get(2)).toMatchObject({ status: "skipped", reason: "no_opportunity_on_evaluation", projectName: "Beta" });
    expect(byId.get(3)).toMatchObject({ status: "skipped", reason: "no_evaluation_id" });
    expect(byId.get(4)).toMatchObject({ status: "skipped", reason: "evaluation_not_found" });
    // An Account id someone already set is kept.
    expect(byId.get(5)).toMatchObject({ status: "would_fill", opportunityId: OPP_18, accountId: "001A0000006Vm9sIAC" });
  });

  it("reads the lookup field from the field mapping, not a hardcoded name", async () => {
    const { deps, queries } = makeDeps();
    await runCrmIdBackfill({ userId: "admin-1", dryRun: true }, deps);
    expect(queries[0]).toMatch(/^SELECT Id, Related_Opportunity__c FROM Evaluation__c WHERE Id IN \(/);
    expect(queries[0]).toContain(`'${EVAL_A_18}'`);
    expect(queries[1]).toBe(`SELECT Id, AccountId FROM Opportunity WHERE Id IN ('${OPP_18}')`);
  });

  it("falls back to the Validation Record lookup field when no mapping exists", async () => {
    const { deps, queries } = makeDeps({
      getOpportunityIdMappings: async () => [],
      getSettingsLookupField: async () => "POC_Opportunity__c",
    });
    const report = await runCrmIdBackfill({ userId: "admin-1", dryRun: true }, deps);
    expect(report.lookupField).toBe("POC_Opportunity__c");
    expect(queries[0]).toMatch(/^SELECT Id, POC_Opportunity__c FROM Evaluation__c /);
  });

  it("fails with a clear error when neither a mapping nor a setting exists", async () => {
    const { deps } = makeDeps({ getOpportunityIdMappings: async () => [] });
    await expect(runCrmIdBackfill({ userId: "admin-1", dryRun: true }, deps)).rejects.toBeInstanceOf(BackfillConfigError);
    expect(deps.query).not.toHaveBeenCalled();
  });

  it("refuses a mapped field name that is not a plain API name", async () => {
    const { deps } = makeDeps({
      getOpportunityIdMappings: async () => [{ sfObjectApiName: "Evaluation__c", sfFieldApiName: "Id FROM User --" }],
    });
    await expect(runCrmIdBackfill({ userId: "admin-1", dryRun: true }, deps)).rejects.toMatchObject({ code: "invalid_field" });
  });
});

describe("runCrmIdBackfill real run", () => {
  it("writes and logs each filled project, keeping existing Account ids", async () => {
    const { deps } = makeDeps();
    const report = await runCrmIdBackfill({ userId: "admin-1", dryRun: false }, deps);

    expect(report).toMatchObject({ dryRun: false, filled: 2, wouldFill: 0, skipped: 3 });
    expect(deps.applyUpdate).toHaveBeenCalledWith(1, { opportunityId: OPP_18, accountId: ACCOUNT_18, setAccount: true });
    expect(deps.applyUpdate).toHaveBeenCalledWith(5, { opportunityId: OPP_18, accountId: ACCOUNT_18, setAccount: false });
    expect(deps.logChange).toHaveBeenCalledTimes(2);
  });

  it("skips a project filled by someone else in the meantime", async () => {
    const { deps } = makeDeps({ applyUpdate: vi.fn(async (id: number) => id !== 1) });
    const report = await runCrmIdBackfill({ userId: "admin-1", dryRun: false }, deps);
    expect(report.items.find((i) => i.projectId === 1)).toMatchObject({ status: "skipped", reason: "already_filled" });
    expect(deps.logChange).toHaveBeenCalledTimes(1);
  });
});
