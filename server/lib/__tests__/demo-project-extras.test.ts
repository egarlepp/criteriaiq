import { describe, it, expect } from "vitest";
import { planDependencyStatuses, planDiscoveryProfile } from "../demo-project-extras";

describe("planDiscoveryProfile", () => {
  it("is the same for the same account", () => {
    expect(planDiscoveryProfile(7)).toEqual(planDiscoveryProfile(7));
  });

  it("fills every section the Infrastructure Discovery drawer shows", () => {
    const profile = planDiscoveryProfile(3);
    expect(Object.keys(profile).sort()).toEqual([
      "application_landscape",
      "cloud_saas_posture",
      "endpoint_server_platforms",
      "identity_directory",
      "network_connectivity",
      "operations_service_management",
      "security_architecture",
      "storage_file_systems",
    ]);
    expect(["entra_id", "okta", "ping"]).toContain(profile.identity_directory.idp_primary);
    expect((profile.identity_directory.mfa_methods as string[]).length).toBeGreaterThan(0);
    expect((profile.cloud_saas_posture.cloud_providers as string[]).length).toBeGreaterThan(0);
  });
});

describe("planDependencyStatuses", () => {
  it("leaves everything open before work starts", () => {
    expect(planDependencyStatuses("early", 3)).toEqual(["open", "open", "open"]);
  });

  it("has dependencies settling mid-way", () => {
    expect(planDependencyStatuses("mid", 3)).toEqual(["resolved", "in_review", "open"]);
  });

  it("resolves everything once the project is late or won", () => {
    expect(planDependencyStatuses("late", 3)).toEqual(["resolved", "resolved", "resolved"]);
    expect(planDependencyStatuses("won", 2)).toEqual(["resolved", "resolved"]);
  });

  it("fails one dependency on a lost project and blocks one on hold", () => {
    expect(planDependencyStatuses("lost", 3)).toEqual(["resolved", "resolved", "fail"]);
    expect(planDependencyStatuses("other", 3)).toEqual(["blocked", "open", "open"]);
  });
});
