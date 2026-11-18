import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { emailConfiguration } from '../../shared/schema/email';

interface DeferredSmtp {
  host: string;
  port: number;
  username: string;
  passwordEncrypted: string;
  fromAddress: string;
  secure: boolean;
}

/**
 * Applies any deferred SMTP configuration written by the wizard's
 * /api/setup/smtp endpoint into the email_configuration table on the first
 * boot after setup. Idempotent: clears the deferred block from
 * data/db-config.json once applied so it never runs twice.
 */
export async function hydrateDeferredSmtp(): Promise<void> {
  const configFile = path.join(process.cwd(), 'data', 'db-config.json');
  let store: Record<string, unknown> = {};
  try {
    store = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return; // No file → nothing deferred
  }

  const smtp = store.smtp as DeferredSmtp | undefined;
  if (!smtp || !smtp.host || !smtp.username || !smtp.fromAddress) return;

  try {
    const existing = await db.select().from(emailConfiguration).limit(1);
    if (existing.length > 0) {
      console.log('[smtp-hydrate] Email configuration already exists in DB; discarding deferred SMTP from setup wizard.');
    } else {
      const provider = smtp.host.toLowerCase().includes('gmail')
        ? 'gmail'
        : smtp.host.toLowerCase().includes('outlook') || smtp.host.toLowerCase().includes('office365')
          ? 'office365'
          : 'custom';
      await db.insert(emailConfiguration).values({
        enabled: true,
        provider,
        server: smtp.host,
        port: smtp.port,
        fromAddress: smtp.fromAddress,
        username: smtp.username,
        password: smtp.passwordEncrypted, // already AES-256-GCM ciphertext
        tls: smtp.secure === true,
        startTLS: smtp.secure !== true,
      });
      console.log(`[smtp-hydrate] ✅ Applied deferred SMTP from setup wizard (host=${smtp.host} provider=${provider})`);
    }
  } catch (err) {
    console.error('[smtp-hydrate] Failed to apply deferred SMTP:', err);
    return; // leave the file alone so we can retry on next boot
  }

  // Clear the deferred block so we don't re-apply
  try {
    delete store.smtp;
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(configFile, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.warn('[smtp-hydrate] Could not clear deferred smtp from db-config.json:', err);
  }
}
