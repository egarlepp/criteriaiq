// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SYSTEM_EMAIL_TEMPLATE_SEEDS } from "../seed/system-email-templates";
import {
  DEFAULT_MAP_TEMPLATE_TASK_SEEDS,
  DEFAULT_MAP_TEMPLATE_PHASE_DATA,
  DEFAULT_MAP_TEMPLATE_STEP_DATA,
} from "../seed/default-map-template-tasks";

const KNOWN_PHASE_KEYS = new Set(DEFAULT_MAP_TEMPLATE_PHASE_DATA.map((p) => p.localKey));
const KNOWN_STEP_KEYS = new Set(DEFAULT_MAP_TEMPLATE_STEP_DATA.map((s) => s.localKey));

describe("seedSystemEmailTemplates payload (Task #680)", () => {
  // 20 since d4bd99f7 promoted generic_configuration_test to a system template.
  it("ships 20 canonical templates", () => {
    expect(SYSTEM_EMAIL_TEMPLATE_SEEDS).toHaveLength(20);
  });

  it("has unique template_key on every row (UPSERT idempotency precondition)", () => {
    const keys = SYSTEM_EMAIL_TEMPLATE_SEEDS.map((t) => t.template_key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("has non-empty variables array on every row", () => {
    for (const t of SYSTEM_EMAIL_TEMPLATE_SEEDS) {
      expect(Array.isArray(t.variables), `${t.template_key} variables must be an array`).toBe(true);
      for (const v of t.variables) {
        expect(typeof v, `${t.template_key} variables must be strings`).toBe("string");
      }
    }
  });

  // Design renamed legacy name → "CriteriaIQ Default" in 354deeaa;
  // generic_configuration_test (System Alerts) is the fifth linked row.
  it("links exactly 5 Authentication / System Alerts templates to the CriteriaIQ Default design", () => {
    const linked = SYSTEM_EMAIL_TEMPLATE_SEEDS.filter((t) => t.design_name === "CriteriaIQ Default");
    expect(linked.length).toBe(5);
    for (const t of linked) {
      expect(["Authentication", "System Alerts"], t.template_key).toContain(t.category);
    }
  });
});

describe("DEFAULT_MAP_TEMPLATE_TASK_SEEDS payload (Task #680)", () => {
  it("ships 29 canonical tasks", () => {
    expect(DEFAULT_MAP_TEMPLATE_TASK_SEEDS).toHaveLength(29);
  });

  it("references only known phase + step local_keys", () => {
    for (const task of DEFAULT_MAP_TEMPLATE_TASK_SEEDS) {
      expect(KNOWN_PHASE_KEYS.has(task.phase_local_key), `${task.name} → unknown phase ${task.phase_local_key}`).toBe(true);
      expect(KNOWN_STEP_KEYS.has(task.step_local_key), `${task.name} → unknown step ${task.step_local_key}`).toBe(true);
    }
  });

  it("has positive expected_hours on every task", () => {
    for (const task of DEFAULT_MAP_TEMPLATE_TASK_SEEDS) {
      const hours = Number(task.expected_hours);
      expect(Number.isFinite(hours), `${task.name} expected_hours must be numeric`).toBe(true);
      expect(hours).toBeGreaterThanOrEqual(0);
    }
  });
});
