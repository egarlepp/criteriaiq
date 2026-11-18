import { describe, it, expect } from "vitest";
import { DEMO_LOGIN_PASSWORD_LENGTH, DEMO_LOGIN_SPECS, generateDemoPassword } from "../demo-logins";
import { DEMO_USER_EMAIL_DOMAIN } from "../demo-story";
import { demoLoginCanEdit, demoLoginCanView } from "@shared/demo-login";

describe("generateDemoPassword", () => {
  it("makes 10 letters and digits with at least one of each kind and no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateDemoPassword();
      expect(pw).toHaveLength(DEMO_LOGIN_PASSWORD_LENGTH);
      expect(pw).toMatch(/^[A-Za-z0-9]+$/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).not.toMatch(/[0O1lIo]/);
    }
  });

  it("gives different passwords", () => {
    expect(new Set(Array.from({ length: 50 }, () => generateDemoPassword())).size).toBe(50);
  });
});

describe("demo login accounts", () => {
  it("use an address the demo wipe doesn't remove", () => {
    for (const spec of Object.values(DEMO_LOGIN_SPECS)) {
      expect(spec.email.endsWith(`@${DEMO_USER_EMAIL_DOMAIN}`)).toBe(false);
      expect(spec.email.endsWith(".invalid")).toBe(true);
    }
  });
});

describe("demo login sections", () => {
  it("hides people, teams, roles and Demo Mode", () => {
    for (const s of ["config.user-management", "config.teams", "config.roles", "config.demo-mode", "config.login-history"]) {
      expect(demoLoginCanView(s)).toBe(false);
    }
    expect(demoLoginCanView("dashboard")).toBe(true);
    expect(demoLoginCanView("config.configuration")).toBe(true);
  });

  it("keeps settings read-only but demo data editable", () => {
    expect(demoLoginCanEdit("config.configuration")).toBe(false);
    expect(demoLoginCanEdit("communications.email-designs")).toBe(false);
    expect(demoLoginCanEdit("config.workflow-automation")).toBe(true);
    expect(demoLoginCanEdit("project.map")).toBe(true);
    expect(demoLoginCanEdit("config.teams")).toBe(false);
  });
});
