import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer,
  smallint,
  uniqueIndex,
  check,
  bigint,
  date,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { LOGO_VARIANTS, THEME_COLOR_KEYS, isHexColor, withThemeDefaults } from "../theme-colors";

export const statusConfigs = pgTable("status_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  color: varchar("color").notNull(),
  icon: varchar("icon"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const riskLevelConfigs = pgTable("risk_level_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  color: varchar("color").notNull(),
  icon: varchar("icon"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const rankingConfigs = pgTable("ranking_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  color: varchar("color").notNull(),
  icon: varchar("icon"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const industries = pgTable("industries", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().unique(),
  description: text("description"),
  icon: varchar("icon"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customerStatusConfigs = pgTable("customer_status_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  color: varchar("color").notNull(),
  icon: varchar("icon"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systemSettings = pgTable(
  "system_settings",
  {
    id: serial("id").primaryKey(),
    key: varchar("key").notNull().unique(),
    value: jsonb("value").notNull(),
    description: text("description"),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_system_settings_key").on(table.key)],
);

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updater: one(users, {
    fields: [systemSettings.updatedBy],
    references: [users.id],
  }),
}));

export const insertStatusConfigSchema = createInsertSchema(statusConfigs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
  });

export const insertRiskLevelConfigSchema = createInsertSchema(riskLevelConfigs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
  });

export const insertRankingConfigSchema = createInsertSchema(rankingConfigs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
  });

export const insertIndustrySchema = createInsertSchema(industries)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
  });

export const insertCustomerStatusConfigSchema = createInsertSchema(
  customerStatusConfigs,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
  });

export const fiscalConfigSchema = z.object({
  displayMode: z.enum(["fiscal", "calendar"]).default("calendar"),
  fiscalYearStartMonth: z.number().min(1).max(12).default(1),
  yearNamingOffset: z.number().min(-1).max(1).default(0),
});

export const insertSystemSettingSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  description: z.string().optional(),
});

export type InsertStatusConfig = typeof statusConfigs.$inferInsert;
export type StatusConfig = typeof statusConfigs.$inferSelect;

export type InsertRiskLevelConfig = typeof riskLevelConfigs.$inferInsert;
export type RiskLevelConfig = typeof riskLevelConfigs.$inferSelect;

export type InsertRankingConfig = typeof rankingConfigs.$inferInsert;
export type RankingConfig = typeof rankingConfigs.$inferSelect;

export type InsertIndustry = z.infer<typeof insertIndustrySchema>;
export type Industry = typeof industries.$inferSelect;

export type InsertCustomerStatusConfig = z.infer<
  typeof insertCustomerStatusConfigSchema
>;
export type CustomerStatusConfig = typeof customerStatusConfigs.$inferSelect;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
export type FiscalConfig = z.infer<typeof fiscalConfigSchema>;

// ─── Storage Configuration ────────────────────────────────────────────────────

