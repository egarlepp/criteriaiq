// Applies the CRM the setup wizard staged in data/db-config.json
// (POST /api/setup/crm-provider) on the first boot after setup, the same way
// smtp-hydrate.ts applies the wizard's SMTP settings: the wizard runs before
// the full app, so it can't write system_settings itself.
//
// An install that already has a saved choice keeps it, and the lock still
// applies (a wizard re-run against a database holding Salesforce links can't
// switch it to HubSpot). Clears the staged value once handled.
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { CRM_PROVIDER_SETTING_KEY, isCrmProviderId } from "@shared/crm-provider";
import { changeCrmProvider } from "./provider-lock";

export async function hydrateDeferredCrmProvider(configFile = path.join(process.cwd(), "data", "db-config.json")): Promise<void> {
  let store: Record<string, unknown>;
  try {
    store = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return;
  }
  if (!("crmProvider" in store)) return;
  const staged = store.crmProvider;

  try {
    if (!isCrmProviderId(staged)) {
      console.warn("[crm-provider] ignoring an unknown CRM staged by the setup wizard");
    } else if (await storage.getSystemSetting(CRM_PROVIDER_SETTING_KEY)) {
      console.log("[crm-provider] a CRM is already saved; discarding the setup wizard's choice");
    } else {
      const result = await changeCrmProvider(staged, undefined);
      console.log(
        result.ok
          ? `[crm-provider] applied the setup wizard's choice: ${staged}`
          : `[crm-provider] kept ${result.state.provider}: records already link to another CRM`,
      );
    }
  } catch (err) {
    console.error("[crm-provider] failed to apply the setup wizard's choice:", err);
    return; // keep it staged so the next boot retries
  }

  try {
    delete store.crmProvider;
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(configFile, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.warn("[crm-provider] could not clear the staged choice from db-config.json:", err);
  }
}
