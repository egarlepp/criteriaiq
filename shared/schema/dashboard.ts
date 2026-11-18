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
  decimal,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";

export const customReports = pgTable("custom_reports", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  chartType: varchar("chart_type", { length: 50 }),
  dataSource: varchar("data_source", { length: 100 }).notNull(),
  selectedFields: jsonb("selected_fields").notNull(),
  filters: jsonb("filters"),
  sortBy: varchar("sort_by", { length: 100 }),
  sortOrder: varchar("sort_order", { length: 10 }).default("asc"),
  groupBy: varchar("group_by", { length: 100 }),
  tags: text("tags").array(),
  // Soft ref to users.id (FK dropped in migration 036).
  createdBy: varchar("created_by").notNull(),
  isShared: boolean("is_shared").default(false),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_custom_reports_is_demo").on(table.isDemo),
]);

export const userReportFavorites = pgTable("user_report_favorites", {
  id: serial("id").primaryKey(),
  // Soft ref to users.id (FK dropped in migration 036).
  userId: varchar("user_id").notNull(),
  reportId: integer("report_id")
    .references(() => customReports.id)
    .notNull(),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  systemReportId: varchar("system_report_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportExecutions = pgTable("report_executions", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .references(() => customReports.id, { onDelete: "cascade" })
    .notNull(),
  // Soft ref to users.id (FK dropped in migration 036).
  executedBy: varchar("executed_by").notNull(),
  executionTime: timestamp("execution_time").defaultNow(),
  recordCount: integer("record_count"),
  executionStatus: varchar("execution_status", { length: 20 }).default(
    "success",
  ),
  errorMessage: text("error_message"),
});

export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    userId: varchar("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    pageKey: varchar("page_key", { length: 50 }).notNull().default("dashboard"),
    role: varchar("role", { length: 50 }).notNull().default("All"),
    isGlobal: boolean("is_global").default(false),
    isDefault: boolean("is_default").default(false),
    // Marks the built-in "Analytics - Dashboard Builder" Overview row
    // seeded by `seedProtectedDashboardLayouts`. Protected rows are
    // editable (layoutConfig may be saved) but cannot be deleted and
    // cannot have their identity (name/pageKey/role/protected/global
    // flags) overwritten via the dashboard layout API. See Task #555.
    isProtected: boolean("is_protected").notNull().default(false),
    layoutConfig: jsonb("layout_config").notNull(),
    createdBy: varchar("created_by").references(() => users.id),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_dashboard_layouts_user").on(table.userId),
    index("idx_dashboard_layouts_global").on(table.isGlobal),
    index("idx_dashboard_layouts_lookup").on(table.pageKey, table.role),
    index("idx_dashboard_layouts_is_demo").on(table.isDemo),
  ],
);

export const widgetConfigs = pgTable(
  "widget_configs",
  {
    id: serial("id").primaryKey(),
    layoutId: integer("layout_id").references(() => dashboardLayouts.id, {
      onDelete: "cascade",
    }),
    widgetType: varchar("widget_type", { length: 100 }).notNull(),
    widgetId: varchar("widget_id", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }),
    config: jsonb("config"),
    gridPosition: jsonb("grid_position"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_widget_configs_layout").on(table.layoutId),
    index("idx_widget_configs_type").on(table.widgetType),
  ],
);

export const dashboardConfigs = pgTable(
  "dashboard_configs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    role: text("role").default("All"),
    config: jsonb("config").notNull(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_dashboard_configs_user").on(table.userId),
    index("idx_dashboard_configs_role").on(table.role),
    index("idx_dashboard_configs_active").on(table.isActive),
  ],
);

