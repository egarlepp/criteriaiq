// @vitest-environment happy-dom
//
// Backup & Restore screen: the preview shows the backup's issues and admins,
// and Restore stays disabled until the confirmation word is typed; a blocked
// preview offers no Restore at all. Masking is offered before a file is
// chosen, and the masked download asks for ?masked=1.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupRestoreTab } from "../system-health/BackupRestoreTab";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

const info = { appVersion: "0.10.16", schema: { lastMigration: "094_x.sql", migrationCount: 94 }, tableCount: 170, totalRows: 1234, maxUploadMb: 2048 };
const preview = (errors: { code: string }[] = [], masked = false) => ({
  header: { appVersion: "0.10.16", createdAt: "2026-10-26T00:00:00Z", schema: { lastMigration: "094_x.sql" }, ...(masked ? { masked } : {}) },
  tables: [{ table: "users", backupRows: 2, currentRows: 5 }],
  errors,
  warnings: [{ code: "key_mismatch" }],
  adminsInBackup: [{ email: "ada@example.com", name: "Ada Admin" }],
  importerInBackup: true,
  keyMatches: false,
});

function respond(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

function mockServer(previewBody: unknown) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.endsWith("/api/admin/backup/info")) return respond(info);
    if (u.endsWith("/api/admin/backup/import")) return respond({ token: "tok", preview: previewBody });
    return respond({ ok: true });
  }) as unknown as typeof fetch;
}

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

async function choose() {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "b.cqbackup.gz");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await flush();
}

const restoreButton = () =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Restore") as HTMLButtonElement | undefined;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

describe("BackupRestoreTab", () => {
  it("shows the summary, then the preview, and needs the typed word", async () => {
    mockServer(preview());
    await act(async () => root.render(<BackupRestoreTab />));
    await flush();
    expect(container.textContent).toContain("170 tables, 1,234 rows");

    await choose();
    expect(container.textContent).toContain("Ada Admin (ada@example.com)");
    expect(container.textContent).toContain("ENCRYPTION_KEY differs");
    expect(restoreButton()?.disabled).toBe(true);

    const confirm = container.querySelector("#backup-confirm") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(confirm, "RESTORE");
      confirm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(restoreButton()?.disabled).toBe(false);
  });

  it("sends mask: true when Restore with masking is ticked before choosing a file", async () => {
    mockServer(preview());
    await act(async () => root.render(<BackupRestoreTab />));
    await flush();
    const box = container.querySelector('[data-testid="backup-mask"]') as HTMLButtonElement;
    expect(box).not.toBeNull();
    await act(async () => box.click());
    await choose();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Restore with masking");
    expect(button).toBeDefined();

    const confirm = container.querySelector("#backup-confirm") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(confirm, "RESTORE");
      confirm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button!.click());
    await flush();
    const call = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo, RequestInit?][] } }).mock.calls.find(([u]) =>
      String(u).endsWith("/apply"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ confirmation: "RESTORE", mask: true });
    expect(container.textContent).toContain("people, secrets and logs masked");
  });

  it("downloads a masked backup from the masked button", async () => {
    mockServer(preview());
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { value: { ...original, assign }, configurable: true });
    try {
      await act(async () => root.render(<BackupRestoreTab />));
      await flush();
      const button = container.querySelector('[data-testid="backup-export-masked"]') as HTMLButtonElement;
      expect(button.textContent).toContain("Download masked backup");
      await act(async () => button.click());
      expect(assign).toHaveBeenCalledWith("/api/admin/backup/export?masked=1");
    } finally {
      Object.defineProperty(window, "location", { value: original, configurable: true });
    }
  });

  it("says when the chosen file is already masked", async () => {
    mockServer(preview([], true));
    await act(async () => root.render(<BackupRestoreTab />));
    await flush();
    await choose();
    expect(container.textContent).toContain("already masked");
  });

  it("offers no Restore when the preview is blocked", async () => {
    mockServer(preview([{ code: "schema_mismatch" }]));
    await act(async () => root.render(<BackupRestoreTab />));
    await flush();
    await choose();
    expect(container.textContent).toContain("Restore it on an install of the same version");
    expect(restoreButton()).toBeUndefined();
  });
});
