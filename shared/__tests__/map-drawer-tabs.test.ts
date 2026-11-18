import { describe, expect, it } from "vitest";
import { MAP_DRAWER_TABS, MAP_EXTERNAL_ROLES, isMapExternalRole, mapDrawerTabsForRole } from "../map-drawer-tabs";
import { EXTERNAL_ROLES } from "../../server/lib/internal-access";

describe("Mutual Action Plan drawer tabs", () => {
  it("uses the same external roles as the server", () => {
    expect([...MAP_EXTERNAL_ROLES].sort()).toEqual([...EXTERNAL_ROLES].sort());
  });

  it("shows every tab to internal roles", () => {
    for (const role of ["Admin", "Engineer", "Sales", "CX", "Support", "Product", "Services"]) {
      expect(mapDrawerTabsForRole(role)).toEqual([...MAP_DRAWER_TABS]);
    }
  });

  it("shows external roles only the plan and the timeline", () => {
    for (const role of ["Customer", "Guest", "Partner"]) {
      expect(isMapExternalRole(role)).toBe(true);
      expect(mapDrawerTabsForRole(role)).toEqual(["plan", "timeline"]);
    }
  });
});
