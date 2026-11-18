// @vitest-environment happy-dom
//
// Coverage for task #369 — System Settings source-of-truth badges
// (Public URL + SMTP host) sharing the same FieldSourceBadge / wording
// the Setup wizard already uses.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EmailProviderSelect } from "../EmailProviderSelect";
import { FieldSourceBadge } from "../FieldSourceBadge";
import { mapPublicUrlSource } from "@/lib/env-source-badges";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => "[]",
        headers: new Headers({ "content-type": "application/json" }),
      }) as unknown as Response,
  ) as unknown as typeof fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = originalFetch;
});

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const url = queryKey[0] as string;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      },
    },
  });
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setInputValue(selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`input ${selector} not rendered`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function badgeAt(testId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`badge ${testId} not rendered`);
  return el;
}

describe("System Settings — Email Configuration: SMTP host badge (task #369)", () => {
  it("starts as 'not-set' when no SMTP server has been configured", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={makeClient()}>
          <EmailProviderSelect
            currentConfig={null}
            onSave={() => {}}
            onTest={() => {}}
          />
        </QueryClientProvider>,
      );
    });
    await flush();

    const badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("not-set");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.not-set"),
    );
  });

  it("renders 'file' wording when the existing config already has an SMTP server", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={makeClient()}>
          <EmailProviderSelect
            currentConfig={{
              enabled: true,
              provider: 'manual',
              server: 'smtp.example.com',
              port: 587,
              fromAddress: 'noreply@example.com',
              username: 'apikey',
              password: 'secret',
              replyToAddress: '',
              maxRetries: 3,
              retryDelay: 5,
              rateLimit: 60,
              tls: false,
              startTLS: true,
            }}
            onSave={() => {}}
            onTest={() => {}}
          />
        </QueryClientProvider>,
      );
    });
    await flush();

    const badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("file");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.file"),
    );
  });

  it("renders 'env' when the bootstrap snapshot reports SMTP_HOST is set in the host env", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={makeClient()}>
          <EmailProviderSelect
            currentConfig={null}
            onSave={() => {}}
            onTest={() => {}}
            smtpHostSource="env"
          />
        </QueryClientProvider>,
      );
    });
    await flush();

    const badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("env");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.env"),
    );
  });

  it("snapshot 'env' overrides local input presence", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={makeClient()}>
          <EmailProviderSelect
            currentConfig={{
              enabled: true,
              provider: 'manual',
              server: 'smtp.example.com',
              port: 587,
              fromAddress: 'noreply@example.com',
              username: 'apikey',
              password: 'secret',
              replyToAddress: '',
              maxRetries: 3,
              retryDelay: 5,
              rateLimit: 60,
              tls: false,
              startTLS: true,
            }}
            onSave={() => {}}
            onTest={() => {}}
            smtpHostSource="env"
          />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(badgeAt("field-source-badge-smtp-host").dataset.source).toBe("env");
  });

  it("falls back to local input value when smtpHostSource is omitted (wizard usage)", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={makeClient()}>
          <EmailProviderSelect
            currentConfig={null}
            onSave={() => {}}
            onTest={() => {}}
          />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(badgeAt("field-source-badge-smtp-host").dataset.source).toBe(
      "not-set",
    );

    const inputs = Array.from(
      container.querySelectorAll<HTMLInputElement>("input"),
    );
    const smtpServer = inputs.find(
      (i) => i.getAttribute("placeholder") === "smtp.example.com",
    );
    if (!smtpServer) throw new Error("SMTP server input not found");

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(smtpServer, "smtp.sendgrid.net");
      smtpServer.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    const badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("file");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.file"),
    );
  });
});

describe("FieldSourceBadge — shared component (task #369)", () => {
  it.each([
    ["env", i18n.t("setup.envHelper.fieldBadge.env")],
    ["file", i18n.t("setup.envHelper.fieldBadge.file")],
    ["wizard", i18n.t("setup.envHelper.fieldBadge.wizard")],
    ["not-set", i18n.t("setup.envHelper.fieldBadge.not-set")],
  ] as const)("renders %s wording", (source, expected) => {
    act(() => {
      root.render(
        <FieldSourceBadge source={source} testId="badge-under-test" />,
      );
    });
    const badge = badgeAt("badge-under-test");
    expect(badge.dataset.source).toBe(source);
    expect(badge.textContent).toBe(expected);
  });

  it("collapses snapshot publicAppUrlSource 'env' / 'file' / 'default' through the shared helper", () => {
    expect(mapPublicUrlSource("env")).toBe("env");
    expect(mapPublicUrlSource("file")).toBe("file");
    expect(mapPublicUrlSource("default")).toBe("not-set");
    expect(mapPublicUrlSource(undefined)).toBe("not-set");
  });
});
