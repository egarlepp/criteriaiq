// @vitest-environment node
//
// Admin-configured outbound URLs can't reach loopback, link-local (cloud
// metadata) or reserved addresses.

import { afterEach, describe, expect, it, vi } from "vitest";
import { assertOutboundUrl, isNeverAllowedAddress, salesforceLoginUrlProblem } from "../outbound-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isNeverAllowedAddress", () => {
  it.each(["127.0.0.1", "0.0.0.0", "169.254.169.254", "224.0.0.1", "::1", "::", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"])(
    "blocks %s",
    (address) => {
      expect(isNeverAllowedAddress(address)).toBe(true);
    },
  );

  it.each(["10.0.0.5", "172.18.0.3", "192.168.1.10", "fd00::1", "8.8.8.8", "2606:4700::1111"])("allows %s", (address) => {
    expect(isNeverAllowedAddress(address)).toBe(false);
  });
});

describe("assertOutboundUrl", () => {
  it("accepts public and private-network addresses", async () => {
    await expect(assertOutboundUrl("https://8.8.8.8/hook")).resolves.toBeInstanceOf(URL);
    await expect(assertOutboundUrl("http://172.18.0.3:5678/healthz")).resolves.toBeInstanceOf(URL);
  });

  it("refuses the cloud metadata endpoint", async () => {
    await expect(assertOutboundUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/link-local/);
  });

  it("refuses other schemes and embedded credentials", async () => {
    await expect(assertOutboundUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(assertOutboundUrl("https://user:pass@8.8.8.8/")).rejects.toThrow(/password/);
    await expect(assertOutboundUrl("not a url")).rejects.toThrow(/not valid/);
  });

  it("requires https when asked", async () => {
    await expect(assertOutboundUrl("http://10.0.0.5/", { requireHttps: true })).rejects.toThrow(/https/);
  });

  it("allows loopback only outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(assertOutboundUrl("http://127.0.0.1:5678/")).resolves.toBeInstanceOf(URL);
    vi.stubEnv("NODE_ENV", "production");
    await expect(assertOutboundUrl("http://127.0.0.1:5678/")).rejects.toThrow(/loopback/);
    await expect(assertOutboundUrl("http://[::1]:5678/")).rejects.toThrow(/loopback/);
  });
});

describe("salesforceLoginUrlProblem", () => {
  it.each(["https://login.salesforce.com", "https://test.salesforce.com", "https://acme.my.salesforce.com", "https://acme.lightning.force.com"])(
    "accepts %s",
    (url) => {
      expect(salesforceLoginUrlProblem(url)).toBeNull();
    },
  );

  it.each(["http://login.salesforce.com", "https://evil-salesforce.com", "https://salesforce.com.attacker.net", "https://attacker.example"])(
    "refuses %s",
    (url) => {
      expect(salesforceLoginUrlProblem(url)).not.toBeNull();
    },
  );
});
