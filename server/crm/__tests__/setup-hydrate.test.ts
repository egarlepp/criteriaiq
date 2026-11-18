// @vitest-environment node
//
// The setup wizard stages the CRM choice in db-config.json; the first boot
// after setup applies it unless a CRM is already saved.
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({ getSystemSetting: vi.fn() }));
const lockMock = vi.hoisted(() => ({ changeCrmProvider: vi.fn() }));
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../provider-lock", () => lockMock);

import { hydrateDeferredCrmProvider } from "../setup-hydrate";

let dir: string;
let file: string;

function write(value: Record<string, unknown>) {
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}
function read(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-hydrate-"));
  file = path.join(dir, "db-config.json");
  storageMock.getSystemSetting.mockResolvedValue(undefined);
  lockMock.changeCrmProvider.mockResolvedValue({ ok: true, before: "salesforce", after: "hubspot" });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("hydrateDeferredCrmProvider", () => {
  it("applies the staged choice and clears it", async () => {
    write({ crmProvider: "hubspot", other: 1 });
    await hydrateDeferredCrmProvider(file);
    expect(lockMock.changeCrmProvider).toHaveBeenCalledWith("hubspot", undefined);
    expect(read()).toMatchObject({ other: 1 });
    expect(read()).not.toHaveProperty("crmProvider");
  });

  it("keeps a CRM that is already saved", async () => {
    write({ crmProvider: "hubspot" });
    storageMock.getSystemSetting.mockResolvedValue({ value: { provider: "salesforce" } });
    await hydrateDeferredCrmProvider(file);
    expect(lockMock.changeCrmProvider).not.toHaveBeenCalled();
    expect(read()).not.toHaveProperty("crmProvider");
  });

  it("leaves the choice staged when the database write fails, so the next boot retries", async () => {
    write({ crmProvider: "none" });
    lockMock.changeCrmProvider.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await hydrateDeferredCrmProvider(file);
    expect(read()).toHaveProperty("crmProvider", "none");
  });

  it("does nothing without a staged choice or a file", async () => {
    await hydrateDeferredCrmProvider(path.join(dir, "missing.json"));
    write({ other: 1 });
    await hydrateDeferredCrmProvider(file);
    expect(lockMock.changeCrmProvider).not.toHaveBeenCalled();
  });
});
