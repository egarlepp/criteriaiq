import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMessageView } from "@shared/project-messages";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params?.count !== undefined ? `${key}:${params.count}` : key),
    i18n: { language: "en-US" },
  }),
}));
// The real thread fetches and posts; a stand-in shows which project is open.
vi.mock("../ProjectMessageThread", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ProjectMessageThread")>()),
  ProjectMessageThread: ({ projectId }: { projectId: number }) => <div data-testid="thread">{projectId}</div>,
}));

import { PortalMessagesCard } from "../PortalMessagesCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const message = (id: number, projectId: number, body: string, authorIsExternal = false): ProjectMessageView => ({
  id,
  projectId,
  body,
  authorId: "u1",
  authorName: authorIsExternal ? "Jenny Borer" : "Sam Engineer",
  authorIsExternal,
  createdAt: "2026-11-12T15:00:00.000Z",
  deletedAt: null,
  canDelete: false,
});

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify([message(1, 10, "Lab is ready"), message(2, 20, "Two accounts are missing", true)]), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(selected: number | null, onSelect = vi.fn(), unread = new Map([[10, 0], [20, 2]])) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PortalMessagesCard
          projects={[
            { id: 10, label: "FD-AAN-159" },
            { id: 20, label: "FD-IGA-158" },
          ]}
          unread={unread}
          selectedProjectId={selected}
          onSelect={onSelect}
          isExternalViewer
          accountName="Friesen"
          timezone="UTC"
        />
      </QueryClientProvider>,
    ),
  );
  // Let the latest-messages query settle.
  if (selected === null && unread.size > 0) {
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelector('[data-testid="portal-messages-latest"]')).not.toBeNull();
    });
  }
  return onSelect;
}

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("PortalMessagesCard", () => {
  it("shows the latest messages from every project, each tagged with its project", async () => {
    await render(null);
    expect(fetchMock).toHaveBeenCalledWith("/api/project-messages?projectIds=10,20", { credentials: "include" });
    const latest = q("portal-messages-latest")!;
    expect(latest.textContent).toContain("Lab is ready");
    expect(latest.textContent).toContain("FD-IGA-158");
    expect(q("thread")).toBeNull();
    expect(q("portal-messages-pill-all")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("puts each project's unread count on its pill and the total in the header", async () => {
    await render(null);
    expect(q("portal-messages-pill-20")!.textContent).toBe("FD-IGA-158" + "2");
    expect(q("portal-messages-pill-10")!.textContent).toBe("FD-AAN-159");
    expect(q("portal-messages-unread")!.textContent).toBe("workspace.portalMessages.unread:2");
  });

  it("selects a project from its pill or a message's project tag", async () => {
    const onSelect = await render(null);
    act(() => q("portal-messages-pill-10")!.click());
    expect(onSelect).toHaveBeenLastCalledWith(10);
    const tag = [...q("portal-messages-latest")!.querySelectorAll("button")].find((b) => b.textContent === "FD-IGA-158")!;
    act(() => tag.click());
    expect(onSelect).toHaveBeenLastCalledWith(20);
  });

  it("opens the selected project's conversation in place of the latest list", async () => {
    await render(20);
    expect(q("thread")!.textContent).toBe("20");
    expect(q("portal-messages-latest")).toBeNull();
    expect(q("portal-messages-pill-20")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("gives a project a pill only once it has messages", async () => {
    await render(null, vi.fn(), new Map([[20, 2]]));
    expect(q("portal-messages-pill-20")).not.toBeNull();
    expect(q("portal-messages-pill-10")).toBeNull();
  });

  it("shows no pills and the empty note under All when no project has messages", async () => {
    fetchMock.mockImplementation(async () => new Response("[]", { status: 200 }));
    await render(null, vi.fn(), new Map());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(q("portal-messages-empty")).not.toBeNull();
    });
    expect(q("portal-messages-pill-all")).toBeNull();
    expect(q("portal-messages-empty")!.textContent).toBe("workspace.portalMessages.empty");
  });

  it("keeps a pill for a project opened from its card before its first message", async () => {
    await render(10, vi.fn(), new Map());
    expect(q("thread")!.textContent).toBe("10");
    expect(q("portal-messages-pill-10")!.getAttribute("aria-pressed")).toBe("true");
    expect(q("portal-messages-pill-20")).toBeNull();
  });
});
