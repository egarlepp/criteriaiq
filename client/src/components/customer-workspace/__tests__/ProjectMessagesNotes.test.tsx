import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en-US" } }),
}));
vi.mock("../use-workspace-mutations", () => ({
  projectMessagesKey: (id: number) => ["/api/projects", id, "messages"],
  usePostProjectMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProjectMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkProjectMessagesRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Stand-ins for the lazy rich-text editor and the Markdown renderer.
vi.mock("@/components/rich-text/TiptapEditor", () => ({
  TiptapEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="notes-editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock("@/components/rich-text/MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => <div data-testid="notes-text">{content}</div>,
}));

import { ProjectMessagesCard } from "../ProjectMessagesCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(notes: { value: string | null; canEdit: boolean; onSave: (value: string) => Promise<unknown> }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ProjectMessagesCard projectId={3} isExternalViewer={false} timezone="UTC" notes={notes} />
      </QueryClientProvider>,
    ),
  );
}

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("ProjectMessagesCard notes", () => {
  it("pins the notes for readers without an Edit button", () => {
    render({ value: "Scoping call done.", canEdit: false, onSave: vi.fn() });
    expect(q("notes-text")?.textContent).toBe("Scoping call done.");
    expect(q("workspace-notes-edit")).toBeNull();
  });

  it("hides the block from readers when there are no notes", () => {
    render({ value: "", canEdit: false, onSave: vi.fn() });
    expect(q("workspace-notes")).toBeNull();
  });

  it("lets an editor change and save the notes", async () => {
    const onSave = vi.fn(async () => undefined);
    render({ value: "Old", canEdit: true, onSave });
    act(() => q("workspace-notes-edit")!.click());
    const editor = q("notes-editor") as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(editor, "New notes");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => q("workspace-notes-save")!.click());
    expect(onSave).toHaveBeenCalledWith("New notes");
    expect(q("notes-editor")).toBeNull();
  });

  it("keeps the editor open when saving fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("nope");
    });
    render({ value: null, canEdit: true, onSave });
    act(() => q("workspace-notes-add")!.click());
    await act(async () => q("workspace-notes-save")!.click());
    expect(q("notes-editor")).not.toBeNull();
  });
});
