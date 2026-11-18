import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  serial,
  boolean,
  integer,
  unique,
  check,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers";
import { projects } from "./projects";
import { activityLogs } from "./projects";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

/**
 * Singleton `app_state` row. The `id` column is constrained to the
 * literal value `1` so there is one and only one row in the table —
 * this avoids the "which row is the real one?" confusion that
 * unconstrained singleton patterns invite. The `setup_completed_at`
 * column is populated the first time the wizard's final step is
 * acknowledged via POST /api/setup/complete and is NEVER overwritten
 * on subsequent calls (the helper in `server/lib/app-state.ts`
 * implements that idempotency at the SQL layer with COALESCE).
 */
export const appState = pgTable("app_state", {
  id: integer("id").primaryKey().default(1).$type<1>(),
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const auditLogins = pgTable(
  "audit_logins",
  {
    id: serial("id").primaryKey(),
    // Soft ref to users.id (FK dropped in migration 036).
    userId: varchar("user_id").notNull(),
    userEmail: varchar("user_email").notNull(),
    userName: varchar("user_name").notNull(),
    loginTime: timestamp("login_time").defaultNow(),
    ipAddress: varchar("ip_address"),
    userAgent: varchar("user_agent"),
    sessionId: varchar("session_id"),
    loginMethod: varchar("login_method").default("email"),
    success: boolean("success").default(true),
    failureReason: varchar("failure_reason"),
    // Task #767: lets the same table carry non-login security
    // events. Defaults to 'login' so the four code paths that
    // currently insert into this table (recordSuccessfulLogin /
    // recordFailedLogin / passkey enrollment audit / MFA challenge
    // audit) keep writing the existing shape without touching
    // every call site. Reveal handlers in server/routes/system-routes.ts
    // and server/routes.ts write 'secret_reveal' explicitly.
    eventType: varchar("event_type").notNull().default("login"),
    // For 'secret_reveal' rows this stores the key that was
    // revealed (e.g. 'SESSION_SECRET', 'DATABASE_URL',
    // 'db-connection:42'). The value itself is NEVER stored —
    // that would defeat the entire point of the audit row.
    eventSubject: varchar("event_subject"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  // Backs:
  //   - the admin "recent logins" panel (`ORDER BY login_time DESC LIMIT N`,
  //     see storage.getAuditLogins / getAuditLoginsByDateRange)
  //   - the daily prune job in `server/services/audit-logins-cleanup.ts`
  //     (Task #746) that removes rows older than the retention window.
  //   - the Task #767 "filter by event type" admin UI in
  //     LoginAuditReport, which queries WHERE event_type = 'secret_reveal'
  //     to see only sensitive-value reveal events.
  // Without these indexes the queries degrade to a full table scan as
  // the table grows from brute-force `/api/login` traffic.
  (table) => [
    index("IDX_audit_logins_login_time").on(table.loginTime),
    index("IDX_audit_logins_event_type").on(table.eventType),
  ],
);

/**
 * Singleton metadata row for the daily audit_logins prune scheduler
 * (Task #757). Mirrors the `app_state` shape: `id integer PRIMARY KEY
 * CHECK (id = 1)` makes the table an enforced singleton so there is
 * one and only one row, which lets the persist step be a trivial
 * `ON CONFLICT (id) DO UPDATE`.
 *
 * Why this exists: the in-process snapshot exposed by
 * `getAuditLoginsCleanupStatus()` (in
 * `server/services/audit-logins-cleanup.ts`) used to live in
 * module-level memory only, so every restart reset it to "Awaiting
 * first run" until the next scheduled tick fired — and replica A's
 * prune was invisible to replica B's status panel. Persisting the
 * `last_run_at` timestamp + `last_removed` row count to this table
 * makes the values survive process restarts and consistent across
 * replicas.
 *
 * The scheduler updates this row at the end of every SUCCESSFUL
 * tick. Failed ticks intentionally do not touch the row — the
 * Task #751 admin "Login history cleanup" panel renders "last
 * successful prune", not "last attempted prune" (the failure already
 * shows up in the application log via `[Audit Logins Cleanup] Prune
 * failed`).
 *
 * The migration that installs this table is
 * `049_audit_logins_cleanup_state.sql`.
 */
export const auditLoginsCleanupState = pgTable(
  "audit_logins_cleanup_state",
  {
    id: integer("id").primaryKey().default(1).$type<1>(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRemoved: integer("last_removed"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Mirror the `CHECK ("id" = 1)` constraint installed by migration
    // `049_audit_logins_cleanup_state.sql` so `drizzle-kit push` does
    // not race the migration runner to a different table shape on a
    // fresh DB. Without this, the runner installs the CHECK and
    // `db:push` on a clean install would not — leaving schema and
    // migration paths inconsistent.
    check("audit_logins_cleanup_state_singleton", sql`${table.id} = 1`),
  ],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  // The `.unique()` modifier here creates a *case-sensitive* btree
  // unique constraint (`users_email_unique`). It is intentionally
  // preserved alongside the case-insensitive functional unique index
  // declared at the table level below — case-sensitive uniqueness is
  // a strict subset of case-insensitive uniqueness, so the two
  // co-exist without conflict and removing it would just cause the
  // next `db:push` to add it back.
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  accountId: integer("account_id").references(() => customers.id),
  allAccountsAccess: boolean("all_accounts_access").default(false),
  title: varchar("title"),
  region: varchar("region"),
  role: varchar("role").default("se"),
  department: varchar("department"),
  stakeholderTypes: text("stakeholder_types").array(),
  specialties: text("specialties").array(),
  resetToken: varchar("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  isApproved: boolean("is_approved").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  isActive: boolean("is_active").default(true),
  timezone: varchar("timezone").default("America/New_York"),
  preferredLocale: varchar("preferred_locale").default("en-US"),
  theme: varchar("theme").default("light"),
  sidebarCollapsed: boolean("sidebar_collapsed").default(false),
  loginCount: integer("login_count").default(0),
  lastLogin: timestamp("last_login"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  receiveEmails: boolean("receive_emails").default(true),
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaMethod: varchar("mfa_method"),
  totpSecretEnc: text("totp_secret_enc"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  mfaEnrolledAt: timestamp("mfa_enrolled_at"),
  securitySetupRequired: boolean("security_setup_required").default(false),
  managerId: varchar("manager_id"),
  isProtected: boolean("is_protected").default(false),
  // Legacy Salesforce token columns. Since migration 083 the tokens live in
  // `user_integrations` and nothing reads these; migration 094 emptied them
  // and disconnect still clears them. The columns stay because migration 083
  // reads them, and a fresh install runs every migration after drizzle push.
  sfAccessToken: text("sf_access_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  sfRefreshToken: text("sf_refresh_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  sfInstanceUrl: text("sf_instance_url"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  sfConnectedAt: timestamp("sf_connected_at"),
  skipWelcomeEmail: boolean("skip_welcome_email").default(false),
  forcePasswordChange: boolean("force_password_change").default(false),
  passwordHistory: text("password_history")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  showFlightDeck: boolean("show_flight_deck").default(true),
  flightDeckLastShownAt: timestamp("flight_deck_last_shown_at"),
  // Task #723 — Demo Mode. When true, every authenticated request from
  // this user resolves to demo context regardless of their session
  // toggle. Independent of the per-session flag (cookie/session) and
  // the app-wide setting (`system_settings.demo_mode_app_wide`); the
  // resolver in `server/lib/demo-mode.ts` ORs the three sources.
  demoModeForcedOn: boolean("demo_mode_forced_on").default(false).notNull(),
  lastAccessedProjectId: integer("last_accessed_project_id").references(
    (): AnyPgColumn => projects.id,
  ),
  // Per-admin marker for the migration-035 duplicate-cleanup notice.
  // Set when an admin dismisses the banner; the notice re-surfaces
  // if a future dedup run produces a loser with a newer updated_at.
  dupCleanupNoticeDismissedAt: timestamp("dup_cleanup_notice_dismissed_at"),
  // OIDC SSO fields. Set when a user logs in via the SSO config row
  // (see `ssoConfig`). `ssoExternalId` stores the IdP's durable `sub`
  // claim — NEVER the email, because email is mutable on the IdP side
  // and using it as the join key opens an account-takeover path when
  // an Okta admin reassigns an address. Lookup goes through the
  // partial index `users_sso_idx` (provider, externalId) added in the
  // migration that installs these columns.
  ssoProvider: varchar("sso_provider"),
  ssoExternalId: varchar("sso_external_id"),
  ssoLastLoginAt: timestamp("sso_last_login_at"),
  // Set when a password user dismisses the "Link your account to
  // Okta" banner. The banner re-surfaces only if SSO is enabled and
  // this is null. Lets the migration-day soft-prompt land without
  // blocking existing users.
  ssoLinkPromptDismissedAt: timestamp("sso_link_prompt_dismissed_at"),
  // Per-user sign-in policy (migration 075). One of
  // `ALLOWED_LOGIN_METHODS`. Enforced server-side in `/api/login`
  // (rejects `okta_only`) and the OIDC callback + link-confirm
  // (reject `password_only`). Admin-only write via the user CRUD
  // routes; never self-editable. Default keeps today's behavior.
  allowedLoginMethods: varchar("allowed_login_methods")
    .notNull()
    .default("okta_password"),
  // Account Users imported from a CRM contact (migration 124,
  // server/crm/account-contacts.ts). Null on users added in CriteriaIQ.
  // Name and title follow the contact one way; the email is the login, so a
  // CRM change is only recorded in crmEmail for an Admin to accept, and a
  // contact gone from the CRM account is flagged, never deactivated.
  // archived_users mirrors them; restoring clears them (added here again).
  crmProvider: varchar("crm_provider", { length: 32 }),
  crmContactId: varchar("crm_contact_id", { length: 64 }),
  crmSyncedAt: timestamp("crm_synced_at"),
  crmEmail: varchar("crm_email"),
  crmContactMissingAt: timestamp("crm_contact_missing_at"),
}, (table) => [
  // Case-insensitive uniqueness on email (Task #538). Mirrors the
  // `users_email_lower_unique` UNIQUE functional index created by
  // `migrations/035_users_email_case_insensitive_unique.sql`. Declaring
  // it here ensures `drizzle-kit push` (the wizard's first-run step
  // and the post-merge sync) does not drop the constraint on its next
  // run. The index name is shared between the migration and this
  // declaration so drizzle-kit recognises the existing object instead
  // of creating a duplicate. The case-insensitive lookup in
  // `storage.getUserByEmail` (`LOWER(email) = LOWER($1)`) stays
  // index-backed via this same index.
  uniqueIndex("users_email_lower_unique").on(sql`LOWER(${table.email})`),
  // One CriteriaIQ user per CRM contact.
  uniqueIndex("users_crm_contact_unique")
    .on(table.crmProvider, table.crmContactId)
    .where(sql`${table.crmContactId} IS NOT NULL`),
  // Partial index used by the OIDC callback's `findUserBySsoExternalId`
  // fast path (see `server/storage/sso.ts`). Restricted to rows where
  // `sso_external_id IS NOT NULL` so the index does not bloat with
  // NULL entries from all the password-only users.
  index("users_sso_idx")
    .on(table.ssoProvider, table.ssoExternalId)
    .where(sql`${table.ssoExternalId} IS NOT NULL`),
]);

export const userAccounts = pgTable(
  "user_accounts",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: integer("account_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
    createdBy: varchar("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_user_accounts_user").on(table.userId),
    index("idx_user_accounts_account").on(table.accountId),
    unique("unique_user_account").on(table.userId, table.accountId),
  ],
);

export const userAccountsRelations = relations(userAccounts, ({ one }) => ({
  user: one(users, {
    fields: [userAccounts.userId],
    references: [users.id],
  }),
  account: one(customers, {
    fields: [userAccounts.accountId],
    references: [customers.id],
  }),
}));

/**
 * Per-user sign-in tokens for external systems, one row per user per
 * provider: `salesforce` (CRM sign-in) and `microsoft` (Outlook calendar,
 * migration 102). A new provider adds rows with its own `provider` value
 * instead of new columns on `users`. Keeping tokens off `users` also keeps them out of every
 * `SELECT * FROM users` and out of the archived_users copy.
 *
 * Rows are deleted with the user (archiving a user deletes the row, so a
 * restored user reconnects). Salesforce rows are read and written only
 * through server/salesforce/salesforce-config-service.ts, Microsoft rows
 * only through server/outlook/.
 */
export const USER_INTEGRATION_PROVIDERS = ["salesforce", "microsoft"] as const;
export type UserIntegrationProvider = (typeof USER_INTEGRATION_PROVIDERS)[number];

export const userIntegrations = pgTable(
  "user_integrations",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider").notNull(),
    accessToken: text("access_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    refreshToken: text("refresh_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    instanceUrl: text("instance_url"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    // When the stored access token stops working (Microsoft rows; refreshed
    // a minute early). Null for Salesforce, which refreshes on a 401.
    expiresAt: timestamp("expires_at"),
    // The mailbox the token belongs to (Microsoft rows), for "Connected as".
    accountLabel: varchar("account_label", { length: 320 }),
    connectedAt: timestamp("connected_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("unique_user_integration").on(table.userId, table.provider),
    index("idx_user_integrations_provider").on(table.provider),
  ],
);

export type UserIntegration = typeof userIntegrations.$inferSelect;

export const userSessions = pgTable(
  "user_sessions",
  {
    id: varchar("id")
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id").notNull().unique(),
    deviceName: varchar("device_name"),
    browser: varchar("browser"),
    os: varchar("os"),
    ipAddress: varchar("ip_address"),
    userAgent: text("user_agent"),
    lastActive: timestamp("last_active").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_user_sessions_user").on(table.userId),
    index("idx_user_sessions_session_id").on(table.sessionId),
  ],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: varchar("id")
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_mfa_recovery_codes_user").on(table.userId)],
);

export const trustedDevices = pgTable("trusted_devices", {
  id: varchar("id")
    .primaryKey()
    .notNull()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: varchar("id")
    .primaryKey()
    .notNull()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports"),
  deviceName: text("device_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Persistent rate-limit buckets used by `/api/login`, `/api/mfa/challenge`,
 * and `/api/mfa/totp/verify`. Each row tracks the failure streak for one
 * bucket key (e.g. `mfa_challenge:<userId>`, `login:email:<email>`,
 * `login:ip:<ip>`). Centralising the buckets in Postgres means:
 *
 *   1. A rolling restart no longer wipes every locked-out attacker's
 *      budget — the row survives and the next process picks the bucket
 *      back up where it left off.
 *   2. A multi-worker deployment shares the budget across workers, so an
 *      attacker can't pivot from a closed bucket on worker A to an empty
 *      bucket on worker B for another N attempts.
 *
 * Task #630. The previous implementation kept this state in a process-local
 * `Map<string, { failedCount, resetTime }>` inside `server/auth/mfaUtils.ts`,
 * which silently broke both invariants above. The same module retains an
 * in-memory fallback used only when the DB is unreachable (setup wizard,
 * tests, transient DB hiccups) so the failure mode is "fall back to the
 * old behaviour" rather than "open the gate".
 */
export const authRateLimits = pgTable("auth_rate_limits", {
  bucketKey: varchar("bucket_key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  // Index supports the periodic cleanup query that purges expired rows
  // so the table doesn't grow unbounded — the auth path itself looks
  // rows up by primary key, so it doesn't need this index.
  index("idx_auth_rate_limits_reset_at").on(table.resetAt),
]);

export type AuthRateLimit = typeof authRateLimits.$inferSelect;
export type InsertAuthRateLimit = typeof authRateLimits.$inferInsert;

export const mfaEvents = pgTable(
  "mfa_events",
  {
    id: varchar("id")
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: varchar("event_type").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_mfa_events_user").on(table.userId),
    index("idx_mfa_events_type").on(table.eventType),
  ],
);

/**
 * Sign-in providers for OIDC Single Sign-On. Each has exactly one
 * `sso_config` row with a fixed id (see `SSO_PROVIDER_ROW_IDS`).
 */
export const SSO_PROVIDERS = ["okta", "azure"] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];
export const SSO_PROVIDER_ROW_IDS: Record<SsoProvider, number> = { okta: 1, azure: 2 };

export function isSsoProvider(value: unknown): value is SsoProvider {
  return typeof value === "string" && (SSO_PROVIDERS as readonly string[]).includes(value);
}

/**
 * OIDC Single Sign-On configuration — one row per provider.
 *
 * Okta SSO is row id 1 and Azure SSO (Microsoft Entra ID) is row id 2,
 * mirrored on the SQL side by the `sso_config_provider_row` CHECK from
 * migration 078 (which replaced the v1 `id = 1` singleton CHECK from
 * migration 071), so the "which row is the real one?" question cannot
 * arise.
 *
 * The OIDC client (`server/auth/oidcAuth.ts`) reads the row for the
 * provider being used, caches the discovered `openid-client`
 * Configuration per provider, and drives `/api/auth/sso/login` +
 * `/api/auth/sso/callback` (Okta) and `/api/auth/sso/azure/login` +
 * `/api/auth/sso/azure/callback` (Azure). When a provider's `enabled`
 * is false its routes redirect to the SSO error page and the landing
 * page hides its button.
 *
 * Provider fields (ImpactIQ's Integrations fields):
 *   Okta  — `issuerUrl` holds the Okta domain (or a full custom
 *           authorization-server issuer URL), plus client id/secret.
 *   Azure — `tenantId` holds the directory (tenant) id or a verified
 *           domain; the issuer is derived from it. Multi-tenant
 *           endpoints (common / organizations / consumers) are refused.
 *   Both  — optional `redirectUri` override (NULL derives it from
 *           `PUBLIC_APP_URL` at request time, so a DB snapshot restores
 *           to dev/staging/prod without surgery) and `allowJit`.
 *
 * `clientSecretEnc` is AES-256-GCM encrypted via the existing
 * `encryptText` / `decryptText` helpers in `server/auth/mfaUtils.ts`
 * — the same `ENCRYPTION_KEY` that wraps `totp_secret_enc` and the
 * Salesforce OAuth tokens. The plaintext value never leaves the
 * server: the admin UI receives `***masked***` on read and only sends
 * a real value when the admin types a new secret.
 *
 * `roleMapping` is JSONB shaped as `{ "<IdP group>": "<CriteriaIQ
 * role>" }` (Okta group names; Entra group object ids). On every SSO
 * login the callback intersects the groups claim from the id_token
 * with this map and picks the highest-precedence role from a fixed list
 * (`Admin > Manager > Engineer > CX > Sales > Support`). Unmapped users
 * fall through to `defaultRoleForUnmapped` (admin-set, defaults to
 * `Engineer`, never `Admin`).
 *
 * `allowJit` ON: a first-time SSO user whose email domain is on the
 * allowed-domains list is created (pending approval unless the domain
 * auto-approves). OFF: the user must already exist in CriteriaIQ.
 *
 * `requireMfaTrust` ON: skip CriteriaIQ's TOTP/WebAuthn challenge if
 * the id_token's ACR/AMR claim asserts MFA. OFF: always run the
 * CriteriaIQ MFA gate on top of the IdP. Default ON — IdP MFA is the
 * standard pattern and avoids two-factor fatigue.
 *
 * `syncRoleOnEveryLogin` OFF (default): role is set on JIT create and
 * never auto-updated. ON: every SSO login re-applies the group-mapped
 * role. OFF is safer — it prevents an IdP admin from silently
 * elevating someone to `Admin` by changing group membership.
 *
 * `teamMapping` is the Group → Team table (migration 112). Every SSO
 * sign-in puts the person on the teams and subteams their groups map to
 * and takes them off SSO-added ones their groups no longer map to; teams
 * an admin added by hand are never removed. Teams never grant access.
 */
export const ssoConfig = pgTable(
  "sso_config",
  {
    id: integer("id").primaryKey().default(1),
    // "okta" (id 1) or "azure" (id 2) — see SSO_PROVIDERS.
    provider: varchar("provider").notNull().default("okta"),
    enabled: boolean("enabled").notNull().default(false),
    // Okta: the Okta domain or full issuer URL. Unused for Azure.
    issuerUrl: varchar("issuer_url"),
    // Azure: directory (tenant) id or verified domain. Unused for Okta.
    tenantId: varchar("tenant_id"),
    clientId: varchar("client_id"),
    clientSecretEnc: text("client_secret_enc"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    // NULL = derive from PUBLIC_APP_URL + the provider's callback path.
    redirectUri: varchar("redirect_uri"),
    allowJit: boolean("allow_jit").notNull().default(true),
    scopes: varchar("scopes").notNull().default("openid profile email groups"),
    groupClaimName: varchar("group_claim_name").notNull().default("groups"),
    // JSONB: { "CriteriaIQ-Admins": "Admin", "CriteriaIQ-Engineers": "Engineer", ... }
    roleMapping: jsonb("role_mapping").notNull().default(sql`'{}'::jsonb`),
    defaultRoleForUnmapped: varchar("default_role_for_unmapped").notNull().default("Engineer"),
    // JSONB: [{ "group": "SE-EMEA", "teamId": 3, "subteamId": 7 }, ...]
    // Sign-in puts people on the mapped teams (migration 112).
    teamMapping: jsonb("team_mapping").notNull().default(sql`'[]'::jsonb`),
    requireMfaTrust: boolean("require_mfa_trust").notNull().default(true),
    syncRoleOnEveryLogin: boolean("sync_role_on_every_login").notNull().default(false),
    // When true, /api/auth/sso/logout also returns the IdP's
    // end_session_endpoint. Default OFF — RP-initiated logout adds a
    // redirect users don't always expect.
    rpInitiatedLogout: boolean("rp_initiated_logout").notNull().default(false),
    lastTestedAt: timestamp("last_tested_at"),
    lastTestResult: varchar("last_test_result"),
    lastTestError: text("last_test_error"),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    // Mirror the CHECK constraint installed by migration 078 so
    // `drizzle-kit push` against a fresh DB does not race the runner
    // to a different table shape.
    check(
      "sso_config_provider_row",
      sql`(${table.id} = 1 AND ${table.provider} = 'okta') OR (${table.id} = 2 AND ${table.provider} = 'azure')`,
    ),
  ],
);

export const insertSsoConfigSchema = createInsertSchema(ssoConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SsoConfig = typeof ssoConfig.$inferSelect;
export type InsertSsoConfig = z.infer<typeof insertSsoConfigSchema>;

/**
 * Outlook sign-in (migration 102): the Microsoft Entra app each person signs
 * in through on Profile Settings › Integrations to link their own Outlook
 * calendar, as in ImpactIQ's My Settings. One row, id 1. Delegated
 * permissions only (User.Read, Calendars.Read, and MailboxSettings.Read when
 * read_working_hours is on); the tokens live in
 * user_integrations with provider "microsoft". Separate from the Email
 * configuration's Graph app, which sends as one shared mailbox.
 */
export const outlookSigninConfig = pgTable(
  "outlook_signin_config",
  {
    id: integer("id").primaryKey().default(1),
    enabled: boolean("enabled").notNull().default(true),
    // Directory (tenant) id or verified domain; "organizations" for any work account.
    tenantId: varchar("tenant_id", { length: 100 }).notNull(),
    clientId: varchar("client_id", { length: 64 }).notNull(),
    clientSecret: text("client_secret").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    // Also ask for MailboxSettings.Read at sign-in, so each person's Outlook
    // working days can set their work week (migration 108).
    readWorkingHours: boolean("read_working_hours").notNull().default(false),
    // Also ask for Calendars.ReadWrite, so each person's MAP due dates are
    // added to their Outlook as all-day Free events (migration 111).
    writeMapDueDates: boolean("write_map_due_dates").notNull().default(false),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [check("outlook_signin_config_single_row", sql`${table.id} = 1`)],
);

export type OutlookSigninConfigRow = typeof outlookSigninConfig.$inferSelect;

export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .references(() => users.id)
    .notNull(),
  section: varchar("section").notNull(),
  permission: varchar("permission").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name").unique().notNull(),
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  color: varchar("color").notNull().default("#64748b"),
  icon: varchar("icon"),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id")
    .references(() => roles.id)
    .notNull(),
  section: varchar("section").notNull(),
  permission: varchar("permission").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Teams (Admin › Team & People › Teams), modeled on ImpactIQ's Teams but
// used only to organize and filter people: a team never changes what anyone
// can see or do, and each person keeps one role. A person can be on several
// teams; one membership can be marked as their default. Subteams nest up to
// four levels inside a team (shared/teams.ts). Outside users (Customer,
// Guest, Partner) never join a team. Added in migration 104.
export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    // Stable key for other apps (ImpactIQ teams are matched by slug).
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    description: text("description"),
    icon: varchar("icon", { length: 60 }),
    managerUserId: varchar("manager_user_id").references(() => users.id, { onDelete: "set null" }),
    // Up to 5 Salesforce User.Department values or HubSpot team ids; the
    // CRM sync puts matching people on the team (migration 113).
    crmDepartments: text("crm_departments").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    // Demo Mode team (migration 115). Subteams and members cascade with it.
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("teams_name_lower_unique").on(sql`LOWER(${table.name})`),
    index("idx_teams_is_demo").on(table.isDemo),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The person's default team; at most one per person.
    isDefault: boolean("is_default").notNull().default(false),
    // manual | sso | crm (migration 112). A sync only changes its own rows.
    source: varchar("source", { length: 10 }).notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index("idx_team_members_user").on(table.userId),
    uniqueIndex("team_members_one_default").on(table.userId).where(sql`${table.isDefault}`),
  ],
);

export const subteams = pgTable(
  "subteams",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Null = top level. Always a subteam of the same team.
    parentSubteamId: integer("parent_subteam_id").references((): AnyPgColumn => subteams.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    // region | type | product | other, or null.
    kind: varchar("kind", { length: 20 }),
    // Salesforce departments or HubSpot team ids the CRM sync matches (migration 116).
    crmDepartments: text("crm_departments").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_subteams_team").on(table.teamId)],
);

export const subteamMembers = pgTable(
  "subteam_members",
  {
    subteamId: integer("subteam_id")
      .notNull()
      .references(() => subteams.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // leader | member
    role: varchar("role", { length: 10 }).notNull().default("member"),
    // manual | sso | crm (migration 112). A sync only changes its own rows.
    source: varchar("source", { length: 10 }).notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.subteamId, table.userId] }), index("idx_subteam_members_user").on(table.userId)],
);

export type TeamRow = typeof teams.$inferSelect;
export type TeamMemberRow = typeof teamMembers.$inferSelect;
export type SubteamRow = typeof subteams.$inferSelect;
export type SubteamMemberRow = typeof subteamMembers.$inferSelect;

export const usersRelations = relations(users, ({ one, many }) => ({
  account: one(customers, {
    fields: [users.accountId],
    references: [customers.id],
  }),
  primaryEngineerProjects: many(projects, { relationName: "primaryEngineer" }),
  customerProjects: many(projects, { relationName: "customerUser" }),
  activityLogs: many(activityLogs),
}));

// Values for `users.allowed_login_methods`. Shared by the server
// enforcement points and the admin user dialog.
export const ALLOWED_LOGIN_METHODS = ["okta_only", "okta_password", "password_only"] as const;
export type AllowedLoginMethod = (typeof ALLOWED_LOGIN_METHODS)[number];
export const DEFAULT_ALLOWED_LOGIN_METHOD: AllowedLoginMethod = "okta_password";
export function isAllowedLoginMethod(value: unknown): value is AllowedLoginMethod {
  return typeof value === "string" && (ALLOWED_LOGIN_METHODS as readonly string[]).includes(value);
}

export const insertUserSchema = createInsertSchema(users)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    resetToken: true,
    resetTokenExpiry: true,
  })
  .extend({
    stakeholderTypes: z.array(z.string()).optional(),
    specialties: z.array(z.string()).optional(),
    password: z.string().optional(),
    receiveEmails: z.boolean().optional(),
  });

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

export const insertAuditLoginSchema = createInsertSchema(auditLogins).omit({
  id: true,
  createdAt: true,
  loginTime: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRolePermissionSchema = createInsertSchema(
  rolePermissions,
).omit({ id: true, createdAt: true, updatedAt: true });

export type AuditLogin = typeof auditLogins.$inferSelect;
export type InsertAuditLogin = z.infer<typeof insertAuditLoginSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;

export type InsertUserPermission = typeof userPermissions.$inferInsert;
export type UserPermission = typeof userPermissions.$inferSelect;

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
