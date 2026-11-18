// @vitest-environment node
//
// Template and MAP template writes are limited to internal users.

import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { isExternalRole, requireInternalUser } from "../internal-access";

function run(role: string | undefined) {
  const req = { session: role ? { user: { role } } : {} } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const res = { status, json } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requireInternalUser(req, res, next);
  return { status, next };
}

describe("requireInternalUser", () => {
  it.each(["Customer", "Guest", "Partner"])("refuses %s", (role) => {
    const { status, next } = run(role);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["Admin", "Engineer", "Manager", "Sales", "CX", "Support", "ProServ"])("allows %s", (role) => {
    const { status, next } = run(role);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("refuses a request with no session user", () => {
    expect(run(undefined).status).toHaveBeenCalledWith(403);
  });

  it("treats a missing role as not external", () => {
    expect(isExternalRole(null)).toBe(false);
  });
});
