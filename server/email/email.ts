/**
 * ============================================================================
 * CENTRALIZED EMAIL SERVICE (server/email.ts)
 * ============================================================================
 * 
 * This is the single source of truth for all email sending in the application.
 * ALL email sends must route through this service.
 * 
 * AUDIT OF EMAIL SENDING LOCATIONS (for Email Automation migration):
 * 
 * 1. AUTHENTICATION & USER MANAGEMENT:
 *    - sendPasswordResetEmail() - Password reset emails
 *      Used in: routes.ts (POST /api/auth/forgot-password)
 *    - sendWelcomeEmail() - Welcome emails for new users
 *      Used in: simpleAuth.ts (account creation), routes.ts (admin creation, manual invite)
 * 
 * 2. PROJECT NOTIFICATIONS:
 *    - sendEmail() - Generic project notifications
 *      Used in: routes.ts (project invitations, status updates)
 * 
 * 3. SUPPORT & FEATURES:
 *    - sendNewSupportRequestNotification() - New support request alerts
 *      Used in: routes.ts (POST /api/support-features)
 *    - sendSupportRequestUpdateNotification() - Support request status changes
 *      Used in: routes.ts (PATCH /api/support-features/:id)
 * 
 * 4. MAP NOTIFICATIONS:
 *    Only through Workflow Automation rules: emitMapItemUpdated() and the
 *    due-soon job raise map.phase/step/task events, and
 *    services/map-email-rules.ts runs the rules for them.
 * 
 * 5. EMAIL TEMPLATES SYSTEM:
 *    - sendEmail() via template system
 *      Used in: routes.ts (POST /api/email-templates/test-send)
 * 
 * MIGRATION PLAN FOR EMAIL AUTOMATION:
 * 
 * Phase 1: Build automation infrastructure (triggers, rules, conditions, actions)
 * Phase 2: Keep existing direct calls but start logging through automation audit
 * Phase 3: Route each category through automation:
 *          - Authentication emails → authentication triggers
 *          - Project emails → project_notification triggers
 *          - MAP emails → map_phase/map_step/map_task triggers
 *          - Support emails → system_alert triggers
 * Phase 4: Deprecate direct function calls, enforce automation routing
 * 
 * CENTRALIZED EMAIL SERVICE FEATURES:
 * - Nodemailer SMTP integration (Gmail)
 * - Email logging to database (emailLogs table)
 * - User preference checking (receiveEmails flag)
 * - PDF attachment generation (puppeteer)
 * - Consistent branding (header/footer wrapping)
 * - Error handling and retry logic
 * 
 * FUTURE: All sends will route through Email Automation system with:
 * - User preferences (userEmailPreferences table)
 * - Project notification settings (projectMapNotificationSettings table)
 * - Rule-based conditions and actions
 * - Quiet hours, deduplication, digests
 * - Test mode and routing
 */

import { nanoid } from 'nanoid';
import { storage } from '../storage';
import { decryptText } from '../auth/mfaUtils';
import { getEmailSender, type EmailSender } from './email-sender';
import { getPublicAppUrl } from '../lib/app-config';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { isCurrentRequestDemo } from '../lib/demo-mode';

// Auto-migrate environment variables to database on first run
// This function should be called during server startup
export async function migrateEmailConfigFromEnv() {
  try {
    const existingConfig = await storage.getEmailConfiguration();
    
    // If no database config exists but env vars are set, migrate them
    if (!existingConfig && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      console.log('🔄 Migrating Gmail environment variables to database configuration...');
      
      const { encryptText } = await import('../auth/mfaUtils');
      
      // Find an admin user to set as creator (required by foreign key constraint)
      const adminUsers = await storage.getAllUsers();
      const adminUser = adminUsers.find(u => u.role === 'Admin');
      
      if (!adminUser) {
        console.warn('⚠️  Cannot migrate email configuration - no admin user found in database');
        console.log('ℹ️  Email configuration will need to be set up manually via the Email Configuration page');
        return;
      }
      
      await storage.createEmailConfiguration({
        enabled: true,
        provider: 'Gmail / Google Workspace',
        server: 'smtp.gmail.com',
        port: 587,
        fromAddress: process.env.GMAIL_USER,
        replyToAddress: null,
        username: encryptText(process.env.GMAIL_USER),
        password: encryptText(process.env.GMAIL_APP_PASSWORD),
        tls: false,
        startTLS: true,
        maxRetries: 3,
        retryDelay: 5,
        rateLimit: 60,
        createdBy: adminUser.id,
      });
      
      console.log('✅ Gmail configuration migrated to database successfully');
    } else if (existingConfig) {
      console.log('📧 Email configuration already exists in database');
    } else {
      console.log('ℹ️  No email configuration found - please configure via Email Configuration page');
    }
  } catch (error) {
    console.error('⚠️  Email configuration migration check failed:', error);
  }
}