export const storageConfiguration = pgTable("storage_configuration", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(true),
  provider: varchar("provider").notNull().default("local"),
  // Singleton guard — only one row is allowed; enforced by unique index + check below
  singletonKey: boolean("singleton_key").notNull().default(true),
  // GCS fields
  gcsBucketName: text("gcs_bucket_name"),
  gcsKeyJson: text("gcs_key_json"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  // AWS S3 fields
  awsRegion: text("aws_region"),
  awsBucketName: text("aws_bucket_name"),
  awsAccessKeyId: text("aws_access_key_id"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  awsSecretAccessKey: text("aws_secret_access_key"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  // Azure Blob fields
  azureAccountName: text("azure_account_name"),
  azureAccountKey: text("azure_account_key"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  azureContainerName: text("azure_container_name"),
  azureSasToken: text("azure_sas_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("storage_configuration_singleton").on(table.singletonKey),
  check("storage_configuration_singleton_true", drizzleSql`${table.singletonKey} = true`),
]);

export const storageConfigurationRelations = relations(storageConfiguration, ({ one }) => ({
  createdBy: one(users, {
    fields: [storageConfiguration.createdBy],
    references: [users.id],
  }),
  updatedBy: one(users, {
    fields: [storageConfiguration.updatedBy],
    references: [users.id],
  }),
}));

export type StorageConfiguration = typeof storageConfiguration.$inferSelect;
export type InsertStorageConfiguration = typeof storageConfiguration.$inferInsert;

// ─── Branding Assets (admin-customizable logos + backgrounds) ─────────────────

// `company_logo` is the customer's logo at the right end of the header bar.
// It replaced the three sidebar slots (expanded/collapsed logo and the logo
// background) once the CriteriaIQ logo moved to the top of the sidebar;
// migration 076 carried their uploads over.
export const BRANDING_ASSET_SLOTS = [
  "login_logo",
  "login_bg",
  "company_logo",
  "page_bg",
] as const;

export const BRANDING_BACKGROUND_SLOTS = [
  "login_bg",
  "page_bg",
] as const;

export const BRANDING_ASSET_MODES = ["light", "dark"] as const;

export type BrandingAssetSlot = (typeof BRANDING_ASSET_SLOTS)[number];
export type BrandingAssetMode = (typeof BRANDING_ASSET_MODES)[number];

export const brandingAssets = pgTable(
  "branding_assets",
  {
    id: serial("id").primaryKey(),
    slot: varchar("slot", { length: 64 }).notNull(),
    mode: varchar("mode", { length: 8 }).notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    mime: varchar("mime", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    opacity: smallint("opacity"),
    uploadedBy: varchar("uploaded_by").references(() => users.id),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("branding_assets_slot_mode_unique").on(table.slot, table.mode),
  ],
);

export const brandingAssetsRelations = relations(brandingAssets, ({ one }) => ({
  uploader: one(users, {
    fields: [brandingAssets.uploadedBy],
    references: [users.id],
  }),
}));

export const insertBrandingAssetSchema = createInsertSchema(brandingAssets)
  .omit({ id: true, uploadedAt: true })
  .extend({
    slot: z.enum(BRANDING_ASSET_SLOTS),
    mode: z.enum(BRANDING_ASSET_MODES),
    opacity: z.number().int().min(0).max(100).nullable().optional(),
  });

export const updateBrandingAssetOpacitySchema = z.object({
  opacity: z.number().int().min(0).max(100),
});

export const brandingTaglineSchema = z.object({
  text: z.string().min(1).max(500).nullable(),
});

// Admin override for the URL the sidebar logo links to. Stored in
// system_settings under `branding.sidebar_logo_url`. Validated as a
// real URL (http/https only) — the value is rendered into an
// <a href={url}> on every authenticated page, so we don't want to
// accept anything that could become a javascript:/data: URI XSS
// vector. Null clears the override and the sidebar logo renders
// without a link wrapper.
export const brandingSidebarLogoUrlSchema = z.object({
  url: z.string()
    .url()
    .refine(
      (v) => /^https?:\/\//i.test(v),
      { message: "URL must start with http:// or https://" },
    )
    .max(2000)
    .nullable(),
});

// Admin-configured support contact email, shown on the error page and the
// About page "contact" links and used as the {{supportEmail}} sample in email
// previews. Stored in system_settings under `branding.support_email`. It is
// rendered into a mailto: link, so it is validated as a real email address.
// Null clears it and the contact links are hidden.
export const brandingSupportEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254).nullable(),
});

export type BrandingAsset = typeof brandingAssets.$inferSelect;
export type InsertBrandingAsset = z.infer<typeof insertBrandingAssetSchema>;

// ─── App Themes (Admin › Appearance › Theming) ────────────────────────────────
//
// Saved color themes for the app chrome (header, sidebar, Admin menu, Primary).
// At most one row is active (enforced by the partial unique index); with none
// active the app shows CriteriaIQ Classic. `colors` holds the light/dark hex
// pairs listed in shared/theme-colors.ts.

export const appThemes = pgTable(
  "app_themes",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    colors: jsonb("colors").notNull(),
    // CriteriaIQ logo version per mode ("dark_text" | "light_text");
    // null follows the Media setting.
    logoVariantLight: varchar("logo_variant_light", { length: 20 }),
    logoVariantDark: varchar("logo_variant_dark", { length: 20 }),
    isActive: boolean("is_active").notNull().default(false),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("app_themes_single_active").on(table.isActive).where(drizzleSql`${table.isActive}`),
  ],
);

const themeColorsSchema = z
  .record(z.string(), z.string())
  .refine((colors) => THEME_COLOR_KEYS.every((key) => isHexColor(colors[key])), {
    message: "Every theme color must be a hex color such as #2D6EE6",
  })
  .transform((colors) => withThemeDefaults(colors));

export const insertAppThemeSchema = z.object({
  name: z.string().trim().min(1, "A theme name is required").max(200),
  colors: themeColorsSchema,
  logoVariantLight: z.enum(LOGO_VARIANTS).nullable().optional(),
  logoVariantDark: z.enum(LOGO_VARIANTS).nullable().optional(),
});

// Admin › Appearance › Media: which CriteriaIQ logo version each mode shows.
// Stored in system_settings under `branding.logo_variants`.
export const brandingLogoVariantsSchema = z.object({
  light: z.enum(LOGO_VARIANTS),
  dark: z.enum(LOGO_VARIANTS),
});

export const updateAppThemeSchema = insertAppThemeSchema.partial();

export type AppTheme = typeof appThemes.$inferSelect;
export type InsertAppTheme = z.infer<typeof insertAppThemeSchema>;
export type UpdateAppTheme = z.infer<typeof updateAppThemeSchema>;

// ── Scheduler (Configuration › Scheduler) ────────────────────────────────
// Every recurring background job registers with server/services/jobs/
// scheduler.ts. `job_config` holds the admin's overrides per job (one row
// per job key, created on first edit; no row means the job's defaults).
// `job_runs` is the run history: a row is written only when a run did
// work or failed, never for a quiet tick, so fast jobs don't flood it.
export const JOB_RUN_STATUSES = ["success", "error"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];
// "event": one occurrence of an event job, e.g. a Welcome email on a registration.
export const JOB_RUN_SOURCES = ["scheduled", "manual", "event"] as const;
export type JobRunSource = (typeof JOB_RUN_SOURCES)[number];

export const jobConfig = pgTable("job_config", {
  jobKey: varchar("job_key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  // Null = the job's default cadence. bigint: a 30-day interval in ms
  // does not fit in a 32-bit integer.
  intervalMs: bigint("interval_ms", { mode: "number" }),
  notifyOnError: boolean("notify_on_error").notNull().default(false),
  lastErrorEmailAt: timestamp("last_error_email_at"),
  // Clock-time jobs (e.g. the nightly Salesforce link check). Null = default.
  scheduleHour: smallint("schedule_hour"),
  scheduleMinute: smallint("schedule_minute"),
  timezone: varchar("timezone"),
  // Last clock-time slot a server copy claimed, so with several copies a
  // daily or cron job runs once per slot (migration 085).
  lastSlotAt: timestamp("last_slot_at"),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    jobKey: varchar("job_key").notNull(),
    status: varchar("status").notNull().$type<JobRunStatus>(),
    source: varchar("source").notNull().default("scheduled").$type<JobRunSource>(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    itemsProcessed: integer("items_processed"),
    message: text("message"),
    triggeredBy: varchar("triggered_by"),
  },
  (table) => [
    index("idx_job_runs_job_key_started").on(table.jobKey, table.startedAt),
    index("idx_job_runs_started").on(table.startedAt),
  ],
);

export type JobConfig = typeof jobConfig.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = typeof jobRuns.$inferInsert;

// Holiday calendars (Admin › System Settings › Calendar), ported from
// ImpactIQ. A calendar is either a country's public holidays, downloaded from
// date.nager.at (code = ISO country code, e.g. "US"), or a custom list of
// company closures (any other code). A user's holidays come from the
// calendars assigned to them, else the organization defaults. Added in
// migration 101.
export const holidayCalendars = pgTable("holiday_calendars", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  // Applies to every user who has no calendars of their own.
  isDefault: boolean("is_default").notNull().default(false),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const holidayDates = pgTable(
  "holiday_dates",
  {
    id: serial("id").primaryKey(),
    calendarId: integer("calendar_id")
      .notNull()
      .references(() => holidayCalendars.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
  },
  (table) => [unique("holiday_dates_calendar_date_unique").on(table.calendarId, table.date)],
);

export const userHolidayCalendars = pgTable(
  "user_holiday_calendars",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarId: integer("calendar_id")
      .notNull()
      .references(() => holidayCalendars.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.calendarId] })],
);

export type HolidayCalendarRow = typeof holidayCalendars.$inferSelect;
export type HolidayDateRow = typeof holidayDates.$inferSelect;

// A person's work week and time off (Profile Settings › Calendar), counted as
// days off by MAP scheduling alongside their holidays. See
// docs/features/working-calendar.md. Added in migration 107.
//
// No row = Monday to Friday. `source` says who set it: "manual" (the person
// or an admin) or "outlook" (read from their Outlook working hours).
export const userWorkSchedules = pgTable(
  "user_work_schedules",
  {
    userId: varchar("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // Day-of-week numbers that are working days, 0 = Sunday.
    workDays: smallint("work_days").array().notNull(),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [check("user_work_schedules_source_check", drizzleSql`${table.source} IN ('manual', 'outlook')`)],
);

// Days a person is away, inclusive. "manual" rows are added on Profile or by
// an admin; "outlook" rows come from all-day "Out of office" events and carry
// the Outlook event id in external_id, so the daily sync can update them.
export const userTimeOff = pgTable(
  "user_time_off",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    note: varchar("note", { length: 200 }),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    externalId: varchar("external_id", { length: 512 }),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_user_time_off_user_end").on(table.userId, table.endDate),
    unique("user_time_off_user_external_unique").on(table.userId, table.externalId),
    check("user_time_off_range_check", drizzleSql`${table.endDate} >= ${table.startDate}`),
    check("user_time_off_source_check", drizzleSql`${table.source} IN ('manual', 'outlook')`),
  ],
);

export type UserWorkScheduleRow = typeof userWorkSchedules.$inferSelect;
export type UserTimeOffRow = typeof userTimeOff.$inferSelect;
