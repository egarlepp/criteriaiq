// @vitest-environment node
//
// Outside users only see Artifacts library items for their own account.

import { describe, expect, it } from "vitest";
import { canDeleteDocument, canViewLibraryItem, filterLibraryItems, type LibraryViewer } from "../library-access";

const internal: LibraryViewer = { userId: "staff", external: false, accountIds: new Set() };
const customer: LibraryViewer = { userId: "cust-1", external: true, accountIds: new Set([7]) };

describe("canViewLibraryItem", () => {
  it("lets internal users see everything", () => {
    expect(canViewLibraryItem(internal, { isActive: false, competitorId: 3, documentType: "Battlecard" })).toBe(true);
  });

  it("shows outside users items with no account scope", () => {
    expect(canViewLibraryItem(customer, { isActive: true, accountIds: [] })).toBe(true);
  });

  it("shows outside users items scoped to their account", () => {
    expect(canViewLibraryItem(customer, { accountIds: [3, 7] })).toBe(true);
    expect(canViewLibraryItem(customer, { customerId: 7 })).toBe(true);
  });

  it("hides another account's items", () => {
    expect(canViewLibraryItem(customer, { accountIds: [3] })).toBe(false);
    expect(canViewLibraryItem(customer, { customerId: 3 })).toBe(false);
  });

  it("hides inactive, competitor and internal-only items", () => {
    expect(canViewLibraryItem(customer, { isActive: false })).toBe(false);
    expect(canViewLibraryItem(customer, { competitorId: 1 })).toBe(false);
    expect(canViewLibraryItem(customer, { documentType: "Win/Loss Info" })).toBe(false);
    expect(canViewLibraryItem(customer, { linkType: "Battlecard" })).toBe(false);
  });
});

describe("filterLibraryItems", () => {
  it("keeps only what an outside user may see", () => {
    const items = [{ id: 1, accountIds: [7] }, { id: 2, accountIds: [8] }, { id: 3, competitorId: 2 }];
    expect(filterLibraryItems(customer, items).map((i) => i.id)).toEqual([1]);
    expect(filterLibraryItems(internal, items)).toHaveLength(3);
  });
});

describe("canDeleteDocument", () => {
  it("lets outside users delete only their own uploads", () => {
    expect(canDeleteDocument(customer, { uploadedByUserId: "cust-1", customerId: 7 })).toBe(true);
    expect(canDeleteDocument(customer, { uploadedByUserId: "someone-else", customerId: 7 })).toBe(false);
    expect(canDeleteDocument(customer, { uploadedByUserId: "cust-1", customerId: 3 })).toBe(false);
  });

  it("lets internal users delete any document", () => {
    expect(canDeleteDocument(internal, { uploadedByUserId: "someone-else" })).toBe(true);
  });
});
