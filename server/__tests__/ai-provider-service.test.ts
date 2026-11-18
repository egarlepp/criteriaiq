// @vitest-environment node
//
// AI Providers list must survive a row whose api_key cannot be decrypted.
// The Demo Mode seed used to store a plaintext placeholder in api_key; with
// Demo Mode on, GET /api/admin/ai-providers threw inside maskConfig, the
// route returned 500 and Admin › Integrations › AI Providers spun forever.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@shared/schema";

const rows: Array<Record<string, unknown>> = [];
let whereArg: unknown = "unset";

vi.mock("../storage.js", () => {
  const chain = {
    from: () => chain,
    where: (arg: unknown) => {
      whereArg = arg;
      return chain;
    },
    orderBy: () => Promise.resolve(rows),
    limit: () => Promise.resolve(rows),
  };
  return {
    storage: {
      schema,
      db: {
        select: () => chain,
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      },
    },
  };
});

let demo = false;
vi.mock("../lib/demo-mode.js", () => ({ isCurrentRequestDemo: () => demo }));

function row(overrides: Record<string, unknown>) {
  return {
    id: 1,
    provider: "openai",
    displayName: "Row",
    apiKey: "",
    apiEndpoint: null,
    organizationId: null,
    defaultModel: null,
    availableModels: [],
    maxTokens: 4096,
    temperature: "0.7",
    isActive: true,
    isDefault: false,
    isDemo: false,
    lastTestedAt: null,
    lastTestResult: null,
    lastTestError: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    ...overrides,
  };
}

describe("aiProviderService", () => {
  let service: typeof import("../ai/ai-provider-service").aiProviderService;
  let mod: typeof import("../ai/ai-provider-service");
  let encryptText: (plain: string) => string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    mod = await import("../ai/ai-provider-service");
    service = mod.aiProviderService;
    ({ encryptText } = await import("../auth/mfaUtils.js"));
  });

  beforeEach(() => {
    rows.length = 0;
    demo = false;
    whereArg = "unset";
  });

  it("lists providers even when one stored key cannot be decrypted", async () => {
    rows.push(
      row({ id: 1, displayName: "Broken", apiKey: "demo-placeholder-not-a-real-key", isDemo: true }),
      row({ id: 2, displayName: "Good", apiKey: encryptText("sk-test-1234567890") }),
    );

    const configs = await service.getAllConfigs();

    expect(configs).toHaveLength(2);
    const broken = configs.find((c) => c.id === 1)!;
    expect(broken.apiKeyMasked).toBe("••••••••");
    expect(broken.lastTestError).toMatch(/cannot be read/);
    const good = configs.find((c) => c.id === 2)!;
    expect(good.apiKeyMasked.startsWith("sk-t")).toBe(true);
    expect(good.apiKeyMasked.endsWith("7890")).toBe(true);
    expect(good.apiKeyMasked).not.toContain("1234567");
  });

  it("shows real providers in Demo Mode and hides the demo stub outside it", async () => {
    demo = true;
    await service.getAllConfigs();
    expect(whereArg).toBeUndefined();

    demo = false;
    await service.getAllConfigs();
    expect(whereArg).toBeDefined();
  });

  it("reports an unreadable key on test instead of throwing", async () => {
    rows.push(row({ apiKey: "not-encrypted" }));
    const result = await service.testConnection(1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/enter the API key again/);
  });

  it("keeps every provider's default model inside its suggestion list", () => {
    const defaults = service.getProviderDefaults();
    for (const [provider, d] of Object.entries(defaults)) {
      expect(d.models, provider).toContain(d.defaultModel);
      expect(mod.defaultModelFor(provider)).toBe(d.defaultModel);
    }
  });

  it("drops temperature only for OpenAI models that reject it", () => {
    expect(mod.openAIModelAcceptsTemperature("gpt-6-astra")).toBe(true);
    expect(mod.openAIModelAcceptsTemperature("gpt-4o")).toBe(true);
    expect(mod.openAIModelAcceptsTemperature("gpt-5.5")).toBe(false);
    expect(mod.openAIModelAcceptsTemperature("o3")).toBe(false);
    expect(mod.openAIModelAcceptsTemperature("o4-mini")).toBe(false);
  });
});
