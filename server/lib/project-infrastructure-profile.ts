// The Infrastructure Discovery profile attached to a project (migration 125,
// docs/features/infrastructure-discovery.md).
//
// Forms send `infrastructureProfileId` as a number, a numeric string, or
// null / "" to detach. A newly attached profile must belong to the
// project's own account. Moving a project to another account detaches a
// profile the caller did not resend. An unchanged id is kept without a
// lookup, so deleting the profile never blocks saving the project.

export interface ProjectInfrastructureProfileDeps {
  getInfrastructureProfileRef(id: number): Promise<{ id: number; customerId: number } | undefined>;
  /** The one account with this name, or null (see storage/_project-customer.ts). */
  resolveCustomerIdByName(name: string | null | undefined): Promise<number | null>;
}

export interface ProjectInfrastructureProfileCurrent {
  customerId: number | null;
  customerName: string | null;
  infrastructureProfileId: number | null;
}

export type ProjectInfrastructureProfileResult =
  | { ok: true; values: { infrastructureProfileId?: number | null } }
  | {
      ok: false;
      code: "invalid_infrastructure_profile" | "infrastructure_profile_not_found" | "infrastructure_profile_wrong_account";
      message: string;
    };

/** undefined: not sent; null: detach; number: an id; NaN: not a valid value. */
export function parseInfrastructureProfileRef(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

function nameKey(name: unknown): string {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

/**
 * Checks `infrastructureProfileId` in a project body against the project's
 * current values (null when creating). Returns only the column to write.
 */
export async function resolveProjectInfrastructureProfile(
  body: Record<string, unknown>,
  current: ProjectInfrastructureProfileCurrent | null,
  deps: ProjectInfrastructureProfileDeps,
): Promise<ProjectInfrastructureProfileResult> {
  const ref = parseInfrastructureProfileRef(body.infrastructureProfileId);
  if (Number.isNaN(ref)) {
    return { ok: false, code: "invalid_infrastructure_profile", message: "Invalid infrastructure profile" };
  }

  const sentCustomerId = typeof body.customerId === "number" ? body.customerId : undefined;
  const accountChanged =
    current !== null &&
    ((body.customerName !== undefined && nameKey(body.customerName) !== nameKey(current.customerName)) ||
      (sentCustomerId !== undefined && sentCustomerId !== current.customerId));

  if (ref === undefined) {
    return accountChanged && current?.infrastructureProfileId != null
      ? { ok: true, values: { infrastructureProfileId: null } }
      : { ok: true, values: {} };
  }
  if (ref === null) return { ok: true, values: { infrastructureProfileId: null } };
  if (current && !accountChanged && ref === current.infrastructureProfileId) {
    return { ok: true, values: { infrastructureProfileId: ref } };
  }

  const profile = await deps.getInfrastructureProfileRef(ref);
  if (!profile) {
    return { ok: false, code: "infrastructure_profile_not_found", message: "Infrastructure profile not found" };
  }

  let accountId: number | null;
  if (sentCustomerId !== undefined) accountId = sentCustomerId;
  else if (current && !accountChanged) accountId = current.customerId ?? (await deps.resolveCustomerIdByName(current.customerName));
  else accountId = await deps.resolveCustomerIdByName(typeof body.customerName === "string" ? body.customerName : null);

  if (accountId === null || profile.customerId !== accountId) {
    return {
      ok: false,
      code: "infrastructure_profile_wrong_account",
      message: "The infrastructure profile belongs to a different account",
    };
  }
  return { ok: true, values: { infrastructureProfileId: ref } };
}
