// The project form's resolver adds the validation record link check on top
// of the schema: required while a CRM is in use, optional with None.
import { describe, expect, it } from "vitest";
import type { ResolverOptions } from "react-hook-form";
import { projectFormResolver, type FormData } from "../types";

const options = { fields: {}, shouldUseNativeValidation: false } as unknown as ResolverOptions<FormData>;

function values(link: string): FormData {
  return { salesforceEvaluationLink: link } as unknown as FormData;
}

describe("projectFormResolver", () => {
  it("requires the link while a CRM is in use", async () => {
    const result = await projectFormResolver(values("  "), { crmProvider: "salesforce" }, options);
    expect(result.errors.salesforceEvaluationLink).toBeDefined();
  });

  it("requires it while the CRM is still loading", async () => {
    const result = await projectFormResolver(values(""), {}, options);
    expect(result.errors.salesforceEvaluationLink).toBeDefined();
  });

  it("leaves it optional with the CRM set to None", async () => {
    const result = await projectFormResolver(values(""), { crmProvider: "none" }, options);
    expect(result.errors.salesforceEvaluationLink).toBeUndefined();
  });

  it("accepts a link that is filled in", async () => {
    const result = await projectFormResolver(values("https://acme.my.salesforce.com/a0X000000000001"), { crmProvider: "salesforce" }, options);
    expect(result.errors.salesforceEvaluationLink).toBeUndefined();
  });
});
