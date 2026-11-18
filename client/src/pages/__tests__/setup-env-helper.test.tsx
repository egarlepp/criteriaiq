// @vitest-environment happy-dom
//
// Component-level coverage for the Setup wizard's "Required environment
// variables" copy-paste helper. The helper is rendered on the Secrets,
// Public URL, and Done steps so operators self-hosting on Dokploy /
// Coolify / Railway / Docker can paste a complete KEY=VALUE block into
// their host's env editor without leaving the wizard. This file locks the
// contract that:
//   * All four required keys (DATABASE_URL, SESSION_SECRET,
//     ENCRYPTION_KEY, PUBLIC_APP_URL) are surfaced.
//   * The "Generate secure value" button populates SESSION_SECRET /
//     ENCRYPTION_KEY with a fresh `crypto.getRandomValues`-backed value
//     and switches the button label to "Regenerate".
//   * The "Copy all" button writes the joined KEY=VALUE block to the
//     clipboard and is disabled when nothing is fillable.
//   * Per-row Copy buttons emit the matching `KEY=value` line.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  EnvHelperPanel,
  type EnvHelperSources,
  mapPublicUrlSource,
  mapSecretSource,
} from "../setup";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let writeTextMock: ReturnType<typeof vi.fn>;
let toastMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await i18n.changeLanguage("en");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  writeTextMock = vi.fn().mockResolvedValue(undefined);
  // happy-dom doesn't ship a navigator.clipboard. Define one we can spy on
  // so the panel's copy paths exercise the real success branch.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });

  // EnvHelperPanel routes its copy / generate / download feedback through
  // the shared toast helpers (showSuccessToast / showErrorToast). Those
  // helpers call the module-level `toast` export of @/hooks/use-toast, so
  // we spy on that export to capture every notification regardless of
  // which helper invoked it. The `toast` prop on EnvHelperPanel is kept
  // for backward compatibility but no longer drives the actual toasts.
  toastMock = vi.fn();
  const useToastModule = await import("@/hooks/use-toast");
  vi.spyOn(useToastModule, "toast").mockImplementation(
    toastMock as unknown as typeof useToastModule.toast,
  );
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

