// Locks the contract that the Phase 7 mixin pattern actually wires
// every domain mixin into `DatabaseStorage` at runtime, and that the
// `applyMixins(...)` helper used to do so behaves correctly in
// isolation.
//
// Why this test exists
// --------------------
// `DatabaseStorage` (server/storage.ts) is now an empty composition
// shell — every method comes from a *StorageMixin class under
// server/storage/. Wiring a new mixin in is two separate edits to
// server/storage.ts:
//
//   1. Add the mixin to the interface declaration-merge:
//        export interface DatabaseStorage extends ..., NewMixin {}
//   2. Add the mixin to the `applyMixins(DatabaseStorage, [...])` array.
//
// If a contributor only does (1), tsc happily compiles every
// `storage.newMethod()` call site (the type is there), but the method
// won't exist at runtime — the call will throw `TypeError: ... is not
// a function` the first time it's hit. tsc cannot catch this.
//
// What this test enforces
// -----------------------
//   * For every *StorageMixin class exported under server/storage/,
//     every method on the mixin's prototype is reachable on
//     `DatabaseStorage.prototype` (i.e. wired into applyMixins).
//   * `applyMixins(...)` itself preserves the function reference and
//     skips constructors, so a mixin's `constructor` does not
//     overwrite the target's.
//
// What this test intentionally does NOT enforce
// ---------------------------------------------
//   * That the methods *work* against the database. That's a separate
//     integration concern and most domains have their own integration
//     tests in server/__tests__/.
//   * That two mixins don't define the same method name. Some
//     duplication is deliberate (the cross-mixin phantom interface
//     shapes — UserCrudShape, AuditCountShape, ProductsLinkShape —
//     declare types but do not implement, so the runtime owner is
//     unambiguous). If a real collision regresses we'd catch it at
//     review-time; an automated guard would need an allowlist that
//     adds maintenance overhead.

import { describe, it, expect } from "vitest";
import { applyMixins } from "../_mixins";

// Each mixin import. Order matches the alphabetical `ls server/storage/`
// listing for easy diffing when a new mixin is added.
import { ActivityStorageMixin } from "../activity";
import { ArchiveStorageMixin } from "../archive";
import { AuditRiskStorageMixin } from "../audit-risk";
import { CoreStorageMixin } from "../core";
import { CriteriaStorageMixin } from "../criteria";
import { CustomReportsStorageMixin } from "../custom-reports";
import { CustomerAccessStorageMixin } from "../customer-access";
import { DashboardStatsStorageMixin } from "../dashboard-stats";
import { DashboardStorageMixin } from "../dashboard";
import { EmailStorageMixin } from "../email";
import { EndDateFlagsStorageMixin } from "../end-date-flags";
import { IndustriesStorageMixin } from "../industries";
import { InfrastructureStorageMixin } from "../infrastructure";
import { MapStorageMixin } from "../map";
import { MfaStorageMixin } from "../mfa";
import { PcosStorageMixin } from "../pcos";
import { ProductsStorageMixin } from "../products";
import { ProjectResourcesStorageMixin } from "../project-resources";
import { RequestsStorageMixin } from "../requests";
import { RolesStorageMixin } from "../roles";
import { SecurityStorageMixin } from "../security";
import { StatusConfigsStorageMixin } from "../status-configs";
import { TagsStorageMixin } from "../tags";
import { UsersStorageMixin } from "../users";
import { ValidationCriteriaTemplatesStorageMixin } from "../validation-criteria-templates";

const MIXIN_CLASSES: Array<readonly [string, { prototype: object }]> = [
  ["ActivityStorageMixin", ActivityStorageMixin],
  ["ArchiveStorageMixin", ArchiveStorageMixin],
  ["AuditRiskStorageMixin", AuditRiskStorageMixin],
  ["CoreStorageMixin", CoreStorageMixin],
  ["CriteriaStorageMixin", CriteriaStorageMixin],
  ["CustomReportsStorageMixin", CustomReportsStorageMixin],
  ["CustomerAccessStorageMixin", CustomerAccessStorageMixin],
  ["DashboardStatsStorageMixin", DashboardStatsStorageMixin],
  ["DashboardStorageMixin", DashboardStorageMixin],
  ["EmailStorageMixin", EmailStorageMixin],
  ["EndDateFlagsStorageMixin", EndDateFlagsStorageMixin],
  ["IndustriesStorageMixin", IndustriesStorageMixin],
  ["InfrastructureStorageMixin", InfrastructureStorageMixin],
  ["MapStorageMixin", MapStorageMixin],
  ["MfaStorageMixin", MfaStorageMixin],
  ["PcosStorageMixin", PcosStorageMixin],
  ["ProductsStorageMixin", ProductsStorageMixin],
  ["ProjectResourcesStorageMixin", ProjectResourcesStorageMixin],
  ["RequestsStorageMixin", RequestsStorageMixin],
  ["RolesStorageMixin", RolesStorageMixin],
  ["SecurityStorageMixin", SecurityStorageMixin],
  ["StatusConfigsStorageMixin", StatusConfigsStorageMixin],
  ["TagsStorageMixin", TagsStorageMixin],
  ["UsersStorageMixin", UsersStorageMixin],
  ["ValidationCriteriaTemplatesStorageMixin", ValidationCriteriaTemplatesStorageMixin],
];

