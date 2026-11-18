import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: "en-US" },
  }),
}));
vi.mock("../use-workspace-mutations", () => ({ useCustomerActionStatus: () => ({ mutate: vi.fn(), isPending: false }) }));

import { WorkspaceTeamCard } from "../WorkspaceAside";
import { teamContacts } from "../workspace-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const ours = teamContacts([
  { role: "SE", person: { firstName: "Jordan", lastName: "Rivera", email: "j@v.com" } },
  { role: "Rep", person: { firstName: "Marcus", lastName: "Chen", email: "m@v.com" } },
]);
const theirs = teamContacts(
  Array.from({ length: 4 }, (_, index) => ({
    role: "IT",
    person: { firstName: `Person${index}`, lastName: "Borer", email: `p${index}@c.com` },
    badge: index === 0 ? "Edit" : "View",
  })),
  "customer",
);

describe("WorkspaceTeamCard", () => {
  it("lists both sides under their labels, with badges and a Show all for long lists", () => {
    act(() =>
      root.render(
        <WorkspaceTeamCard
          title="Team"
          limit={3}
          sections={[
            { key: "ours", label: "Our team", contacts: ours },
            { key: "customer", label: "Acme team", contacts: theirs },
          ]}
        />,
      ),
    );
    const oursSection = container.querySelector('[data-testid="workspace-team-ours"]')!;
    const customerSection = container.querySelector('[data-testid="workspace-team-customer"]')!;
    expect(oursSection.textContent).toContain("Our team");
    expect(oursSection.querySelectorAll("li")).toHaveLength(2);
    expect(customerSection.querySelectorAll("li")).toHaveLength(3);
    expect(customerSection.textContent).toContain("Edit");
    const more = Array.from(customerSection.querySelectorAll("button")).find((button) => button.textContent?.includes("showAll"));
    act(() => more!.click());
    expect(customerSection.querySelectorAll("li")).toHaveLength(4);
  });

  it("keeps the single list without section labels", () => {
    act(() => root.render(<WorkspaceTeamCard title="Your team" contacts={ours} />));
    expect(container.querySelector("h3")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
});