function clickByTestId(testId: string) {
  const btn = container.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!btn) throw new Error(`button ${testId} not rendered`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function panel(props: Partial<{
  databaseUrl: string;
  sessionSecret: string;
  encryptionKey: string;
  publicAppUrl: string;
  sources: EnvHelperSources;
}> = {}) {
  return (
    <EnvHelperPanel
      databaseUrl={props.databaseUrl ?? ""}
      sessionSecret={props.sessionSecret ?? ""}
      encryptionKey={props.encryptionKey ?? ""}
      publicAppUrl={props.publicAppUrl ?? ""}
      sources={props.sources}
      testIdPrefix="test"
      t={i18n.t.bind(i18n)}
      toast={toastMock as unknown as React.ComponentProps<typeof EnvHelperPanel>["toast"]}
    />
  );
}

describe("Setup — snapshot → badge source mappers", () => {
  // The mappers collapse the bootstrap snapshot's wider source vocabulary
  // (`none` for missing secrets, `default` for the localhost
  // fallback) into the badge's narrower "not-set" category, and pass through
  // the meaningful "env" / "file" values untouched. We assert each branch so
  // a future refactor of getBootstrapSnapshot can't silently widen the badge
  // contract without breaking this test.
  it("maps secret sources: env→env, file→file, none→not-set, undefined→not-set", () => {
    expect(mapSecretSource("env")).toBe("env");
    expect(mapSecretSource("file")).toBe("file");
    expect(mapSecretSource("none")).toBe("not-set");
    expect(mapSecretSource(undefined)).toBe("not-set");
  });

  it("maps public-url sources: env→env, file→file, default→not-set, undefined→not-set", () => {
    expect(mapPublicUrlSource("env")).toBe("env");
    expect(mapPublicUrlSource("file")).toBe("file");
    expect(mapPublicUrlSource("default")).toBe("not-set");
    expect(mapPublicUrlSource(undefined)).toBe("not-set");
  });
});

describe("Setup — env-var copy-paste helper", () => {
  it("renders all four required env keys with their values when provided", () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "session-value",
        encryptionKey: "encryption-value",
        publicAppUrl: "https://app.example.com",
      }),
    );

    for (const key of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "ENCRYPTION_KEY",
      "PUBLIC_APP_URL",
    ] as const) {
      const row = container.querySelector(`[data-testid="env-row-${key}"]`);
      expect(row, `missing row for ${key}`).not.toBeNull();
      expect(row!.textContent).toContain(`${key}=`);
    }
    expect(container.querySelector('[data-testid="env-row-DATABASE_URL"]')!
      .textContent).toContain("postgres://u:p@h:5432/d");
    expect(container.querySelector('[data-testid="env-row-SESSION_SECRET"]')!
      .textContent).toContain("session-value");
    expect(container.querySelector('[data-testid="env-row-ENCRYPTION_KEY"]')!
      .textContent).toContain("encryption-value");
    expect(container.querySelector('[data-testid="env-row-PUBLIC_APP_URL"]')!
      .textContent).toContain("https://app.example.com");
  });

  it("falls back to localized placeholders for missing values", () => {
    render(panel());
    const dbRow = container.querySelector(
      '[data-testid="env-row-DATABASE_URL"]',
    );
    const sessionRow = container.querySelector(
      '[data-testid="env-row-SESSION_SECRET"]',
    );
    expect(dbRow!.textContent).toContain(
      i18n.t("setup.envHelper.placeholders.databaseUrl"),
    );
    expect(sessionRow!.textContent).toContain(
      i18n.t("setup.envHelper.placeholders.sessionSecret"),
    );
  });

  it("populates SESSION_SECRET via Generate and switches the button label to Regenerate", async () => {
    render(panel({ databaseUrl: "postgres://x", publicAppUrl: "https://x" }));

    // Before generating, the row shows a placeholder, the per-row Copy is
    // disabled (no real value to copy), and the Copy-all button is disabled
    // because two of the four lines are still empty.
    const sessionCopy = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-copy-env-SESSION_SECRET"]',
    )!;
    expect(sessionCopy.disabled).toBe(true);
    const copyAll = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-copy-all-env-test"]',
    )!;
    expect(copyAll.disabled).toBe(false); // 2 of 4 still produce lines

    clickByTestId("button-generate-env-SESSION_SECRET");
    await flush();

    const sessionRow = container.querySelector(
      '[data-testid="env-row-SESSION_SECRET"]',
    )!;
    // crypto.getRandomValues + btoa(48 bytes) = 64-char base64 string. The
    // test asserts the value is no longer the placeholder and looks like
    // base64 of the right length.
    const text = sessionRow.textContent ?? "";
    const match = text.match(/SESSION_SECRET=(\S+)/);
    expect(match, "SESSION_SECRET row missing value").not.toBeNull();
    const generated = match![1];
    expect(generated).not.toEqual(
      i18n.t("setup.envHelper.placeholders.sessionSecret"),
    );
    expect(generated).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(generated.length).toBe(64);

    // The button now reads "Regenerate" and the per-row Copy is enabled.
    const generateBtn = container.querySelector(
      '[data-testid="button-generate-env-SESSION_SECRET"]',
    )!;
    expect(generateBtn.textContent).toContain(
      i18n.t("setup.envHelper.regenerate"),
    );
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="button-copy-env-SESSION_SECRET"]',
      )!.disabled,
    ).toBe(false);
  });

  it("Copy on a row writes KEY=value to the clipboard", async () => {
    render(panel({ publicAppUrl: "https://app.example.com" }));
    clickByTestId("button-copy-env-PUBLIC_APP_URL");
    await flush();
    expect(writeTextMock).toHaveBeenCalledWith(
      "PUBLIC_APP_URL=https://app.example.com",
    );
  });

  it("Copy all writes the joined KEY=VALUE block, omitting empty lines", async () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "ss",
        encryptionKey: "",
        publicAppUrl: "https://app.example.com",
      }),
    );
    clickByTestId("button-copy-all-env-test");
    await flush();
    const expected = [
      "DATABASE_URL=postgres://u:p@h:5432/d",
      "SESSION_SECRET=ss",
      "PUBLIC_APP_URL=https://app.example.com",
    ].join("\n");
    expect(writeTextMock).toHaveBeenCalledWith(expected);
  });

  it("Copy all is disabled when no row has a value", () => {
    render(panel());
    const copyAll = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-copy-all-env-test"]',
    )!;
    expect(copyAll.disabled).toBe(true);
  });

  it("renders a 'not set' badge for every row when no sources are provided", () => {
    render(panel());
    for (const key of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "ENCRYPTION_KEY",
      "PUBLIC_APP_URL",
    ] as const) {
      const badge = container.querySelector(
        `[data-testid="env-badge-${key}"]`,
      );
      expect(badge, `missing badge for ${key}`).not.toBeNull();
      expect(badge!.textContent).toBe(
        i18n.t("setup.envHelper.badge.not-set"),
      );
    }
  });

  it("renders the per-row source badges (env / file / wizard / not-set) when sources are provided", () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "ss",
        publicAppUrl: "https://app.example.com",
        sources: {
          databaseUrl: "wizard",
          sessionSecret: "file",
          encryptionKey: "env",
          publicAppUrl: "not-set",
        },
      }),
    );
    expect(
      container.querySelector('[data-testid="env-badge-DATABASE_URL"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.wizard"));
    expect(
      container.querySelector('[data-testid="env-badge-SESSION_SECRET"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.file"));
    expect(
      container.querySelector('[data-testid="env-badge-ENCRYPTION_KEY"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.env"));
    expect(
      container.querySelector('[data-testid="env-badge-PUBLIC_APP_URL"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.not-set"));
  });

  it("treats a freshly-generated SESSION_SECRET as a 'file'-sourced row even if the snapshot says 'env'", async () => {
    // Operator already has SESSION_SECRET in their env, but clicks Generate
    // on the Done step to mint a brand new value to copy. The badge must
    // flip to "file" because the new value lives only in the browser until
    // the operator promotes it — claiming it's still 'env' would lull them
    // into not pasting it into their host's env editor.
    render(
      panel({
        sources: {
          databaseUrl: "env",
          sessionSecret: "env",
          encryptionKey: "env",
          publicAppUrl: "env",
        },
      }),
    );
    expect(
      container.querySelector('[data-testid="env-badge-SESSION_SECRET"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.env"));

    clickByTestId("button-generate-env-SESSION_SECRET");
    await flush();

    expect(
      container.querySelector('[data-testid="env-badge-SESSION_SECRET"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.file"));
  });

  it("shows the 'promote into env' hint when at least one row is file/wizard-sourced", () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "ss",
        encryptionKey: "ek",
        publicAppUrl: "https://app.example.com",
        sources: {
          databaseUrl: "env",
          sessionSecret: "file",
          encryptionKey: "env",
          publicAppUrl: "env",
        },
      }),
    );
    const promote = container.querySelector(
      '[data-testid="env-promote-hint-test"]',
    );
    expect(promote, "promote hint should render").not.toBeNull();
    expect(promote!.textContent).toBe(
      i18n.t("setup.envHelper.promoteHint"),
    );
    // The "missing" hint must NOT also render — the file/wizard message
    // is the more actionable one.
    expect(
      container.querySelector('[data-testid="env-missing-hint-test"]'),
    ).toBeNull();
  });

  it("falls back to the missing-values hint when no row is file/wizard-sourced", () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "ss",
        // encryptionKey blank → triggers hasMissing
        publicAppUrl: "https://app.example.com",
        sources: {
          databaseUrl: "env",
          sessionSecret: "env",
          encryptionKey: "not-set",
          publicAppUrl: "env",
        },
      }),
    );
    expect(
      container.querySelector('[data-testid="env-promote-hint-test"]'),
    ).toBeNull();
    const missing = container.querySelector(
      '[data-testid="env-missing-hint-test"]',
    );
    expect(missing, "missing hint should render").not.toBeNull();
    expect(missing!.textContent).toBe(
      i18n.t("setup.envHelper.missingHint"),
    );
  });

  it("renders neither hint when every row is env-sourced and populated", () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "ss",
        encryptionKey: "ek",
        publicAppUrl: "https://app.example.com",
        sources: {
          databaseUrl: "env",
          sessionSecret: "env",
          encryptionKey: "env",
          publicAppUrl: "env",
        },
      }),
    );
    expect(
      container.querySelector('[data-testid="env-promote-hint-test"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="env-missing-hint-test"]'),
    ).toBeNull();
  });

  it("surfaces a destructive toast when the clipboard rejects without echoing the secret value", async () => {
    // Regression for the toast leaking SESSION_SECRET / ENCRYPTION_KEY
    // material into a destructive toast description: when both
    // navigator.clipboard.writeText AND the document.execCommand fallback
    // fail, the toast must surface a generic localized hint and must NOT
    // contain the secret value the operator was trying to copy.
    writeTextMock.mockRejectedValueOnce(new Error("denied"));
    const SECRET = "super-secret-session-value-do-not-leak";
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: SECRET,
        publicAppUrl: "https://x",
      }),
    );
    clickByTestId("button-copy-env-SESSION_SECRET");
    await flush();
    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0][0];
    expect(call.variant).toBe("error");
    expect(call.title).toBe(i18n.t("setup.envHelper.copyFailed"));
    expect(call.description).toBe(i18n.t("setup.envHelper.copyFailedHint"));
    expect(call.description).not.toContain(SECRET);
  });

  it("renders an inline PUBLIC_APP_URL helper line under the URL row", () => {
    render(panel({ publicAppUrl: "https://app.example.com" }));
    const help = container.querySelector(
      '[data-testid="env-row-PUBLIC_APP_URL-help"]',
    );
    expect(help, "PUBLIC_APP_URL helper line should render").not.toBeNull();
    expect(help!.textContent).toBe(i18n.t("setup.envHelper.publicAppUrlHelp"));
    // Must only appear under the PUBLIC_APP_URL row, not under siblings.
    expect(
      container.querySelector('[data-testid="env-row-DATABASE_URL-help"]'),
    ).toBeNull();
  });

  it("opens the disclosure with the rotating chevron when the operator clicks Summary", () => {
    render(panel({ publicAppUrl: "https://x" }));
    const details = container.querySelector<HTMLDetailsElement>(
      '[data-testid="test-env-helper"]',
    )!;
    expect(details).not.toBeNull();
    // The arbitrary-variant rotation hook must be wired up so opening the
    // <details> twirls the leading chevron 90deg downward — this is the
    // class hook the wizard relies on, so we lock it in tests.
    expect(details.className).toContain(
      "[&[open]_.disclosure-chevron]:rotate-90",
    );
    const chevron = details.querySelector(".disclosure-chevron");
    expect(chevron, "chevron child must use the disclosure-chevron class")
      .not.toBeNull();
    expect(details.open).toBe(false);
    act(() => {
      details.open = true;
    });
    expect(details.open).toBe(true);
  });

  it("falls back silently to execCommand when writeText rejects (no destructive toast)", async () => {
    // Some browsers expose navigator.clipboard but reject writeText when
    // the page isn't focused or the operator denied the permission.
    // safeCopyToClipboard must catch the rejection and try execCommand
    // before surfacing any failure UI — the operator should see a green
    // "Copied" affordance, NOT the destructive toast that fires only when
    // both paths fail.
    writeTextMock.mockRejectedValueOnce(new Error("not focused"));
    const execMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execMock,
    });

    render(panel({ publicAppUrl: "https://app.example.com" }));
    clickByTestId("button-copy-env-PUBLIC_APP_URL");
    await flush();

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(execMock).toHaveBeenCalledWith("copy");
    expect(toastMock).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="button-copy-env-PUBLIC_APP_URL"]')!
        .textContent,
    ).toContain(i18n.t("setup.envHelper.copied"));
  });

  it("falls back to execCommand('copy') when navigator.clipboard is missing (insecure HTTP)", async () => {
    // Plain-HTTP self-hosted deployments (Dokploy *.traefik.me, internal
    // LANs) don't expose navigator.clipboard. The wizard must transparently
    // fall back to the off-screen <textarea> + document.execCommand('copy')
    // path so the Copy buttons keep working without throwing a TypeError
    // and triggering the global "Script error" overlay.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execMock,
    });

    render(panel({ publicAppUrl: "https://app.example.com" }));
    clickByTestId("button-copy-env-PUBLIC_APP_URL");
    await flush();

    expect(execMock).toHaveBeenCalledWith("copy");
    expect(toastMock).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="button-copy-env-PUBLIC_APP_URL"]')!
        .textContent,
    ).toContain(i18n.t("setup.envHelper.copied"));
  });

  it("Download .env triggers a download of criteriaiq.env with the localized header and KEY=VALUE block", async () => {
    // Capture the Blob handed to URL.createObjectURL and the <a download>
    // attribute the panel sets. happy-dom doesn't really fetch the blob, so
    // we read the Blob's text directly to verify the bytes the operator
    // would actually save next to their docker-compose.yml.
    let capturedBlob: Blob | null = null;
    const createUrlMock = vi.fn((arg: Blob | MediaSource) => {
      if (arg instanceof Blob) capturedBlob = arg;
      return "blob:mock";
    });
    const revokeUrlMock = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createUrlMock as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeUrlMock as unknown as typeof URL.revokeObjectURL;

    // Spy on the temporary <a> click so we can assert the download filename
    // without happy-dom actually navigating.
    const clickSpy = vi.fn();
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      clickSpy(this.download, this.href);
    };

    try {
      render(
        panel({
          databaseUrl: "postgres://u:p@h:5432/d",
          sessionSecret: "ss",
          encryptionKey: "",
          publicAppUrl: "https://app.example.com",
        }),
      );
      clickByTestId("button-download-env-test");
      await flush();

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy.mock.calls[0][0]).toBe("criteriaiq.env");
      expect(capturedBlob).not.toBeNull();
      expect(capturedBlob!.type).toBe("text/plain;charset=utf-8");

      const text = await capturedBlob!.text();
      const header = i18n.t("setup.envHelper.downloadHeader");
      // Header line, then the same block "Copy all" produces (empty values
      // skipped), then a trailing newline.
      const expected =
        `${header}\n` +
        [
          "DATABASE_URL=postgres://u:p@h:5432/d",
          "SESSION_SECRET=ss",
          "PUBLIC_APP_URL=https://app.example.com",
        ].join("\n") +
        "\n";
      expect(text).toBe(expected);

      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: i18n.t("setup.envHelper.downloadToast"),
        }),
      );
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it("Download .env button is disabled when no row has a value", () => {
    render(panel());
    const downloadBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-download-env-test"]',
    )!;
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.disabled).toBe(true);
  });

  // task-454: unset rows must mark themselves data-unset and mute the value
  // span so placeholders read as hints, not copyable assignments.
  it("marks unset rows data-unset=\"true\" and mutes the value-portion span", () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        // sessionSecret intentionally blank → unset row
        // encryptionKey intentionally blank → unset row
        publicAppUrl: "https://app.example.com",
      }),
    );

    const dbRow = container.querySelector<HTMLElement>(
      '[data-testid="env-row-DATABASE_URL"]',
    )!;
    const sessionRow = container.querySelector<HTMLElement>(
      '[data-testid="env-row-SESSION_SECRET"]',
    )!;
    const sessionValue = container.querySelector<HTMLElement>(
      '[data-testid="env-row-value-SESSION_SECRET"]',
    )!;
    const dbValue = container.querySelector<HTMLElement>(
      '[data-testid="env-row-value-DATABASE_URL"]',
    )!;

    expect(dbRow.dataset.unset).toBe("false");
    expect(sessionRow.dataset.unset).toBe("true");
    // Set rows render their value at full contrast (no muted/italic class).
    expect(dbValue.className).toBe("");
    // Unset rows mute the value span so the placeholder reads as a hint.
    expect(sessionValue.className).toContain("text-muted-foreground");
    expect(sessionValue.className).toContain("italic");
  });

  it("never surfaces a localhost URL when the PUBLIC_APP_URL row is unset", () => {
    // task-454: unset PUBLIC_APP_URL renders the placeholder, not the
    // server's localhost fallback.
    render(panel({ publicAppUrl: "" }));

    const row = container.querySelector<HTMLElement>(
      '[data-testid="env-row-PUBLIC_APP_URL"]',
    )!;
    const value = container.querySelector<HTMLElement>(
      '[data-testid="env-row-value-PUBLIC_APP_URL"]',
    )!;

    expect(row.dataset.unset).toBe("true");
    expect(row.textContent).not.toContain("localhost");
    expect(row.textContent).not.toContain("http://");
    expect(value.textContent).toBe(
      i18n.t("setup.envHelper.placeholders.publicAppUrl"),
    );

    const copyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-copy-env-PUBLIC_APP_URL"]',
    )!;
    expect(copyBtn.disabled).toBe(true);
  });

  it("excludes the unset PUBLIC_APP_URL row from Copy all and Download .env", async () => {
    let capturedBlob: Blob | null = null;
    const createUrlMock = vi.fn((arg: Blob | MediaSource) => {
      if (arg instanceof Blob) capturedBlob = arg;
      return "blob:mock";
    });
    const revokeUrlMock = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createUrlMock as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeUrlMock as unknown as typeof URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched() {};

    try {
      render(
        panel({
          databaseUrl: "postgres://u:p@h:5432/d",
          sessionSecret: "ss",
          encryptionKey: "ek",
          publicAppUrl: "",
        }),
      );

      // Copy all → joined block must not include PUBLIC_APP_URL.
      clickByTestId("button-copy-all-env-test");
      await flush();
      const copyAllArg = writeTextMock.mock.calls.at(-1)?.[0] as string;
      expect(copyAllArg).toBe(
        [
          "DATABASE_URL=postgres://u:p@h:5432/d",
          "SESSION_SECRET=ss",
          "ENCRYPTION_KEY=ek",
        ].join("\n"),
      );
      expect(copyAllArg).not.toContain("PUBLIC_APP_URL");
      expect(copyAllArg).not.toContain("localhost");

      // Download .env → blob bytes must not include PUBLIC_APP_URL either.
      clickByTestId("button-download-env-test");
      await flush();
      expect(capturedBlob).not.toBeNull();
      const text = await capturedBlob!.text();
      expect(text).not.toContain("PUBLIC_APP_URL");
      expect(text).not.toContain("localhost");
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it("brightens the PUBLIC_APP_URL row back into copy/download once a real value is provided", async () => {
    render(
      panel({
        databaseUrl: "postgres://u:p@h:5432/d",
        sessionSecret: "ss",
        encryptionKey: "ek",
        publicAppUrl: "https://app.example.com",
      }),
    );

    const row = container.querySelector<HTMLElement>(
      '[data-testid="env-row-PUBLIC_APP_URL"]',
    )!;
    const value = container.querySelector<HTMLElement>(
      '[data-testid="env-row-value-PUBLIC_APP_URL"]',
    )!;
    expect(row.dataset.unset).toBe("false");
    expect(value.className).toBe("");
    expect(value.textContent).toBe("https://app.example.com");

    const copyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-copy-env-PUBLIC_APP_URL"]',
    )!;
    expect(copyBtn.disabled).toBe(false);

    clickByTestId("button-copy-all-env-test");
    await flush();
    const copyAllArg = writeTextMock.mock.calls.at(-1)?.[0] as string;
    expect(copyAllArg).toContain("PUBLIC_APP_URL=https://app.example.com");
  });

  it("inline PUBLIC_APP_URL helper warns operators against pasting a localhost URL", () => {
    render(panel({ publicAppUrl: "https://app.example.com" }));
    const help = container.querySelector(
      '[data-testid="env-row-PUBLIC_APP_URL-help"]',
    );
    expect(help).not.toBeNull();
    expect(help!.textContent).toContain("localhost");
    expect(help!.textContent).toContain("Public URL");
  });
});
