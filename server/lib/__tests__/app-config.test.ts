import fs from "fs";
import path from "path";
import os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We point the bootstrap store at a per-test temp directory by stubbing
// process.cwd() before each fresh import of app-config (which resolves
// DATA_DIR = path.join(process.cwd(), 'data') at module load). vitest workers
// can't chdir, so the spy approach is the portable way to mirror the wizard's
// on-disk layout (data/db-config.json under cwd) without touching real files.
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-config-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.resetModules();
  delete process.env.DATABASE_URL;
  delete process.env.SESSION_SECRET;
  delete process.env.ENCRYPTION_KEY;
  delete process.env.PUBLIC_APP_URL;
  delete process.env.SMTP_HOST;
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeStoreFile(contents: Record<string, unknown>) {
  const dir = path.join(tmpDir, "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "db-config.json"),
    JSON.stringify(contents, null, 2),
    "utf8",
  );
}

describe("getBootstrapSnapshot — databaseUrlSource", () => {
  it("returns 'env' when process.env.DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://from-env/db";
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    expect(snap.databaseUrlSource).toBe("env");
  });

  it("returns 'wizard' when only the wizard's local store has connectionUrl", async () => {
    writeStoreFile({ connectionUrl: "encrypted-blob" });
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    expect(snap.databaseUrlSource).toBe("wizard");
    expect(snap.hasConnectionUrl).toBe(true);
  });

  it("prefers 'env' over 'wizard' when both are set", async () => {
    process.env.DATABASE_URL = "postgres://from-env/db";
    writeStoreFile({ connectionUrl: "encrypted-blob" });
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    // process.env wins because that's the value the running app actually
    // uses — the wizard's file is just a backup the operator hasn't deleted.
    expect(snap.databaseUrlSource).toBe("env");
  });

  it("returns 'none' when neither env nor store has DATABASE_URL", async () => {
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    expect(snap.databaseUrlSource).toBe("none");
    expect(snap.hasConnectionUrl).toBe(false);
  });
});

describe("getBootstrapSnapshot — secret + public URL sources", () => {
  it("reports 'env' for SESSION_SECRET / ENCRYPTION_KEY when only env is set", async () => {
    process.env.SESSION_SECRET = "ses-from-env";
    process.env.ENCRYPTION_KEY = "enc-from-env";
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    expect(snap.sessionSecretSource).toBe("env");
    expect(snap.encryptionKeySource).toBe("env");
  });

  it("reports 'file' when the wizard wrote secrets but env is empty", async () => {
    writeStoreFile({
      sessionSecret: "ses-from-file",
      encryptionKey: "enc-from-file",
    });
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    expect(snap.sessionSecretSource).toBe("file");
    expect(snap.encryptionKeySource).toBe("file");
  });

  it("reports 'none' when neither env nor file has the secret", async () => {
    const { getBootstrapSnapshot } = await import("../app-config");
    const snap = getBootstrapSnapshot();
    expect(snap.sessionSecretSource).toBe("none");
    expect(snap.encryptionKeySource).toBe("none");
  });

  // task-370: the SMTP host is staged into the wizard's local store
  // (`data/db-config.json`, under the `smtp` block — see
  // server/lib/smtp-hydrate.ts) and only promoted into the
  // email_configuration table on next boot. Surfacing the source on
  // the snapshot lets the wizard's SMTP badge reflect "From wizard
  // file" the moment the wizard loads, instead of waiting for the
  // operator to re-type the host. We also leave room for a future
  // SMTP_HOST env override by grading in the same env/file/none shape
  // as the secrets.
  it("reports smtpHostSource as 'none' when neither env nor the wizard's deferred SMTP block has a host", async () => {
    delete process.env.SMTP_HOST;
    const { getBootstrapSnapshot } = await import("../app-config");
    expect(getBootstrapSnapshot().smtpHostSource).toBe("none");
  });

  it("reports smtpHostSource as 'file' when the wizard staged a deferred SMTP host", async () => {
    delete process.env.SMTP_HOST;
    writeStoreFile({
      smtp: {
        host: "smtp.example.com",
        port: 587,
        username: "u@example.com",
        passwordEncrypted: "encrypted",
        fromAddress: "from@example.com",
        secure: false,
      },
    });
    const { getBootstrapSnapshot } = await import("../app-config");
    expect(getBootstrapSnapshot().smtpHostSource).toBe("file");
  });

  it("reports smtpHostSource as 'none' when the deferred SMTP block has an empty host string", async () => {
    // Defensive: a malformed db-config.json with an empty `smtp.host`
    // (e.g. a partial wizard write) should not be graded as "file".
    delete process.env.SMTP_HOST;
    writeStoreFile({ smtp: { host: "", port: 587 } });
    const { getBootstrapSnapshot } = await import("../app-config");
    expect(getBootstrapSnapshot().smtpHostSource).toBe("none");
  });

  it("prefers SMTP_HOST env over the wizard's deferred SMTP block", async () => {
    process.env.SMTP_HOST = "smtp.from-env.example.com";
    writeStoreFile({ smtp: { host: "smtp.from-file.example.com", port: 587 } });
    const { getBootstrapSnapshot } = await import("../app-config");
    expect(getBootstrapSnapshot().smtpHostSource).toBe("env");
  });

  it("reports the publicAppUrlSource as default → file → env as the operator promotes it", async () => {
    // default fallback (localhost) when nothing is set
    let mod = await import("../app-config");
    expect(mod.getBootstrapSnapshot().publicAppUrlSource).toBe("default");

    // file-sourced
    writeStoreFile({ publicAppUrl: "https://from-file.example.com" });
    vi.resetModules();
    mod = await import("../app-config");
    expect(mod.getBootstrapSnapshot().publicAppUrlSource).toBe("file");

    // env wins over file
    process.env.PUBLIC_APP_URL = "https://from-env.example.com";
    vi.resetModules();
    mod = await import("../app-config");
    expect(mod.getBootstrapSnapshot().publicAppUrlSource).toBe("env");
  });
});
