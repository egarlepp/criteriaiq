// @vitest-environment node
//
// The first-run setup wizard's routes need the setup token.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { activateSetupToken, requireSetupToken, resetSetupTokenForTests, setupTokenMatches } from "../setup-token";

function run(method: string, path: string, token?: string) {
  const req = { method, path, get: (name: string) => (name.toLowerCase() === "x-setup-token" ? token : undefined) } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const res = { status, json } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requireSetupToken(req, res, next);
  return { status, json, next };
}

afterEach(() => {
  resetSetupTokenForTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requireSetupToken", () => {
  it("does nothing until the wizard turns it on", () => {
    expect(run("POST", "/create-admin").next).toHaveBeenCalled();
  });

  it("refuses a missing or wrong token", () => {
    vi.stubEnv("SETUP_TOKEN", "operator-chosen-token-1234");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    activateSetupToken();
    expect(run("POST", "/create-admin").status).toHaveBeenCalledWith(401);
    expect(run("GET", "/secrets", "wrong").status).toHaveBeenCalledWith(401);
    expect(run("POST", "/create-admin", "operator-chosen-token-1234").next).toHaveBeenCalled();
  });

  it("leaves the read-only status probes open", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    activateSetupToken();
    expect(run("GET", "/status").next).toHaveBeenCalled();
    expect(run("GET", "/migrations-summary").next).toHaveBeenCalled();
    expect(run("POST", "/status").status).toHaveBeenCalledWith(401);
  });

  it("ignores a SETUP_TOKEN that is too short and generates one instead", () => {
    vi.stubEnv("SETUP_TOKEN", "short");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    activateSetupToken();
    expect(setupTokenMatches("short")).toBe(false);
  });
});
