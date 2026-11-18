// @vitest-environment node
//
// The V2 signature binds the timestamp to the body, so a receiver can refuse
// replays; the V1 header stays byte-identical for existing n8n checks.

import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";

vi.mock("../../storage.js", () => ({ storage: {} }));

const { buildSignatureHeaders } = await import("../webhook-service");

const hmac = (secret: string, data: string) => crypto.createHmac("sha256", secret).update(data).digest("hex");

describe("buildSignatureHeaders", () => {
  const body = JSON.stringify({ event: "project.updated", projectId: 42 });
  const now = new Date("2026-10-29T12:00:00.500Z");
  const t = Math.floor(now.getTime() / 1000);

  it("keeps the original body-only signature", () => {
    const headers = buildSignatureHeaders(body, "s3cret", now);
    expect(headers["X-CriteriaIQ-Signature"]).toBe(`sha256=${hmac("s3cret", body)}`);
    expect(headers["X-CriteriaIQ-Timestamp"]).toBe(now.toISOString());
  });

  it("signs the unix timestamp together with the body", () => {
    const headers = buildSignatureHeaders(body, "s3cret", now);
    expect(headers["X-CriteriaIQ-Signature-V2"]).toBe(`t=${t},v1=${hmac("s3cret", `${t}.${body}`)}`);
  });

  it("changes the V2 signature when only the timestamp changes", () => {
    const a = buildSignatureHeaders(body, "s3cret", now)["X-CriteriaIQ-Signature-V2"];
    const b = buildSignatureHeaders(body, "s3cret", new Date(now.getTime() + 1000))["X-CriteriaIQ-Signature-V2"];
    expect(a).not.toBe(b);
  });

  it("marks unsigned deliveries and sends no V2 header", () => {
    const headers = buildSignatureHeaders(body, null, now);
    expect(headers["X-CriteriaIQ-Signature"]).toBe("unsigned");
    expect(headers["X-CriteriaIQ-Signature-V2"]).toBeUndefined();
  });
});
