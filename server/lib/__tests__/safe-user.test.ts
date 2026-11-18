// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import {
  SENSITIVE_USER_FIELDS,
  isUserShaped,
  scrubUserCredentials,
  scrubUserCredentialsMiddleware,
  toSafeUser,
} from "../safe-user";

const userRow = () => ({
  id: "user_1",
  email: "someone@example.com",
  role: "Engineer",
  firstName: "Some",
  lastName: "One",
  password: "$2b$10$abcdefghijklmnopqrstuuJ7m9b2y9b0sQ2w2tX9Qe5q0z5z5z5z5",
  passwordHistory: '["$2b$10$old1","$2b$10$old2"]',
  resetToken: "reset-token-value",
  resetTokenExpiry: new Date("2030-01-01T00:00:00Z"),
  totpSecretEnc: "enc:totp",
  sfAccessToken: "enc:access",
  sfRefreshToken: "enc:refresh",
  sfInstanceUrl: "enc:url",
  mfaEnabled: true,
});

const hasNoSensitiveFields = (obj: Record<string, unknown>) =>
  SENSITIVE_USER_FIELDS.every((f) => !(f in obj));

describe("toSafeUser", () => {
  it("drops every credential field and keeps the rest", () => {
    const safe = toSafeUser(userRow());
    expect(hasNoSensitiveFields(safe)).toBe(true);
    expect(safe).toMatchObject({ id: "user_1", email: "someone@example.com", role: "Engineer", mfaEnabled: true });
  });

  it("does not mutate the input", () => {
    const row = userRow();
    toSafeUser(row);
    expect(row.password).toBeDefined();
  });
});

describe("isUserShaped", () => {
  it("matches a user row", () => {
    expect(isUserShaped(userRow())).toBe(true);
  });

  it("ignores non-user objects that happen to carry a password (e.g. SMTP config)", () => {
    expect(isUserShaped({ host: "smtp.example.com", username: "mailer", password: "smtp-secret", fromEmail: "a@b.c" })).toBe(false);
  });

  it("ignores user objects that are already safe", () => {
    expect(isUserShaped({ id: "u", email: "a@b.c", role: "Admin" })).toBe(false);
  });
});

describe("scrubUserCredentials", () => {
  it("scrubs top-level, wrapped, nested and array user objects", () => {
    const body = {
      user: userRow(),
      users: [userRow(), userRow()],
      project: { owner: userRow(), members: [{ user: userRow() }] },
    };
    const out = scrubUserCredentials(body);
    expect(hasNoSensitiveFields(out.user)).toBe(true);
    out.users.forEach((u) => expect(hasNoSensitiveFields(u)).toBe(true));
    expect(hasNoSensitiveFields(out.project.owner)).toBe(true);
    expect(hasNoSensitiveFields(out.project.members[0].user)).toBe(true);
    // original untouched
    expect(body.user.password).toBeDefined();
  });

  it("returns the same reference when nothing needs scrubbing", () => {
    const body = { ok: true, items: [{ id: 1 }], config: { password: "smtp-secret" } };
    expect(scrubUserCredentials(body)).toBe(body);
  });

  it("leaves dates, nulls and primitives alone", () => {
    const d = new Date();
    expect(scrubUserCredentials(d)).toBe(d);
    expect(scrubUserCredentials(null)).toBe(null);
    expect(scrubUserCredentials("x")).toBe("x");
  });

  it("survives circular references", () => {
    const a: any = { name: "a" };
    a.self = a;
    expect(() => scrubUserCredentials(a)).not.toThrow();
  });
});

describe("scrubUserCredentialsMiddleware", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(scrubUserCredentialsMiddleware);
    app.get("/login", (_req, res) => res.json({ user: userRow(), message: "Login successful" }));
    app.get("/users", (_req, res) => res.json([userRow(), userRow()]));
    app.get("/smtp", (_req, res) => res.json({ host: "smtp.example.com", password: "smtp-secret" }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  });

  it("strips credentials from a login-style response", async () => {
    const res = await fetch(`${baseUrl}/login`);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(res.status).toBe(200);
    expect(text).not.toMatch(/\$2b\$10\$/);
    expect(text).not.toContain("reset-token-value");
    expect(hasNoSensitiveFields(body.user)).toBe(true);
    expect(body.user.email).toBe("someone@example.com");
  });

  it("strips credentials from a user list", async () => {
    const body = await (await fetch(`${baseUrl}/users`)).json();
    expect(body).toHaveLength(2);
    body.forEach((u: Record<string, unknown>) => expect(hasNoSensitiveFields(u)).toBe(true));
  });

  it("does not touch non-user payloads", async () => {
    const body = await (await fetch(`${baseUrl}/smtp`)).json();
    expect(body).toEqual({ host: "smtp.example.com", password: "smtp-secret" });
  });
});