// Resolve the active email transport from database configuration ONLY
// (no env fallback — purely database-driven). Returns an EmailSender
// that abstracts over SMTP (nodemailer) and Microsoft Graph sendMail
// based on `config.authType`; the rich send pipeline below doesn't care
// which backend delivers. See server/email/email-sender.ts.
async function getActiveEmailSender(): Promise<EmailSender | null> {
  try {
    const config = await storage.getEmailConfiguration();

    if (!config) {
      console.warn("⚠️  No email configuration found in database - email functionality disabled. Please configure via Email Configuration page.");
      return null;
    }

    if (!config.enabled) {
      console.warn("⚠️  Email configuration is disabled - email functionality disabled.");
      return null;
    }

    const via =
      config.authType === "graph"
        ? `Microsoft Graph (${config.graphCredentialType ?? "secret"}) as ${config.graphSenderEmail}`
        : `SMTP ${config.provider} (${config.server}:${config.port})`;
    console.log(`📧 Using database email configuration: ${via}`);

    return getEmailSender(config);
  } catch (error) {
    console.error('⚠️  Failed to load email configuration from database:', error);
    return null;
  }
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  emailType?: string;
  userId?: string;
  projectId?: number;
  includeProjectPdf?: boolean;
  skipWrapper?: boolean; // Skip applying Email Design wrapper (use when template already has design wrapper)
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Function to generate PDF screenshot of project details page
async function generateProjectPdf(projectId: number): Promise<Buffer | null> {
  if (!projectId) return null;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    const projectUrl = `${getPublicAppUrl()}/project/${projectId}`;

    // Set viewport and navigate to project page
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(projectUrl, { waitUntil: 'networkidle2' });

    // Wait for content to load
    await page.waitForSelector('.pdf-capture-area', { timeout: 10000 });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Error generating project PDF:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Bundled CriteriaIQ logo data URL — the fallback used by the email
// wrapper when the configured design's `logoSrc` can't be resolved to a
// real file (e.g. the storage provider hasn't yet mirrored the asset, or
// the design row was edited by hand with a stale path). Until v0.7.52
// this fell back to the legacy legacy vendor logo, which is why preview emails
// kept showing red legacy vendor branding even on installs that had rebranded
// the rest of the chain. The bundled file is generated from
// `attached_assets/system/branding/criteriaiq-logo-dark.png` and lives
// at `server/assets/criteriaiq-logo-dark-base64.txt`.
function getDefaultLogoDataUrl(): string {
  try {
    const logoPath = path.join(process.cwd(), 'server/assets/criteriaiq-logo-dark-base64.txt');
    const base64Logo = fs.readFileSync(logoPath, 'utf-8').trim();
    return `data:image/png;base64,${base64Logo}`;
  } catch (error) {
    console.error('Failed to load CriteriaIQ default logo base64:', error);
    return '';
  }
}

// Function to generate the email header with CriteriaIQ branding
function generateEmailHeader(): string {
  const logoDataUrl = getDefaultLogoDataUrl();

  return `
    <table width="735" cellpadding="0" cellspacing="0" border="0" style="width: 735px !important; background-color: #1e3a8a !important; margin: 0 0 30px 0; border-collapse: collapse; table-layout: fixed; height: 52px !important;">
      <tr style="height: 52px !important;">
        <td style="padding: 0; background-color: #1e3a8a !important; vertical-align: middle; width: 180px; height: 52px !important; position: relative;">
          <table width="180" cellpadding="0" cellspacing="0" border="0" style="height: 52px;">
            <tr>
              <td style="padding: 2px 0 0 20px; vertical-align: middle; height: 52px;">
                ${logoDataUrl ? `<img src="${logoDataUrl}" alt="CriteriaIQ" width="160" height="38" style="height: 38px !important; width: 160px !important; display: block;">` : '<div style="color: white; font-size: 24px; font-weight: bold;">CriteriaIQ</div>'}
              </td>
            </tr>
          </table>
        </td>
        <td style="padding: 0; background-color: #1e3a8a !important; vertical-align: bottom; text-align: right; width: 555px; height: 52px !important; position: relative;">
          <table width="555" cellpadding="0" cellspacing="0" border="0" style="height: 52px;">
            <tr>
              <td style="padding: 0 20px 4px 0; vertical-align: bottom; text-align: right; height: 52px;">
                <span style="color: white; font-size: 14px; font-weight: bold; line-height: 14px;">CriteriaIQ</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

// Default design variables for email designs
const DEFAULT_DESIGN_VARIABLES = {
  headerBg: '#1e3a8a',
  rightTitle: 'CriteriaIQ',
  logoSrc: '',
  logoAlt: 'CriteriaIQ',
  logoWidth: '160',
  logoHeight: '38',
  graphic1: '',
  graphic2: '',
  graphic3: '',
  footerLine1: 'This email was sent from the CriteriaIQ Technical Validation',
  footerLine2: '© CriteriaIQ. All rights reserved.'
};

// Helper function to convert asset paths to base64 data URLs for email
function getAssetPathForEmail(assetPath: string | null | undefined): string {
  if (!assetPath) return '';
  
  // If it's already a data URL, return as-is
  if (assetPath.startsWith('data:')) {
    return assetPath;
  }
  
  // If it's a remote URL (http/https), return as-is (passthrough)
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
    return assetPath;
  }
  
  // For any local file path (including /attached_assets/), convert to base64
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  const toBase64DataUrl = (filePath: string): string => {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    return `data:${mimeType};base64,${base64}`;
  };

  try {
    // /api/files paths — the canonical URL shape produced by the new
    // cloud-storage abstraction. Translate them to the underlying disk
    // path the LocalDriver writes to (uploads/<key>) so the renderer
    // can read the bytes for base64-embedding. Cloud/files-DB-backed
    // installs that promote /api/files URLs would instead need an HTTP
    // fetch path; that's TBD when an admin saves a design with a
    // cloud-only image — for now the disk fallback covers local + the
    // bundled defaults.
    const apiFilesPrefix = '/api/files/';
    if (assetPath.startsWith(apiFilesPrefix)) {
      const key = assetPath.slice(apiFilesPrefix.length);
      const candidates = [
        path.join(process.cwd(), 'uploads', key),
        path.join(process.cwd(), 'attached_assets', key),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return toBase64DataUrl(c);
      }
    }

    // Primary: resolve path as given (handles full paths like /attached_assets/uploads_email/file.png)
    const fullPath = path.join(process.cwd(), assetPath.replace(/^\//, ''));
    if (fs.existsSync(fullPath)) {
      return toBase64DataUrl(fullPath);
    }

    // Fallback: bare filename — try the new canonical location first
    // (uploads/system/email-assets/<basename>), then the legacy
    // attached_assets/uploads_email/<basename> location so designs
    // referencing the pre-migration path keep rendering.
    const basename = path.basename(assetPath);
    if (basename === assetPath || !assetPath.includes('/')) {
      const candidates = [
        path.join(process.cwd(), 'uploads', 'system', 'email-assets', basename),
        path.join(process.cwd(), 'attached_assets', 'uploads_email', basename),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return toBase64DataUrl(c);
      }
    }

    console.warn(`Asset file not found for email: ${assetPath}`);
  } catch (error) {
    console.error('Error loading asset for email:', error);
  }

  // Fallback: return empty string if file doesn't exist
  return '';
}

// Function to process email design HTML with design variables
export function processEmailDesignVariables(
  htmlRaw: string,
  designVariables: Record<string, any>
): string {
  let processedHtml = htmlRaw;

  const tokens: Record<string, string> = {
    '{{HEADER_BG}}': designVariables.headerBg || DEFAULT_DESIGN_VARIABLES.headerBg,
    '{{RIGHT_TITLE}}': designVariables.rightTitle || DEFAULT_DESIGN_VARIABLES.rightTitle,
    '{{LOGO_SRC}}': getAssetPathForEmail(designVariables.logoSrc) || getDefaultLogoDataUrl(),
    '{{LOGO_ALT}}': designVariables.logoAlt || DEFAULT_DESIGN_VARIABLES.logoAlt,
    '{{LOGO_WIDTH}}': designVariables.logoWidth || DEFAULT_DESIGN_VARIABLES.logoWidth,
    '{{LOGO_HEIGHT}}': designVariables.logoHeight || DEFAULT_DESIGN_VARIABLES.logoHeight,
    '{{GRAPHIC1}}': getAssetPathForEmail(designVariables.graphic1) || '',
    '{{GRAPHIC2}}': getAssetPathForEmail(designVariables.graphic2) || '',
    '{{GRAPHIC3}}': getAssetPathForEmail(designVariables.graphic3) || '',
    '{{FOOTER_LINE1}}': designVariables.footerLine1 || DEFAULT_DESIGN_VARIABLES.footerLine1,
    '{{FOOTER_LINE2}}': designVariables.footerLine2 || DEFAULT_DESIGN_VARIABLES.footerLine2,
  };

  Object.entries(tokens).forEach(([token, value]) => {
    const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    processedHtml = processedHtml.replace(regex, value);
  });

  return processedHtml;
}

// Function to wrap email content with the header and standard styling
export function wrapEmailContent(htmlContent: string, textContent?: string): string {
  const header = generateEmailHeader();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Solutions Engineering</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
      <table width="735" cellpadding="0" cellspacing="0" border="0" style="width: 735px !important; max-width: 735px !important; margin: 0 auto; background-color: white; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <tr>
          <td style="width: 735px !important;">
            ${header}
          </td>
        </tr>
        <tr>
          <td style="padding: 0 30px 30px 30px; width: 735px !important;">
            ${htmlContent}
          </td>
        </tr>
        <tr>
          <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef; text-align: center; font-size: 12px; color: #6c757d; width: 735px !important;">
            <p style="margin: 0;">This email was sent from the CriteriaIQ Technical Validation</p>
            <p style="margin: 5px 0 0 0;">© your organization. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  // Demo Mode data is fake but its recipients (engineers, account reps) are
  // real people, so nothing is emailed while a request is in demo.
  if (isCurrentRequestDemo()) {
    console.log(`[email] Not sent in Demo Mode: "${params.subject}"`);
    return { success: false, error: 'Email is not sent in Demo Mode' };
  }

  // Resolve the active transport (SMTP or Microsoft Graph) from DB config.
  const sender = await getActiveEmailSender();

  if (!sender) {
    console.error('Email service not configured');

    // Still log the email attempt even if credentials are missing
    try {
      await storage.createEmailLog({
        toEmail: params.to,
        fromEmail: params.from,
        subject: params.subject,
        textContent: params.text || '',
        htmlContent: params.html || '',
        emailType: params.emailType || 'general',
        userId: params.userId || null,
        projectId: params.projectId || null,
        success: false,
        error: 'Email service not configured',
        messageId: nanoid()
      });
    } catch (logError) {
      console.error('Failed to log email attempt:', logError);
    }

    return { success: false, error: 'Email service not configured' };
  }

  // Check if the recipient has email receiving enabled
  if (params.to) {
    try {
      const user = await storage.getUserByEmail(params.to);
      if (user && user.receiveEmails === false) {
        console.log(`Email not sent to ${params.to} - user has disabled email reception`);

        // Log the blocked email
        await storage.createEmailLog({
          toEmail: params.to,
          fromEmail: params.from,
          subject: params.subject,
          textContent: params.text || '',
          htmlContent: params.html || '',
          emailType: params.emailType || 'general',
          userId: params.userId || null,
          projectId: params.projectId || null,
          success: false,
          error: 'User has disabled email reception',
          messageId: nanoid()
        });

        return { success: false, error: 'User has disabled email reception' };
      }
    } catch (userCheckError) {
      console.error('Error checking user email preferences:', userCheckError);
      // Continue with sending email if we can't check preferences
    }
  }

  const messageId = nanoid();

  try {
    // Apply Email Design wrapper unless skipWrapper is true (used when template already has design)
    let wrappedHtml = params.html;
    
    if (params.html && !params.skipWrapper) {
      try {
        // Look up the default email design by the `is_default = true` flag
        // rather than by name. Name-based lookup broke after the v0.7.51
        // rebrand to "CriteriaIQ Default" on any
        // install where the design has been customised and renamed; the
        // is_default flag is the durable contract. The canonical-name fallback
        // is a belt-and-suspenders measure for unbooted installs (the boot
        // seeder renames any legacy-named default row).
        const defaultDesign =
          (await storage.getDefaultEmailDesign()) ||
          (await storage.getEmailDesignByName('CriteriaIQ Default'));
        
        if (defaultDesign && defaultDesign.htmlRaw && defaultDesign.htmlRaw.includes('{{BODY_TEXT_CONTENT}}')) {
          // First, replace the body content placeholder with email content
          let tempHtml = defaultDesign.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, params.html);
          // Then, process design variables (logo, footer, colors, etc.)
          wrappedHtml = processEmailDesignVariables(tempHtml, defaultDesign.designVariables || {});
        } else {
          // Fallback to the old hardcoded wrapper if design is not found or invalid
          wrappedHtml = wrapEmailContent(params.html, params.text);
        }
      } catch (designError) {
        console.error('Error loading email design, using fallback wrapper:', designError);
        wrappedHtml = wrapEmailContent(params.html, params.text);
      }
    }

    // Prepare attachments array
    const attachments: any[] = [];

    // Generate project PDF if requested and projectId is available
    if (params.includeProjectPdf && params.projectId) {
      try {
        const project = await storage.getPoc(params.projectId);
        if (project) {
          const pdfBuffer = await generateProjectPdf(params.projectId);
          if (pdfBuffer) {
            const filename = `${project.customerName}_Project_Details_${new Date().toISOString().split('T')[0]}.pdf`;
            attachments.push({
              filename: filename,
              content: pdfBuffer,
              contentType: 'application/pdf'
            });
          }
        }
      } catch (pdfError) {
        console.error('Error generating PDF attachment:', pdfError);
        // Continue with email without PDF attachment
      }
    }

    // Add any additional attachments
    if (params.attachments) {
      attachments.push(...params.attachments);
    }

    // Resolve the authoritative from address: prefer the saved config's
    // fromAddress so all emails (password reset, welcome, test, etc.) use
    // the address the admin configured — not whatever individual callers
    // pass as a fallback. Callers may still override with a specific address
    // if needed, but the DB config always wins when set.
    let resolvedFrom = params.from;
    try {
      const emailCfg = await storage.getEmailConfiguration();
      if (emailCfg?.fromAddress) resolvedFrom = emailCfg.fromAddress;
    } catch {
      // Non-fatal: fall back to caller-supplied from
    }

    const mailOptions: any = {
      from: resolvedFrom,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: wrappedHtml,
      // Add custom headers for tracking
      headers: {
        'X-Email-Type': params.emailType || 'general',
        'X-User-ID': params.userId || '',
        'X-Project-ID': params.projectId?.toString() || '',
        'X-Sent-At': new Date().toISOString(),
        'X-Message-ID': messageId
      }
    };

    // Add attachments if any
    if (attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await sender.send(mailOptions);

    // SMTP `sendMail` resolves even when the server accepted the connection but
    // rejected every recipient — which previously got logged as "Sent" despite
    // nothing being delivered. If there were rejections and nobody was accepted,
    // treat it as a failure so the log tells the truth.
    if (info.rejected && info.rejected.length > 0 &&
        (!info.accepted || info.accepted.length === 0)) {
      throw new Error(
        `Mail server rejected all recipient(s): ${info.rejected.join(', ')}` +
        (info.response ? ` — server said: ${info.response}` : ''),
      );
    }

    // Carry the provider trace (SMTP server response, or Graph request-id) in
    // the stored message id so it's visible in the Email Logs detail view and
    // correlatable with Exchange message trace.
    const finalMessageId =
      (info.messageId || messageId) + (info.response ? ` · ${info.response}` : '');

    // Log successful email
    try {
      await storage.createEmailLog({
        toEmail: params.to,
        fromEmail: params.from,
        subject: params.subject,
        textContent: params.text || '',
        htmlContent: params.html || '',
        emailType: params.emailType || 'general',
        userId: params.userId || null,
        projectId: params.projectId || null,
        success: true,
        messageId: finalMessageId
      });
    } catch (logError) {
      console.error('Failed to log successful email:', logError);
    }

    return {
      success: true,
      messageId: finalMessageId
    };
  } catch (error) {
    console.error('Gmail SMTP email error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed email
    try {
      await storage.createEmailLog({
        toEmail: params.to,
        fromEmail: params.from,
        subject: params.subject,
        textContent: params.text || '',
        htmlContent: params.html || '',
        emailType: params.emailType || 'general',
        userId: params.userId || null,
        projectId: params.projectId || null,
        success: false,
        error: errorMessage,
        messageId: messageId
      });
    } catch (logError) {
      console.error('Failed to log failed email:', logError);
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const resetUrl = `${getPublicAppUrl()}/reset-password?token=${resetToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #212166; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; color: white;">CriteriaIQ Technical Validation</h2>
          <p style="margin: 10px 0 0 0; color: white;">Password Reset Request</p>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p style="margin: 0 0 15px 0;">Hello,</p>
          <p style="margin: 0 0 15px 0;">You have requested to reset your password for your CriteriaIQ account.</p>
          <p style="margin: 0 0 15px 0;">Click the button below to reset your password:</p>
          
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
            <tr>
              <td align="left" style="mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${resetUrl}"
                  style="height:44px;v-text-anchor:middle;width:240px;" arcsize="10%"
                  fillcolor="#0f3796" strokecolor="#0f3796">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial, Helvetica, sans-serif;
                                 font-size:16px;font-weight:bold;">
                    Reset Password
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${resetUrl}" target="_blank"
                   style="display:inline-block;background:#0f3796;color:#ffffff;
                          padding:12px 24px;text-decoration:none;border-radius:6px;
                          font-family:Arial, Helvetica, sans-serif;font-size:16px;
                          font-weight:bold;line-height:20px;">
                  Reset Password
                </a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>
          
          <p style="margin: 0 0 15px 0;">If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="margin: 0 0 15px 0; word-break: break-all;">${resetUrl}</p>
          <p style="margin: 0 0 15px 0;"><strong>Note:</strong> This link will expire in 1 hour for security reasons.</p>
          <p style="margin: 0;">If you didn't request this password reset, please ignore this email.</p>
        </div>
        <div style="font-size: 12px; color: #666; text-align: center; padding: 20px;">
          <p style="margin: 0;">This email was sent from CriteriaIQ Technical Validation</p>
          <p style="margin: 5px 0 0 0;">Data Security that Starts with Identity™</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    CriteriaIQ Technical Validation - Password Reset

    Hello,

    You have requested to reset your password for your CriteriaIQ account.

    Please visit the following link to reset your password:
    ${resetUrl}

    Note: This link will expire in 1 hour for security reasons.

    If you didn't request this password reset, please ignore this email.

    CriteriaIQ Technical Validation
    Data Security that Starts with Identity™
  `;

  const result = await sendEmail({
    to: email,
    from: process.env.GMAIL_USER || 'noreply@example.com',
    subject: 'Password Reset - CriteriaIQ Technical Validation',
    text: textContent,
    html: htmlContent,
    emailType: 'password_reset'
  });

  return result.success;
}

export async function sendWelcomeEmail(
  userDetails: { email: string | null; firstName: string | null; lastName: string | null; role: string | null },
  options?: { templateId?: number; accessCode?: string }
): Promise<boolean> {
  const loginUrl = getPublicAppUrl();

  // ── Try the Communications → Email Templates template first ─────────────────
  // Priority: options.templateId → "welcome" key → hardcoded fallback.
  // Admins can customise the subject and body in Configuration → Communications
  // without a code change.
  try {
    let template: Awaited<ReturnType<typeof storage.getEmailTemplateByKey>> | undefined;

    if (options?.templateId) {
      try {
        template = await storage.getEmailTemplate(options.templateId) ?? undefined;
      } catch (err) {
        console.warn("[sendWelcomeEmail] Failed to load template by id, falling back to key lookup:", err);
      }
    }

    if (!template) {
      template = await storage.getEmailTemplateByKey("welcome") ?? undefined;
    }

    if (template && template.isActive) {
      const rawContent = template.emailContent || template.htmlContent || "";
      let processedContent = rawContent
        .replace(/\{\{firstName\}\}/g, userDetails.firstName ?? "")
        .replace(/\{\{lastName\}\}/g, userDetails.lastName ?? "")
        .replace(/\{\{userEmail\}\}/g, userDetails.email ?? "")
        .replace(/\{\{userRole\}\}/g, userDetails.role ?? "")
        .replace(/\{\{dashboardUrl\}\}/g, loginUrl)
        .replace(/\{\{accessCode\}\}/g, options?.accessCode ?? "")
        .replace(/\{\{accessCodeNote\}\}/g, options?.accessCode
          ? `Your access code: <strong>${options.accessCode}</strong>. You will need this when you first log in.`
          : "");

      // If the template has no {{accessCode}} placeholder but a code was provided, append a note
      if (options?.accessCode && !processedContent.includes(options.accessCode)) {
        processedContent += `<p style="margin: 15px 0; padding: 12px; background-color: #f0f4ff; border-left: 3px solid #0f3796; border-radius: 4px;"><strong>Your Access Code: ${options.accessCode}</strong><br><span style="font-size: 14px; color: #555;">You will need this code when you first log in to the platform.</span></p>`;
      }

      const rawSubject = template.subject || "Welcome to CriteriaIQ";
      const processedSubject = rawSubject
        .replace(/\{\{firstName\}\}/g, userDetails.firstName ?? "")
        .replace(/\{\{lastName\}\}/g, userDetails.lastName ?? "");

      const result = await sendEmail({
        to: userDetails.email ?? "",
        from: process.env.GMAIL_USER || "noreply@example.com",
        subject: processedSubject,
        html: processedContent,
        emailType: "welcome",
      });
      return result.success;
    }
  } catch (err) {
    // Template lookup failure — fall through to hardcoded fallback below
    console.warn("[sendWelcomeEmail] Could not fetch welcome template from DB, using hardcoded fallback:", err);
  }
  // ── Hardcoded fallback (used when template is absent or inactive) ─────────

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #212166; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; color: white;">Welcome to Technical Validation Project Manager</h2>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p style="margin: 0 0 15px 0;">Hello ${userDetails.firstName} ${userDetails.lastName},</p>
          <p style="margin: 0 0 15px 0;">Welcome to Technical Validation Project Manager! Your account has been created with the following details:</p>
          <ul style="margin: 0 0 15px 0; padding-left: 20px;">
            <li style="margin-bottom: 5px;"><strong>Email:</strong> ${userDetails.email}</li>
            <li style="margin-bottom: 5px;"><strong>Role:</strong> ${userDetails.role}</li>
          </ul>
          <p style="margin: 0 0 15px 0;">You can now access the platform using the link below:</p>
          
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
            <tr>
              <td align="left" style="mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${loginUrl}"
                  style="height:44px;v-text-anchor:middle;width:240px;" arcsize="10%"
                  fillcolor="#0f3796" strokecolor="#0f3796">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial, Helvetica, sans-serif;
                                 font-size:16px;font-weight:bold;">
                    Access Platform
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${loginUrl}" target="_blank"
                   style="display:inline-block;background:#0f3796;color:#ffffff;
                          padding:12px 24px;text-decoration:none;border-radius:6px;
                          font-family:Arial, Helvetica, sans-serif;font-size:16px;
                          font-weight:bold;line-height:20px;">
                  Access Platform
                </a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>
          
          <p style="margin: 0;">If you have any questions or need assistance, please contact your administrator.</p>
        </div>
        <div style="font-size: 12px; color: #666; text-align: center; padding: 20px;">
          <p style="margin: 0;">Technical Validation Project Manager</p>
          <p style="margin: 5px 0 0 0;">Data Security that Starts with Identity™</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Inject access code block into hardcoded fallback if one was provided
  if (options?.accessCode) {
    htmlContent = htmlContent.replace(
      '<p style="margin: 0;">If you have any questions or need assistance, please contact your administrator.</p>',
      `<p style="margin: 0 0 15px 0; padding: 12px; background-color: #f0f4ff; border-left: 3px solid #0f3796; border-radius: 4px;"><strong>Your Access Code: ${options.accessCode}</strong><br><span style="font-size: 14px; color: #555;">You will need this code when you first log in to the platform.</span></p><p style="margin: 0;">If you have any questions or need assistance, please contact your administrator.</p>`
    );
  }

  const textContent = `
    Welcome to Technical Validation Project Manager

    Hello ${userDetails.firstName} ${userDetails.lastName},

    Welcome to Technical Validation Project Manager! Your account has been created with the following details:

    Email: ${userDetails.email}
    Role: ${userDetails.role}
    ${options?.accessCode ? `\n    Access Code: ${options.accessCode}\n` : ""}
    You can now access the platform at: ${loginUrl}

    If you have any questions or need assistance, please contact your administrator.

    Technical Validation Project Manager
    Data Security that Starts with Identity™
  `;

  const result = await sendEmail({
    to: userDetails.email ?? '',
    from: process.env.GMAIL_USER || 'noreply@example.com',
    subject: 'Welcome to Technical Validation Project Manager',
    text: textContent,
    html: htmlContent,
    emailType: 'welcome'
  });

  return result.success;
}

// Send notification email for new support request submission
export async function sendNewSupportRequestNotification(
  requestDetails: {
    id: number;
    type: string;
    priority: string;
    subject: string;
    description: string;
    submitterName: string;
    submitterEmail: string;
    customerName?: string;
    projectName?: string;
  },
  recipientEmail: string
): Promise<boolean> {
  const supportUrl = `${getPublicAppUrl()}/support-features`;
  const priorityColors: Record<string, string> = {
    'low': '#28a745',
    'medium': '#fd7e14', 
    'high': '#dc3545',
    'critical': '#6f42c1'
  };
  const priorityColor = priorityColors[requestDetails.priority.toLowerCase()] || '#6c757d';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #212166; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; color: white;">CriteriaIQ Support & Features</h2>
          <p style="margin: 10px 0 0 0; color: white;">New ${requestDetails.type} Request Submitted</p>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p style="margin: 0 0 15px 0;">Hello,</p>
          <p style="margin: 0 0 15px 0;">A new ${requestDetails.type.toLowerCase()} request has been submitted and requires attention.</p>
          
          <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin: 15px 0;">
            <h3 style="margin-top: 0; color: #333;">Request Details</h3>
            <p style="margin: 5px 0;"><strong>ID:</strong> #${requestDetails.id}</p>
            <p style="margin: 5px 0;"><strong>Type:</strong> ${requestDetails.type}</p>
            <p style="margin: 5px 0;"><strong>Priority:</strong> <span style="display: inline-block; background-color: ${priorityColor}; color: white; padding: 4px 12px; border-radius: 15px; font-size: 12px; font-weight: bold; text-transform: uppercase;">${requestDetails.priority}</span></p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${requestDetails.subject}</p>
            <p style="margin: 5px 0;"><strong>Submitted by:</strong> ${requestDetails.submitterName} (${requestDetails.submitterEmail})</p>
            ${requestDetails.customerName ? `<p style="margin: 5px 0;"><strong>Customer:</strong> ${requestDetails.customerName}</p>` : ''}
            ${requestDetails.projectName ? `<p style="margin: 5px 0;"><strong>Project:</strong> ${requestDetails.projectName}</p>` : ''}
            <p style="margin: 10px 0 5px 0;"><strong>Description:</strong></p>
            <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-style: italic; margin: 5px 0;">${requestDetails.description}</p>
          </div>
          
          <p style="margin: 0 0 15px 0;">Please review and assign this request as appropriate.</p>
          
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
            <tr>
              <td align="left" style="mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${supportUrl}"
                  style="height:44px;v-text-anchor:middle;width:240px;" arcsize="10%"
                  fillcolor="#0f3796" strokecolor="#0f3796">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial, Helvetica, sans-serif;
                                 font-size:16px;font-weight:bold;">
                    View Support Requests
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${supportUrl}" target="_blank"
                   style="display:inline-block;background:#0f3796;color:#ffffff;
                          padding:12px 24px;text-decoration:none;border-radius:6px;
                          font-family:Arial, Helvetica, sans-serif;font-size:16px;
                          font-weight:bold;line-height:20px;">
                  View Support Requests
                </a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>
          
          <p style="font-size: 12px; color: #666; margin-top: 20px;">
            This is an automated notification from the CriteriaIQ Support & Features system.
          </p>
        </div>
        <div style="font-size: 12px; color: #666; text-align: center; padding: 20px;">
          <p style="margin: 0;">CriteriaIQ Technical Validation</p>
          <p style="margin: 5px 0 0 0;">Data Security that Starts with Identity™</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `CriteriaIQ Support & Features - New ${requestDetails.type} Request

A new ${requestDetails.type.toLowerCase()} request has been submitted:

Request ID: #${requestDetails.id}
Type: ${requestDetails.type}
Priority: ${requestDetails.priority}
Subject: ${requestDetails.subject}
Submitted by: ${requestDetails.submitterName} (${requestDetails.submitterEmail})
${requestDetails.customerName ? `Customer: ${requestDetails.customerName}
` : ''}${requestDetails.projectName ? `Project: ${requestDetails.projectName}
` : ''}
Description:
${requestDetails.description}

Please review and assign this request at: ${supportUrl}

CriteriaIQ Technical Validation
Data Security that Starts with Identity™`;

  const result = await sendEmail({
    to: recipientEmail,
    from: process.env.GMAIL_USER || 'noreply@example.com',
    subject: `New ${requestDetails.type} Request #${requestDetails.id}: ${requestDetails.subject}`,
    text: textContent,
    html: htmlContent,
    emailType: 'support_request_new'
  });

  return result.success;
}

// Send notification email for support request status update
export async function sendSupportRequestUpdateNotification(
  requestDetails: {
    id: number;
    type: string;
    priority: string;
    subject: string;
    description: string;
    submitterName: string;
    submitterEmail: string;
    customerName?: string;
    projectName?: string;
    oldStatus: string;
    newStatus: string;
    assignedToName?: string;
    updatedByName: string;
    updateNote?: string;
  },
  recipientEmail: string
): Promise<boolean> {
  const supportUrl = `${getPublicAppUrl()}/support-features`;
  const statusColors: Record<string, string> = {
    'open': '#17a2b8',
    'in_progress': '#fd7e14',
    'resolved': '#28a745',
    'closed': '#6c757d'
  };
  const statusColor = statusColors[requestDetails.newStatus.toLowerCase()] || '#6c757d';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #212166; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; color: white;">CriteriaIQ Support & Features</h2>
          <p style="margin: 10px 0 0 0; color: white;">${requestDetails.type} Request #${requestDetails.id} Updated</p>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p style="margin: 0 0 15px 0;">Hello ${requestDetails.submitterName},</p>
          <p style="margin: 0 0 15px 0;">Your ${requestDetails.type.toLowerCase()} request has been updated.</p>
          
          <div style="background-color: #fff; border-left: 4px solid ${statusColor}; padding: 15px; margin: 15px 0; border-radius: 0 5px 5px 0;">
            <h3 style="margin-top: 0; color: #333;">Status Update</h3>
            <p style="margin: 5px 0;"><strong>Previous Status:</strong> ${requestDetails.oldStatus.replace('_', ' ').toUpperCase()}</p>
            <p style="margin: 5px 0;"><strong>New Status:</strong> <span style="display: inline-block; background-color: ${statusColor}; color: white; padding: 4px 12px; border-radius: 15px; font-size: 12px; font-weight: bold; text-transform: uppercase;">${requestDetails.newStatus.replace('_', ' ')}</span></p>
            <p style="margin: 5px 0;"><strong>Updated by:</strong> ${requestDetails.updatedByName}</p>
            ${requestDetails.assignedToName ? `<p style="margin: 5px 0;"><strong>Assigned to:</strong> ${requestDetails.assignedToName}</p>` : ''}
            ${requestDetails.updateNote ? `<p style="margin: 5px 0;"><strong>Update Note:</strong> ${requestDetails.updateNote}</p>` : ''}
          </div>
          
          <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin: 15px 0;">
            <h3 style="margin-top: 0; color: #333;">Request Summary</h3>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${requestDetails.subject}</p>
            <p style="margin: 5px 0;"><strong>Priority:</strong> ${requestDetails.priority}</p>
            ${requestDetails.customerName ? `<p style="margin: 5px 0;"><strong>Customer:</strong> ${requestDetails.customerName}</p>` : ''}
            ${requestDetails.projectName ? `<p style="margin: 5px 0;"><strong>Project:</strong> ${requestDetails.projectName}</p>` : ''}
          </div>
          
          <p style="margin: 0 0 15px 0;">You can view the full details and any updates by clicking the link below:</p>
          
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
            <tr>
              <td align="left" style="mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${supportUrl}"
                  style="height:44px;v-text-anchor:middle;width:240px;" arcsize="10%"
                  fillcolor="#0f3796" strokecolor="#0f3796">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial, Helvetica, sans-serif;
                                 font-size:16px;font-weight:bold;">
                    View Request Details
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${supportUrl}" target="_blank"
                   style="display:inline-block;background:#0f3796;color:#ffffff;
                          padding:12px 24px;text-decoration:none;border-radius:6px;
                          font-family:Arial, Helvetica, sans-serif;font-size:16px;
                          font-weight:bold;line-height:20px;">
                  View Request Details
                </a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>
          
          <p style="font-size: 12px; color: #666; margin-top: 20px;">
            This is an automated notification from the CriteriaIQ Support & Features system.
          </p>
        </div>
        <div style="font-size: 12px; color: #666; text-align: center; padding: 20px;">
          <p style="margin: 0;">CriteriaIQ Technical Validation</p>
          <p style="margin: 5px 0 0 0;">Data Security that Starts with Identity™</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `CriteriaIQ Support & Features - Request #${requestDetails.id} Updated

Hello ${requestDetails.submitterName},

Your ${requestDetails.type.toLowerCase()} request has been updated:

Subject: ${requestDetails.subject}
Previous Status: ${requestDetails.oldStatus.replace('_', ' ').toUpperCase()}
New Status: ${requestDetails.newStatus.replace('_', ' ').toUpperCase()}
Updated by: ${requestDetails.updatedByName}
${requestDetails.assignedToName ? `Assigned to: ${requestDetails.assignedToName}
` : ''}${requestDetails.updateNote ? `Update Note: ${requestDetails.updateNote}
` : ''}
${requestDetails.customerName ? `Customer: ${requestDetails.customerName}
` : ''}${requestDetails.projectName ? `Project: ${requestDetails.projectName}
` : ''}
View full details at: ${supportUrl}

CriteriaIQ Technical Validation
Data Security that Starts with Identity™`;

  const result = await sendEmail({
    to: recipientEmail,
    from: process.env.GMAIL_USER || 'noreply@example.com',
    subject: `Request #${requestDetails.id} ${requestDetails.newStatus.replace('_', ' ').toUpperCase()}: ${requestDetails.subject}`,
    text: textContent,
    html: htmlContent,
    emailType: 'support_request_update'
  });

  return result.success;
}
