// OIDC Single Sign-On — mixin for DatabaseStorage.
//
// Owns the read/write path for the `sso_config` rows (one per provider:
// Okta = id 1, Azure = id 2, enforced by the `sso_config_provider_row`
// CHECK from migration 078) and the SSO-related lookup/link helpers on
// `users` that the OIDC callback in `server/auth/oidcAuth.ts` uses to
// resolve, create, and link accounts.
//
// Three rules baked into this layer:
//
//   1. Lookups are keyed on `(sso_provider, sso_external_id)`, NEVER
//      on email. The IdP's durable id (`sub`, or `oid` for Entra) is
//      the identifier; email is mutable and using it as the join key
//      opens an account-takeover path when an IdP admin reassigns an
//      email. The partial index `users_sso_idx` (added by migration
//      071) backs this query.
//
//   2. `getSsoConfig(provider)` returns a default-disabled row on first
//      access. This makes the OIDC layer's reads total — there is no
//      "config missing" failure mode that has to be handled by every
//      caller. The disabled row is filtered out by the public
//      `/api/auth/sso/status` endpoint so the landing page does not
//      render a provider's button until an admin configures it.
//
//   3. `upsertSsoConfig` expects the caller to have already
//      AES-256-GCM-encrypted `clientSecretEnc` via the existing
//      `encryptText` helper in `server/auth/mfaUtils.ts`. The mixin
//      does not see the plaintext — the boundary between admin route
//      and storage is the encryption boundary, mirroring the n8n /
//      Salesforce config pattern.
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { ssoConfig, users, SSO_PROVIDER_ROW_IDS } from "@shared/schema";
import type { SsoConfig, InsertSsoConfig, SsoProvider, User } from "@shared/schema";

const DEFAULT_DISABLED_CONFIG: Record<SsoProvider, InsertSsoConfig> = {
  okta: {
    provider: "okta",
    enabled: false,
    allowJit: true,
    scopes: "openid profile email groups",
    groupClaimName: "groups",
    roleMapping: {},
    defaultRoleForUnmapped: "Engineer",
    requireMfaTrust: true,
    syncRoleOnEveryLogin: false,
    rpInitiatedLogout: false,
  },
  // Entra rejects scopes it does not know, so no "groups" scope; group
  // ids arrive in the `groups` claim once the app registration's token
  // configuration adds it. JIT is off by default, as in ImpactIQ.
  azure: {
    provider: "azure",
    enabled: false,
    allowJit: false,
    scopes: "openid profile email",
    groupClaimName: "groups",
    roleMapping: {},
    defaultRoleForUnmapped: "Engineer",
    requireMfaTrust: true,
    syncRoleOnEveryLogin: false,
    rpInitiatedLogout: false,
  },
};

export class SsoStorageMixin {
  /**
   * Returns the provider's SSO config row. Creates a default-disabled
   * row on first access so every downstream caller can rely on the
   * read being total. The insert is ON CONFLICT DO NOTHING so a
   * parallel boot race (two replicas on a fresh DB) does not raise a
   * unique-constraint violation.
   */
  async getSsoConfig(provider: SsoProvider = "okta"): Promise<SsoConfig> {
    const id = SSO_PROVIDER_ROW_IDS[provider];
    const existing = await db.select().from(ssoConfig).where(eq(ssoConfig.id, id)).limit(1);
    if (existing[0]) {
      return existing[0];
    }

    await db
      .insert(ssoConfig)
      .values({ id, ...DEFAULT_DISABLED_CONFIG[provider] })
      .onConflictDoNothing({ target: ssoConfig.id });

    const seeded = await db.select().from(ssoConfig).where(eq(ssoConfig.id, id)).limit(1);
    return seeded[0]!;
  }

