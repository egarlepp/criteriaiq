// Email Configuration routes (Phase 8 extraction #14).
//
// 4 admin handlers managing the SMTP/email service configuration:
//
//   GET  /api/email-providers          (list of provider templates)
//   GET  /api/email-configuration      (decrypted for editing)
//   POST /api/email-configuration      (encrypts credentials and saves)
//   POST /api/email-configuration/test (sends a test email)
//   GET  /api/email-configuration/outlook-status (any signed-in user; booleans only)
//
// Credentials are encrypted-at-rest via encryptText/decryptText
// (auth/mfaUtils). The test endpoint dispatches via the same sendEmail
// helper used app-wide so the actual transporter path is exercised
// before the operator clicks Save.
import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { encryptText } from "../auth/mfaUtils";
import { sendEmail } from "../email/email";
import { getPublicAppUrl } from "../lib/app-config";
import { getCurrentFiscalYear, getCurrentFiscalQuarter } from "@shared/fiscal-utils";

export function registerEmailConfigurationRoutes(app: Express) {
  app.get("/api/email-providers", isAuthenticated, async (req: any, res) => {
    try {
      const { getEmailProviders } = await import('../email/email-providers');
      const providers = getEmailProviders();
      res.json(providers);
    } catch (error: any) {
      console.error("Error fetching email providers:", error);
      res.status(500).json({ message: "Failed to fetch email providers" });
    }
  });

  // GET /api/email-configuration/outlook-status
  // Any signed-in user: is outgoing mail sent through Outlook (Microsoft
  // Graph)? Feeds the "Outlook Connected" row in the sidebar footer, so it
  // returns booleans only, never the configuration itself.
  app.get("/api/email-configuration/outlook-status", isAuthenticated, async (_req: any, res) => {
    try {
      const config = await storage.getEmailConfiguration();
      const configured = !!config
        && config.authType === 'graph'
        && !!config.graphTenantId
        && !!config.graphClientId
        && !!config.graphSenderEmail;
      res.json({ configured, connected: configured && config.enabled !== false });
    } catch (error: any) {
      console.error('Error reading Outlook status:', error);
      res.status(500).json({ message: 'Failed to read Outlook status' });
    }
  });

  // GET /api/email-configuration - Get current email configuration (credentials decrypted for editing)
  app.get("/api/email-configuration", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can view email configuration" });
      }

      const config = await storage.getEmailConfiguration();
      
      if (!config) {
        return res.json(null);
      }

      // Decrypt SMTP credentials before sending to client (admin only).
      // Graph secret + certificate private key are NEVER sent in
      // plaintext — they're masked with the sentinel; the POST route
      // retains the stored value when it receives the sentinel back.
      const { decryptText } = await import('../auth/mfaUtils');
      res.json({
        ...config,
        username: config.username ? decryptText(config.username) : '',
        password: config.password ? decryptText(config.password) : '',
        graphClientSecret: config.graphClientSecret ? '••••••••' : '',
        graphCertificatePem: config.graphCertificatePem ? '••••••••' : '',
      });
    } catch (error: any) {
      console.error("Error fetching email configuration:", error);
      res.status(500).json({ message: "Failed to fetch email configuration" });
    }
  });

  // POST /api/email-configuration - Save email configuration (encrypts credentials)
  app.post("/api/email-configuration", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can configure email settings" });
      }

      const {
        enabled,
        provider,
        authType = 'smtp',
        server,
        port,
        fromAddress,
        replyToAddress,
        username,
        password,
        tls,
        startTLS,
        maxRetries,
        retryDelay,
        rateLimit,
        // Microsoft Graph fields
        graphTenantId,
        graphClientId,
        graphSenderEmail,
        graphCredentialType = 'secret',
        graphClientSecret,
        graphCertificatePem,
        graphCertificateThumbprint,
      } = req.body;

      // Always-required fields, then per-transport validation.
      // `provider` is only meaningful for SMTP (it drives the preset dropdown);
      // Graph mode has no provider preset so we accept an absent/empty value there.
      if (!fromAddress) {
        return res.status(400).json({ message: "Missing required fields: from address" });
      }
      if (authType !== 'graph' && !provider) {
        return res.status(400).json({ message: "Missing required fields: provider" });
      }
      if (authType === 'graph') {
        if (!graphTenantId || !graphClientId || !graphSenderEmail) {
          return res.status(400).json({ message: "Microsoft Graph requires Tenant ID, Client ID, and Sender mailbox" });
        }
        if (graphCredentialType === 'certificate') {
          if (!graphCertificateThumbprint) {
            return res.status(400).json({ message: "Certificate auth requires a certificate thumbprint" });
          }
        }
        // (client secret / cert key required-ness is enforced below
        //  combined with the sentinel-retain check, since an existing
        //  config may already hold the value.)
      } else {
        if (!server || !port || !username) {
          return res.status(400).json({ message: "SMTP requires server, port, and username" });
        }
      }

      const existing = await storage.getEmailConfiguration();

      // Encrypt a secret, retaining the stored value when the client
      // sends the masking sentinel (it never received the plaintext).
      const encryptSecret = (incoming: string | undefined | null, storedEncrypted: string | null | undefined): string | null => {
        if (incoming && incoming !== '••••••••') return encryptText(incoming);
        return storedEncrypted ?? null;
      };

      // SMTP credentials (only meaningful for authType=smtp, but kept
      // intact across a Graph save so switching back doesn't lose them).
      const encryptedUsername = username && username !== '••••••••' ? encryptText(username) : (existing?.username ?? null);
      const encryptedPassword = encryptSecret(password, existing?.password);

      // Graph credentials
      const encryptedGraphSecret = encryptSecret(graphClientSecret, existing?.graphClientSecret);
      const encryptedGraphCert = encryptSecret(graphCertificatePem, existing?.graphCertificatePem);

      // Final required-secret guard (now that sentinel-retain is resolved).
      if (authType === 'graph') {
        if (graphCredentialType === 'certificate' && !encryptedGraphCert) {
          return res.status(400).json({ message: "Certificate private key is required" });
        }
        if (graphCredentialType !== 'certificate' && !encryptedGraphSecret) {
          return res.status(400).json({ message: "Client secret is required" });
        }
      } else if (!encryptedPassword) {
        return res.status(400).json({ message: "Password / API key is required" });
      }

      const configData = {
        enabled: enabled !== undefined ? enabled : true,
        provider,
        authType,
        server: server || null,
        port: parseInt(port) || 587,
        fromAddress,
        replyToAddress: replyToAddress || null,
        username: encryptedUsername,
        password: encryptedPassword,
        tls: tls || false,
        startTLS: startTLS !== undefined ? startTLS : true,
        maxRetries: parseInt(maxRetries) || 3,
        retryDelay: parseInt(retryDelay) || 5,
        rateLimit: parseInt(rateLimit) || 60,
        graphTenantId: graphTenantId || null,
        graphClientId: graphClientId || null,
        graphSenderEmail: graphSenderEmail || null,
        graphCredentialType: graphCredentialType || 'secret',
        graphClientSecret: encryptedGraphSecret,
        graphCertificatePem: encryptedGraphCert,
        graphCertificateThumbprint: graphCertificateThumbprint || null,
        updatedBy: req.session.user.id,
        createdBy: req.session.user.id,
      };

      const savedConfig = await storage.upsertEmailConfiguration(configData);

      res.json({
        ...savedConfig,
        password: '••••••••', // Mask secrets in response
        graphClientSecret: savedConfig.graphClientSecret ? '••••••••' : '',
        graphCertificatePem: savedConfig.graphCertificatePem ? '••••••••' : '',
        restartRequired: true,
      });
    } catch (error: any) {
      console.error("Error saving email configuration:", error);
      res.status(500).json({ message: "Failed to save email configuration" });
    }
  });

  // POST /api/email-configuration/test - Send test email with current configuration
  app.post("/api/email-configuration/test", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can test email configuration" });
      }

      const { toEmail, templateId } = req.body;

      if (!toEmail) {
        return res.status(400).json({ message: "Recipient email address is required" });
      }

      let subject, text, html;

      // If templateId is provided, fetch and render the template with sample data
      if (templateId) {
        const template = await storage.getEmailTemplate(parseInt(templateId));
        
        if (!template) {
          return res.status(404).json({ message: "Email template not found" });
        }

        // Fetch fiscal config for date variable resolution.
        // systemSettings.value is a jsonb column — Drizzle returns it as
        // a parsed JS object, NOT a raw JSON string. Access .value directly;
        // do NOT JSON.parse() it (that would throw "[object Object]").
        const fiscalConfigSetting = await storage.getSystemSetting("fiscal_config");
        const fiscalConfig = (fiscalConfigSetting?.value as any) ??
          { displayMode: "calendar", fiscalYearStartMonth: 1, yearNamingOffset: 0 };

        // Generate sample data for template variables
        const sampleData = {
          projectName: "Acme Corp Technical Validation",
          customerName: "Acme Corporation",
          businessProblem: "Need to verify security compliance across hybrid infrastructure",
          solutionName: "Sample Solution",
          primaryEngineerEmail: "john.doe@example.com",
          primaryEngineerName: "John Doe",
          specialistEngineerEmail: "jane.smith@example.com",
          specialistEngineerName: "Jane Smith",
          supportingEngineerEmails: "alice.johnson@example.com;bob.wilson@example.com",
          supportingEngineerNames: "Alice Johnson, Bob Wilson",
          userName: req.session.user.firstName ? `${req.session.user.firstName} ${req.session.user.lastName || ''}`.trim() : req.session.user.email,
          userEmail: req.session.user.email,
          firstName: "Test",
          lastName: "User",
          userRole: "Engineer",
          recipientName: "Test User",
          recipientEmail: toEmail,
          projectStatus: "In Progress",
          projectUrl: `${getPublicAppUrl()}/project-detail/1`,
          dashboardUrl: `${getPublicAppUrl()}/dashboard`,
          taskName: "Configure audit policies",
          taskStatus: "pending",
          phaseName: "Implementation",
          stepName: "Initial Setup",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
          completionDate: new Date().toLocaleDateString(),
          assignedByName: req.session.user.firstName ? `${req.session.user.firstName} ${req.session.user.lastName || ''}`.trim() : "Admin",
          assignedToName: "Test User",
          assignedToEmail: toEmail,
          updatedByName: req.session.user.firstName ? `${req.session.user.firstName} ${req.session.user.lastName || ''}`.trim() : "Admin",
          oldStatus: "not_started",
          newStatus: "in_progress",
          priority: "high",
          milestoneName: "Phase 1 Complete",
          nextSteps: "Begin Phase 2 implementation",
          resetUrl: `${getPublicAppUrl()}/reset-password?token=sample-token`,
          supportEmail: (await storage.getBrandingSupportEmail()) ?? "support@example.com",
          completedByName: req.session.user.firstName ? `${req.session.user.firstName} ${req.session.user.lastName || ''}`.trim() : "Admin",
          targetName: "Implementation Phase",
          targetType: "phase",
          currentDate: new Date().toLocaleDateString(),
          currentYear: new Date().getFullYear().toString(),
          currentMonth: new Date().toLocaleString('default', { month: 'long' }),
          fiscalYear: getCurrentFiscalYear(fiscalConfig).toString(),
          fiscalQuarter: `Q${getCurrentFiscalQuarter(fiscalConfig)}`,
        };

        // Replace placeholders in subject, text, and HTML content
        const replacePlaceholders = (content: string, data: any): string => {
          let result = content;
          Object.keys(data).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, data[key] || '');
          });
          return result;
        };

        subject = `[TEST] ${replacePlaceholders(template.subject, sampleData)}`;
        text = replacePlaceholders(template.textContent || '', sampleData);
        
        // Process template content same as /api/email-templates/:id/send-test endpoint
        let finalHtmlContent = "";
        
        // New templates use emailContent, legacy templates use htmlContent
        if (template.emailContent) {
          // New template: wrap emailContent with Email Design if designId exists
          let content = template.emailContent;
          
          // Replace variables in content
          Object.entries(sampleData).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(regex, value);
          });

          // Wrap with Email Design if designId is specified
          if (template.designId) {
            const design = await storage.getEmailDesign(template.designId);
            if (design && design.htmlRaw) {
              // First, replace the body content placeholder
              let wrappedContent = design.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, content);
              // Then, process design variables (logo, footer, colors, etc.)
              const { processEmailDesignVariables } = await import('../email/email');
              finalHtmlContent = processEmailDesignVariables(wrappedContent, design.designVariables || {});
            } else {
              finalHtmlContent = content;
            }
          } else {
            finalHtmlContent = content;
          }
          
          // For new templates, use emailContent as text fallback if no textContent exists
          if (!text) {
            text = content; // Use the unwrapped content for text version
          }
        } else {
          // Legacy template: htmlContent already has the design wrapper baked in, use as-is
          finalHtmlContent = template.htmlContent || "";
          
          // Replace variables in content
          Object.entries(sampleData).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            finalHtmlContent = finalHtmlContent.replace(regex, value);
          });
        }

        html = finalHtmlContent;
      } else {
        // Generic test — look up the system template by key so it uses
        // the configured email design rather than hardcoded HTML. Fall back
        // to inline text only if the template row somehow doesn't exist yet.
        const genericTemplate = await storage.getEmailTemplateByKey('generic_configuration_test');
        if (genericTemplate) {
          subject = genericTemplate.subject;
          text = genericTemplate.textContent || "This is a test email from CriteriaIQ to verify your email configuration is working correctly.";
          const bodyHtml = genericTemplate.emailContent || genericTemplate.htmlContent ||
            "<p>This is a test email from <strong>CriteriaIQ</strong> to verify your email configuration is working correctly.</p>";
          if (genericTemplate.designId) {
            const design = await storage.getEmailDesign(genericTemplate.designId);
            if (design?.htmlRaw) {
              const { processEmailDesignVariables } = await import('../email/email');
              const merged = design.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, bodyHtml);
              html = processEmailDesignVariables(merged, design.designVariables || {});
            } else {
              html = bodyHtml;
            }
          } else {
            html = bodyHtml;
          }
        } else {
          subject = "[TEST] CriteriaIQ Email Configuration Test";
          text = "This is a test email from CriteriaIQ to verify your email configuration is working correctly.";
          html = "<p>This is a test email from <strong>CriteriaIQ</strong> to verify your email configuration is working correctly.</p>";
        }
      }

      // Use the configured fromAddress — fall back to a sentinel only if
      // no config exists yet (fresh install before any config is saved).
      const emailConfig = await storage.getEmailConfiguration();
      const fromAddress = emailConfig?.fromAddress || process.env.GMAIL_USER || 'noreply@example.com';

      const emailResult = await sendEmail({
        to: toEmail,
        from: fromAddress,
        subject,
        text,
        html,
        emailType: 'configuration_test',
        userId: req.session.user?.id,
        skipWrapper: templateId ? true : undefined, // Skip wrapper when using templates since Email Design is already applied above
      });

      res.json({
        success: emailResult.success,
        message: emailResult.success ? "Test email sent successfully" : "Failed to send test email",
        messageId: emailResult.messageId,
        error: emailResult.error,
        templateUsed: templateId ? true : false,
      });
    } catch (error: any) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // POST /api/email-configuration/verify-graph-credentials
  // Attempts OAuth token acquisition from Microsoft WITHOUT sending any email.
  // Delegates the actual token-acquisition + error-classification to
  // probeEmailSender() (server/email/email-sender.ts) — the same function
  // the System Health "Test Connection" button uses — so there is a single
  // source of truth for "is this Graph credential valid," covering both
  // client-secret AND certificate modes (this route previously
  // re-implemented token acquisition from scratch and explicitly rejected
  // certificate mode; that gap is closed by delegating here).
  // Logs the attempt to email_logs (emailType = 'credential_verification') so
  // it appears in the embedded email log panel and the full email-logs page.
  app.post("/api/email-configuration/verify-graph-credentials", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can verify email credentials" });
      }

      const config = await storage.getEmailConfiguration();
      if (!config) {
        return res.status(400).json({ message: "No email configuration saved. Save a Microsoft Graph configuration first." });
      }
      if ((config.authType ?? 'smtp') !== 'graph') {
        return res.status(400).json({ message: "Active authentication method is not Microsoft Graph. Switch to Graph mode first." });
      }
      if (!config.graphTenantId || !config.graphClientId) {
        return res.status(400).json({ message: "Tenant ID and Client ID are required." });
      }
      const credentialType = config.graphCredentialType ?? 'secret';
      if (credentialType === 'secret' && !config.graphClientSecret) {
        return res.status(400).json({ message: "Client secret is not configured." });
      }
      if (credentialType === 'certificate' && (!config.graphCertificatePem || !config.graphCertificateThumbprint)) {
        return res.status(400).json({ message: "Certificate private key and thumbprint are required." });
      }

      const { probeEmailSender } = await import('../email/email-sender');
      const probeResult = await probeEmailSender(config);

      // Log the verification attempt to email_logs so it appears in the
      // embedded panel alongside test emails.
      try {
        await storage.createEmailLog({
          toEmail: 'credential-verify',
          fromEmail: config.fromAddress || '',
          subject: '[VERIFY] Microsoft Graph Credential Check',
          textContent: '',
          htmlContent: '',
          emailType: 'credential_verification',
          userId: req.session.user?.id || null,
          projectId: null,
          success: probeResult.success,
          error: probeResult.success ? null : probeResult.message,
          messageId: `verify-${Date.now()}`,
        });
      } catch (logErr) {
        console.error('[email-config] Failed to log credential verification:', logErr);
      }

      if (probeResult.success) {
        return res.json({ success: true, message: probeResult.message });
      }

      return res.status(400).json({
        success: false,
        message: probeResult.message,
        errorCode: probeResult.errorCode,
      });
    } catch (error: any) {
      console.error('Error verifying Graph credentials:', error);
      res.status(500).json({ message: 'Failed to verify credentials', error: error.message });
    }
  });

  // GET /api/email-configuration/graph-token-status
  // Read-only view of the per-process Graph token cache — "is a token
  // currently cached, and when does it expire." No force-invalidate action
  // is offered (see getGraphTokenStatus's doc comment): the cache is
  // per-process, so an admin-triggered invalidation on one worker would
  // misleadingly appear to succeed while other workers keep the stale
  // token in a multi-worker deployment.
  app.get("/api/email-configuration/graph-token-status", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can view Graph token status" });
      }
      const config = await storage.getEmailConfiguration();
      if (!config || (config.authType ?? 'smtp') !== 'graph') {
        return res.json({ cached: false, expiresAt: null });
      }
      const { getGraphTokenStatus } = await import('../email/email-sender');
      res.json(getGraphTokenStatus(config));
    } catch (error: any) {
      console.error('Error reading Graph token status:', error);
      res.status(500).json({ message: 'Failed to read Graph token status' });
    }
  });
}
