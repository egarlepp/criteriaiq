// MCP server on/off switch (Admin › Integrations › MCP Server).
//
// Stored as one `system_settings` row (key `mcp_settings`). Read from the
// database on each MCP request rather than cached, so every replica sees
// a switch-off at once; MCP traffic is low enough that one indexed
// lookup per call is negligible.
//
// Default OFF: unlike ImpactIQ (default on), CriteriaIQ follows its
// zero-trust posture and exposes no data to AI clients until an admin
// turns the server on, even if an mcp:read key already exists.

import { z } from "zod";
import { storage } from "../storage";

export const MCP_SETTINGS_KEY = "mcp_settings";

export const mcpSettingsSchema = z.object({ enabled: z.boolean() });
export type McpSettings = z.infer<typeof mcpSettingsSchema>;

export const DEFAULT_MCP_SETTINGS: McpSettings = { enabled: false };

export async function getMcpSettings(): Promise<McpSettings> {
  const row = await storage.getSystemSetting(MCP_SETTINGS_KEY);
  if (!row) return DEFAULT_MCP_SETTINGS;
  const parsed = mcpSettingsSchema.safeParse(row.value);
  return parsed.success ? parsed.data : DEFAULT_MCP_SETTINGS;
}

export async function saveMcpSettings(next: McpSettings, updatedBy: string | undefined): Promise<McpSettings> {
  await storage.upsertSystemSetting(MCP_SETTINGS_KEY, next, updatedBy, "MCP server (Admin › Integrations)");
  return next;
}
