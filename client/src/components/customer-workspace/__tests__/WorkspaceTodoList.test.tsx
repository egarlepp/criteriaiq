import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerActionRow } from "@/lib/customer-actions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params?.count !== undefined ? `${key}:${params.count}` : key),
    i18n: { language: "en-US" },
  }),
}));
vi.mock("../use-workspace-mutations", () => ({
  useCustomerActionStatus: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { WorkspaceTodoList } from "../WorkspaceAside";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (taskId: number, projectId: number): CustomerActionRow => ({
  taskId,
  projectId,
  name: `Task ${taskId}`,
  stepName: null,
  status: "not_started",
  ownerUserId: null,
  ownerName: null,
  team: "Customer",
  dueDate: null,
  daysOverdue: 0,
  projectName: `P${projectId}`,
});

// Project 10 has 9 to-dos, project 20 has 2.
const actions = [...Array.from({ length: 9 }, (_, i) => row(i + 1, 10)), row(100, 20), row(101, 20)];
const projects = [
  { id: 10, label: "FD-AAN-159" },
  { id: 20, label: "FD-IGA-158" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: Partial<Parameters<typeof WorkspaceTodoList>[0]> = {}) =>
  act(() => root.render(<WorkspaceTodoList actions={actions} isExternalViewer showProject projects={projects} {...props} />));
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const rows = () => container.querySelectorAll("[data-testid='workspace-todos'] ul > li").length;

describe("WorkspaceTodoList", () => {
  it("starts compact with 8 rows, then expands and collapses the rest in place", () => {
    render();
    expect(rows()).toBe(8);
    expect(q("workspace-todos-more")!.textContent).toBe("workspace.todos.showMore:3");
    act(() => q("workspace-todos-more")!.click());
    expect(rows()).toBe(11);
    expect(q("workspace-todos-more")!.textContent).toBe("workspace.todos.showLess");
    act(() => q("workspace-todos-more")!.click());
    expect(rows()).toBe(8);
  });

  it("switches to detailed rows (5 shown) and keeps the list the same height", () => {
    render();
    const list = () => container.querySelector<HTMLElement>("[data-testid='workspace-todos'] ul")!;
    const compactHeight = list().style.height;
    expect(compactHeight).toBe("302px");
    expect(list().textContent).not.toContain("workspace.todos.noDueDate");
    act(() => q("workspace-todos-density")!.click());
    expect(q("workspace-todos-density")!.getAttribute("aria-pressed")).toBe("true");
    expect(rows()).toBe(5);
    expect(q("workspace-todos-more")!.textContent).toBe("workspace.todos.showMore:6");
    expect(list().style.height).toBe(compactHeight);
    expect(list().textContent).toContain("workspace.todos.noDueDate");
  });

  it("filters by project pill, each pill counting its open to-dos", () => {
    render();
    expect(q("workspace-todos-pill-10")!.textContent).toBe("FD-AAN-159" + "9");
    expect(q("workspace-todos-pill-20")!.textContent).toBe("FD-IGA-158" + "2");
    act(() => q("workspace-todos-pill-20")!.click());
    expect(rows()).toBe(2);
    expect(q("workspace-todos-pill-20")!.getAttribute("aria-pressed")).toBe("true");
    expect(q("workspace-todos-more")).toBeNull();
    act(() => q("workspace-todos-pill-all")!.click());
    expect(rows()).toBe(8);
  });

  it("leaves the pills out when every to-do is on one project", () => {
    render({ projects: [projects[0]], actions: actions.filter((action) => action.projectId === 10) });
    expect(q("workspace-todos-pill-all")).toBeNull();
  });
});

describe("WorkspaceTodoList project pills", () => {
  it("adds a pill for a project with to-dos that isn't in the list (a closed one)", () => {
    act(() =>
      root.render(
        <WorkspaceTodoList actions={[row(1, 10), row(2, 30)]} isExternalViewer showProject projects={[projects[0]]} />,
      ),
    );
    expect(q("workspace-todos-pill-30")!.textContent).toBe("P30" + "1");
  });

  it("gives no pill to a project without open to-dos", () => {
    render({ projects: [...projects, { id: 30, label: "FD-IGA-157" }] });
    expect(q("workspace-todos-pill-10")).not.toBeNull();
    expect(q("workspace-todos-pill-20")).not.toBeNull();
    expect(q("workspace-todos-pill-30")).toBeNull();
  });

  it("shows no pills and the empty note under All when no project has to-dos", () => {
    render({ actions: [] });
    expect(q("workspace-todos-pill-all")).toBeNull();
    expect(q("workspace-todos-empty")).not.toBeNull();
  });
});