export const dashboardMetrics = pgTable("dashboard_metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  type: text("type").notNull(),
  config: jsonb("config").notNull(),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: serial("id").primaryKey(),
    metricKey: varchar("metric_key").notNull(),
    value: decimal("value", { precision: 20, scale: 4 }).notNull(),
    snapshotDate: timestamp("snapshot_date").notNull(),
    snapshotWeek: varchar("snapshot_week"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_metric_snapshots_key").on(table.metricKey),
    index("idx_metric_snapshots_date").on(table.snapshotDate),
    index("idx_metric_snapshots_key_date").on(table.metricKey, table.snapshotDate),
    index("idx_metric_snapshots_week").on(table.snapshotWeek),
  ],
);

export const dashboardLayoutsRelations = relations(
  dashboardLayouts,
  ({ one, many }) => ({
    user: one(users, {
      fields: [dashboardLayouts.userId],
      references: [users.id],
    }),
    creator: one(users, {
      fields: [dashboardLayouts.createdBy],
      references: [users.id],
    }),
    widgets: many(widgetConfigs),
  }),
);

export const widgetConfigsRelations = relations(widgetConfigs, ({ one }) => ({
  layout: one(dashboardLayouts, {
    fields: [widgetConfigs.layoutId],
    references: [dashboardLayouts.id],
  }),
}));

export const dashboardConfigsRelations = relations(
  dashboardConfigs,
  ({ one }) => ({
    user: one(users, {
      fields: [dashboardConfigs.userId],
      references: [users.id],
    }),
  }),
);

export const insertCustomReportSchema = createInsertSchema(customReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReportExecutionSchema = createInsertSchema(
  reportExecutions,
).omit({
  id: true,
  executionTime: true,
});

export const insertDashboardLayoutSchema = z.object({
  name: z.string().min(1, "Layout name is required"),
  description: z.string().optional(),
  pageKey: z.string().default("dashboard"),
  role: z.string().default("All"),
  isGlobal: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  // `isProtected` is intentionally omitted from the user-facing insert
  // schema (Task #555). Only the boot-time seeder
  // (`seedProtectedDashboardLayouts`) is allowed to flip a row's
  // protected status; route handlers and the dashboard builder never
  // accept it from the client. The DB column still defaults to false
  // for any insert path that doesn't carry the flag explicitly.
  layoutConfig: z.any(),
});

export const insertWidgetConfigSchema = z.object({
  layoutId: z.number(),
  widgetType: z.string(),
  widgetId: z.string(),
  title: z.string().optional(),
  config: z.any().optional(),
  gridPosition: z.any().optional(),
});

export const insertDashboardConfigSchema = z.object({
  userId: z.string().nullable().optional(),
  role: z.string().default("All"),
  config: z.any(),
  isActive: z.boolean().default(true),
});

export const insertMetricSchema = createInsertSchema(dashboardMetrics);
export const selectMetricSchema = createSelectSchema(dashboardMetrics);

export const insertMetricSnapshotSchema = createInsertSchema(metricSnapshots);
export const selectMetricSnapshotSchema = createSelectSchema(metricSnapshots);

export type InsertCustomReport = z.infer<typeof insertCustomReportSchema>;
export type CustomReport = typeof customReports.$inferSelect;
export type UserReportFavorite = typeof userReportFavorites.$inferSelect;
export type NewUserReportFavorite = typeof userReportFavorites.$inferInsert;

export type InsertReportExecution = z.infer<typeof insertReportExecutionSchema>;
export type ReportExecution = typeof reportExecutions.$inferSelect;

export type DashboardLayout = typeof dashboardLayouts.$inferSelect;
export type InsertDashboardLayout = typeof dashboardLayouts.$inferInsert;
export type WidgetConfig = typeof widgetConfigs.$inferSelect;
export type InsertWidgetConfig = typeof widgetConfigs.$inferInsert;

export type DashboardConfig = typeof dashboardConfigs.$inferSelect;
export type InsertDashboardConfig = typeof dashboardConfigs.$inferInsert;

export type DashboardMetric = typeof dashboardMetrics.$inferSelect;
export type NewDashboardMetric = typeof dashboardMetrics.$inferInsert;

export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type InsertMetricSnapshot = typeof metricSnapshots.$inferInsert;
