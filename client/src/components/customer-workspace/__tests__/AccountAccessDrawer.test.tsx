import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en-US" } }),
}));

import { AccountAccessDrawer, type AccountAccessProject } from "../AccountAccessDrawer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const users = [
  { id: "u1", firstName: "Lewis", lastName: "Mohr", email: "lewis@acme.test", title: "IAM Architect" },
  { id: "u2", firstName: "Daphnee", lastName: "Rice", email: "daphnee@acme.test" },
  { id: "u3", firstName: "Guest", lastName: "Viewer", email: "guest@acme.test" },
];
const contacts = [
  { userId: "u1", stakeholderTypes: ["Technical Champion"] },
  { userId: "u2", stakeholderTypes: ["Economic Buyer"] },
];
const projects: AccountAccessProject[] = [
  { id: 7, name: "SR-PAM-143", additionalAccess: [{ userId: "u1" }] },
  { id: 8, name: "SR-AAN-150" },
];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // The project's customer access list: Lewis can edit, and a guest who
  // isn't an account contact can view.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify([
          { userEmail: "lewis@acme.test", permission: "edit" },
          { userEmail: "guest@acme.test", permission: "view" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(project: AccountAccessProject | null, viewerId: string | null = null) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json(),
      },
    },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AccountAccessDrawer open onOpenChange={() => {}} accountName="Acme" contacts={contacts} users={users} projects={projects} project={project} viewerId={viewerId} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const row = (key: string) => document.body.querySelector<HTMLElement>(`[data-testid="account-access-row-${key}"]`);

describe("AccountAccessDrawer", () => {
  it("lists every account contact with initials, job title (not stakeholder type) and project count", async () => {
    await render(null);
    expect(row("u1")?.textContent).toContain("LM");
    expect(row("u1")?.textContent).toContain("IAM Architect");
    expect(row("u1")?.textContent).not.toContain("Technical Champion");
    expect(row("u2")?.textContent).toContain("accountPortal.access.noTitle");
    expect(row("u1")?.textContent).toContain("accountPortal.access.projectCount");
    expect(row("u2")).not.toBeNull();
    expect(document.body.textContent).toContain("accountPortal.access.title");
  });

  it("scoped to a project, lists only its people with their permission", async () => {
    await render(projects[0]);
    expect(document.body.textContent).toContain("accountPortal.access.projectTitle");
    expect(row("u1")?.textContent).toContain("accountPortal.access.permissionEdit");
    expect(row("u2")).toBeNull();
    expect(row("email-guest@acme.test")?.textContent).toContain("accountPortal.access.permissionView");
  });

  it("offers a viewer without a title to set their own, and only theirs", async () => {
    await render(null, "u2");
    expect(row("u2")?.querySelector('[data-testid="account-access-set-title"]')).not.toBeNull();
    expect(row("u1")?.querySelector('[data-testid="account-access-set-title"]')).toBeNull();
  });
});