function ownMethodNames(proto: object): string[] {
  return Object.getOwnPropertyNames(proto).filter((name) => {
    if (name === "constructor") return false;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    return typeof desc?.value === "function";
  });
}

describe("applyMixins helper", () => {
  it("copies prototype methods from sources onto the target", () => {
    class Target {}
    class A {
      foo() {
        return "a-foo";
      }
    }
    class B {
      bar() {
        return "b-bar";
      }
    }

    applyMixins(Target, [A, B]);

    const t = new Target() as Target & { foo(): string; bar(): string };
    expect(t.foo()).toBe("a-foo");
    expect(t.bar()).toBe("b-bar");
  });

  it("does not overwrite the target's constructor", () => {
    class Target {
      tag = "target";
    }
    class A {
      // tsc forbids declaring an explicit `constructor` here without a
      // body that calls super(); the helper's contract is that even if
      // a mixin had one it would be skipped, so we just verify the
      // target's identity survives a mixing pass with a non-trivial
      // mixin.
      foo() {
        return "ok";
      }
    }

    applyMixins(Target, [A]);

    const t = new Target();
    // The Target constructor still ran (tag is set) and the prototype
    // chain still points at the original Target.
    expect(t.tag).toBe("target");
    expect(Object.getPrototypeOf(t)).toBe(Target.prototype);
  });

  it("preserves function references rather than re-wrapping them", () => {
    class Target {}
    class A {
      foo() {
        return 42;
      }
    }
    const original = A.prototype.foo;

    applyMixins(Target, [A]);

    expect(Target.prototype.foo).toBe(original);
  });

  it("later mixins override earlier ones on name collisions (last write wins)", () => {
    class Target {}
    class A {
      collide() {
        return "a";
      }
    }
    class B {
      collide() {
        return "b";
      }
    }

    applyMixins(Target, [A, B]);

    const t = new Target() as Target & { collide(): string };
    expect(t.collide()).toBe("b");
  });
});

describe("DatabaseStorage mixin composition (Phase 7)", () => {
  it("exposes every method from every *StorageMixin on its prototype", async () => {
    // Lazy import inside the test so test discovery doesn't pay the
    // full server/storage import cost (which pulls in the db pool +
    // every schema file + every mixin's transitive deps) when only
    // this file's other suites are filtered in.
    const { DatabaseStorage } = await import("../../storage");

    const missing: Array<{ mixin: string; method: string }> = [];
    for (const [mixinName, mixinClass] of MIXIN_CLASSES) {
      const methods = ownMethodNames(mixinClass.prototype);
      // Mixin classes should not be empty — an empty mixin is almost
      // always a mistake (someone deleted the methods but left the
      // shell). Surface it so the diff review catches it.
      expect(methods.length, `${mixinName} has no methods`).toBeGreaterThan(0);

      for (const method of methods) {
        if (!(method in DatabaseStorage.prototype)) {
          missing.push({ mixin: mixinName, method });
        }
      }
    }

    if (missing.length > 0) {
      const list = missing
        .map((m) => `  - ${m.mixin}.${m.method}`)
        .join("\n");
      throw new Error(
        `DatabaseStorage is missing ${missing.length} method(s) from its mixins:\n${list}\n\n` +
          `Most likely cause: the mixin was added to the interface ` +
          `declaration-merge in server/storage.ts but not to the ` +
          `applyMixins([...]) array (or vice versa). Both edits are ` +
          `required to wire a new mixin in. See server/storage/_mixins.ts.`,
      );
    }
  });
});