  /**
   * Updates the provider's row. The caller is responsible for
   * encrypting `clientSecretEnc` before calling — by the time the
   * value reaches this method it MUST already be the
   * `${iv}:${ciphertext}:${authTag}` string produced by
   * `encryptText`. Omitting the key leaves the existing encrypted
   * value in place; passing `null` clears it.
   */
  async upsertSsoConfig(
    provider: SsoProvider,
    updates: Partial<InsertSsoConfig>,
    updatedBy?: string,
  ): Promise<SsoConfig> {
    await this.getSsoConfig(provider); // ensures the row exists

    // `provider` is fixed by the row id; never let an update move it.
    const { provider: _ignored, ...rest } = updates;
    const [updated] = await db
      .update(ssoConfig)
      .set({
        ...rest,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(ssoConfig.id, SSO_PROVIDER_ROW_IDS[provider]))
      .returning();

    return updated!;
  }

  /**
   * Records the outcome of the admin "Test Connection" button. Keeps
   * the in-flight values out of the regular update path so a failed
   * test does not require the admin to re-enter the client secret.
   */
  async recordSsoConfigTestResult(
    provider: SsoProvider,
    result: "success" | "failure",
    errorMessage: string | null,
  ): Promise<void> {
    await this.getSsoConfig(provider); // ensures the row exists
    await db
      .update(ssoConfig)
      .set({
        lastTestedAt: new Date(),
        lastTestResult: result,
        lastTestError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(ssoConfig.id, SSO_PROVIDER_ROW_IDS[provider]));
  }

  /**
   * Fast-path lookup used by the OIDC callback to resolve a returning
   * SSO user. Backed by the partial index `users_sso_idx` on
   * `(sso_provider, sso_external_id)` WHERE `sso_external_id IS NOT
   * NULL`.
   */
  async findUserBySsoExternalId(
    provider: string,
    externalId: string,
  ): Promise<User | undefined> {
    const rows = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.ssoProvider, provider),
          eq(users.ssoExternalId, externalId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /**
   * Sets the SSO identity on an existing user. Used in two cases:
   *
   *   1. JIT create — the caller has just inserted a new `users` row
   *      and is now writing its identity columns. (Could also be done
   *      inline in the INSERT, but threading it through this helper
   *      keeps the post-callback flow uniform with the
   *      link-existing-user case below.)
   *
   *   2. Link existing password user — after the user confirms the
   *      link with their CriteriaIQ password (see the
   *      `link_password_required` step in the OIDC callback), we set
   *      the SSO fields on their existing row without touching
   *      `password`. They then have BOTH login paths available.
   *
   * The `ssoLastLoginAt` timestamp is updated by the caller via
   * `updateSsoUserLastLogin` so this method has a single
   * responsibility.
   */
  async linkUserToSso(
    userId: string,
    provider: string,
    externalId: string,
  ): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({
        ssoProvider: provider,
        ssoExternalId: externalId,
        ssoLastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated!;
  }

  /**
   * Clears the SSO identity on a user. Called when an admin clicks
   * "Unlink from Okta" in User Management. The admin route is
   * expected to also set `forcePasswordChange = true` so the user is
   * prompted to set a new password on next login (the existing
   * `forcePasswordChange` flow handles the actual prompt — see
   * `simpleAuth.ts`).
   */
  async unlinkUserFromSso(userId: string): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({
        ssoProvider: null,
        ssoExternalId: null,
        ssoLastLoginAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated!;
  }

  /**
   * Updates `ssoLastLoginAt` to now. Called once per successful Okta
   * login by the callback handler — distinct from the existing
   * `lastLogin` column (which is updated by
   * `recordSuccessfulLogin` and reflects ANY login path) so the
   * admin User Management UI can surface a separate "Last Okta
   * login" timestamp.
   */
  async updateSsoUserLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ ssoLastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Marks the "Link your account to Okta" soft-prompt banner as
   * dismissed. The banner re-surfaces only if SSO is enabled and
   * this column is null on the current user (see the soft-prompt
   * banner component on the landing page after login).
   */
  async dismissSsoLinkPrompt(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ ssoLinkPromptDismissedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Manually link an existing user to an Okta `sub` — used by the
   * "Link existing user to Okta" admin action. The admin types the
   * external ID directly; we verify nothing else is using it (the
   * `sso_external_id` column has no DB-level unique constraint in
   * v1 because the same `sub` value across different providers is
   * theoretically valid in a future multi-IdP world, but in
   * practice we treat it as unique within a provider).
   */
  async findUserBySsoExternalIdAnyProvider(
    externalId: string,
  ): Promise<User | undefined> {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.ssoExternalId, externalId))
      .limit(1);
    return rows[0];
  }
}
