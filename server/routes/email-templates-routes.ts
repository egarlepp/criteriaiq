// Email Templates routes (Phase 8 extraction #19).
//
// 10 admin handlers managing the email-template library used by all
// outgoing system mail:
//
//   POST   /api/email-templates/preview                 (preview with design merge)
//   GET    /api/email-templates/for-announcements
//   GET    /api/email-templates
//   GET    /api/email-templates/:id
//   GET    /api/email-templates/key/:templateKey
//   POST   /api/email-templates
//   PUT    /api/email-templates/:id
//   DELETE /api/email-templates/:id
//   GET    /api/email-templates/:id/preview
//   POST   /api/email-templates/:id/send-test
//
// IMPORTANT: Specific routes (`/preview`, `/for-announcements`,
// `/key/:templateKey`) are registered before `/:id` so Express picks
// the static path first.
//
// Templates use a 2-stage rendering pipeline: an unwrapped emailContent
// (the meaningful body) gets merged with the active emailDesign (the
// HTML chrome) at preview/send time. Legacy templates that pre-date
// emailDesign just have htmlContent as-is.
import type { Express } from "express";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../storage";
import { emailTemplates, insertEmailTemplateSchema } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { sendEmail, wrapEmailContent } from "../email/email";
import { getPublicAppUrl } from "../lib/app-config";

export function registerEmailTemplatesRoutes(app: Express) {
  // Email Template preview with design merge
  app.post("/api/email-templates/preview", isAuthenticated, async (req: any, res) => {
    try {
      const { designId, emailContent } = req.body;

      let finalHtmlContent = emailContent || "";

      // If design is specified, wrap emailContent with the Email Design wrapper
      if (designId && emailContent) {
        const design = await storage.getEmailDesign(designId);
        if (design && design.htmlRaw) {
          // Replace {{BODY_TEXT_CONTENT}} placeholder with the actual email content
          let wrappedContent = design.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, emailContent);
          // Process design variables (logo, header color, footer text, etc.)
          const { processEmailDesignVariables } = await import('../email/email');
          finalHtmlContent = processEmailDesignVariables(wrappedContent, design.designVariables || {});
        }
      }

      // Return the final HTML with all design variables resolved
      res.json({ html: finalHtmlContent });
    } catch (error: any) {
      console.error("Error generating email preview:", error);
      res.status(500).json({ message: "Failed to generate email preview" });
    }
  });

  // Email Template API routes
  
  // GET /api/email-templates/for-announcements - Get email templates suitable for announcements
  // IMPORTANT: This route must be defined BEFORE /api/email-templates/:id to avoid the :id param matching "for-announcements"
  app.get("/api/email-templates/for-announcements", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const templates = await storage.db
        .select({
          id: emailTemplates.id,
          name: emailTemplates.name,
          templateKey: emailTemplates.templateKey,
          category: emailTemplates.category,
          subject: emailTemplates.subject,
          isActive: emailTemplates.isActive,
        })
        .from(emailTemplates)
        .where(eq(emailTemplates.isActive, true))
        .orderBy(emailTemplates.name);

      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching email templates for announcements:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });
  
  app.get("/api/email-templates", isAuthenticated, async (req: any, res) => {
    try {
      console.log('API: Fetching email templates...');
      const { category } = req.query;

      let templates;
      if (category) {
        templates = await storage.getEmailTemplatesByCategory(category as string);
      } else {
        templates = await storage.getEmailTemplates();
      }

      // Ensure we always return an array, even if empty
      templates = templates || [];

      console.log(`API: Returning ${templates.length} email templates`);
      if (templates.length > 0) {
        console.log("Template names:", templates.map(t => t.name));
      } else {
        console.log("No email templates found - this may be expected for new installations");
      }

      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching email templates:", error);

      // Return empty array instead of error for missing templates table
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        console.log("Email templates table doesn't exist yet - returning empty array");
        return res.json([]);
      }

      res.status(500).json({
        message: "Failed to fetch email templates",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get("/api/email-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getEmailTemplate(parseInt(req.params.id as string));
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }
      res.json(template);
    } catch (error: any) {
      console.error("Error fetching email template:", error);
      res.status(500).json({ message: "Failed to fetch email template" });
    }
  });

  app.get("/api/email-templates/key/:templateKey", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getEmailTemplateByKey(req.params.templateKey as string);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }
      res.json(template);
    } catch (error: any) {
      console.error("Error fetching email template by key:", error);
      res.status(500).json({ message: "Failed to fetch email template" });
    }
  });

  app.post("/api/email-templates", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permissions
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can create email templates" });
      }

      let templateData = {
        ...req.body,
        createdBy: req.session.user.id,
        updatedBy: req.session.user.id,
      };

      // If design_id and text_content are provided but html_content is missing, merge them
      if (templateData.designId && templateData.textContent && !templateData.htmlContent) {
        const design = await storage.getEmailDesign(templateData.designId);
        if (design) {
          templateData.htmlContent = design.htmlRaw.replace(/\{\{TEXT_CONTENT\}\}/g, templateData.textContent);
        }
      }

      // Sanitize HTML content
      if (templateData.htmlContent) {
        templateData.htmlContent = templateData.htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }

      const template = await storage.createEmailTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating email template:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create email template" });
    }
  });

  app.put("/api/email-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permissions
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can update email templates" });
      }

      let updates = {
        ...req.body,
        updatedBy: req.session.user.id,
      };

      // If design_id and text_content are provided but html_content is missing, merge them
      if (updates.designId && updates.textContent && !updates.htmlContent) {
        const design = await storage.getEmailDesign(updates.designId);
        if (design) {
          updates.htmlContent = design.htmlRaw.replace(/\{\{TEXT_CONTENT\}\}/g, updates.textContent);
        }
      }

      // Sanitize HTML content
      if (updates.htmlContent) {
        updates.htmlContent = updates.htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }

      const template = await storage.updateEmailTemplate(parseInt(req.params.id as string), updates);
      res.json(template);
    } catch (error: any) {
      console.error("Error updating email template:", error);
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  app.delete("/api/email-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permissions
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can delete email templates" });
      }

      await storage.deleteEmailTemplate(parseInt(req.params.id as string));
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting email template:", error);
      res.status(500).json({ message: "Failed to delete email template" });
    }
  });

  // Get preview of email template with header and sample data
  app.get("/api/email-templates/:id/preview", isAuthenticated, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id as string);

      // Get the email template
      const template = await storage.getEmailTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }

      // Replace template variables with sample/test data
      const sampleData = {
        "{{projectName}}": "Sample Project",
        "{{customerName}}": "Test Customer",
        "{{primaryEngineer}}": "John Doe",
        "{{specialistEngineer}}": "Jane Smith",
        "{{projectStatus}}": "In Progress",
        "{{startDate}}": new Date().toLocaleDateString(),
        "{{endDate}}": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        "{{userName}}": "Test User",
        "{{userEmail}}": "preview@example.com",
        "{{userRole}}": "Engineer",
        "{{firstName}}": "Test",
        "{{lastName}}": "User",
        "{{dashboardUrl}}": `${getPublicAppUrl()}/dashboard`,
        "{{projectUrl}}": `${getPublicAppUrl()}/projects/sample`,
        "{{supportEmail}}": (await storage.getBrandingSupportEmail()) ?? "support@example.com",
        "{{resetUrl}}": `${getPublicAppUrl()}/reset-password?token=sample-token`
      };

      let subject = template.subject;
      let finalHtmlContent = "";

      // New templates use emailContent, legacy templates use htmlContent
      if (template.emailContent) {
        // New template: wrap emailContent with Email Design if designId exists
        let content = template.emailContent;
        
        // Replace variables in content
        Object.entries(sampleData).forEach(([variable, value]) => {
          const regex = new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          content = content.replace(regex, value);
        });

        // Wrap with Email Design. If the template explicitly carries a
        // designId, use that. If it's null (e.g. a template the seeder
        // hasn't healed yet, or an admin who explicitly cleared the
        // selection but still expects branding), fall back to the active
        // default design so the preview never renders unwrapped — same
        // contract as the live send pipeline in `server/email/email.ts`.
        const { processEmailDesignVariables } = await import('../email/email');
        const design = template.designId
          ? await storage.getEmailDesign(template.designId)
          : await storage.getDefaultEmailDesign();
        if (design && design.htmlRaw) {
          let wrappedContent = design.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, content);
          finalHtmlContent = processEmailDesignVariables(wrappedContent, design.designVariables || {});
        } else {
          finalHtmlContent = content;
        }
      } else {
        // Legacy template: htmlContent already has the design wrapper baked in, use as-is
        finalHtmlContent = template.htmlContent || "";
        
        // Replace variables in content
        Object.entries(sampleData).forEach(([variable, value]) => {
          const regex = new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          finalHtmlContent = finalHtmlContent.replace(regex, value);
        });
      }

      // Replace variables in subject
      Object.entries(sampleData).forEach(([variable, value]) => {
        const regex = new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        subject = subject.replace(regex, value);
      });

      res.json({
        subject: subject,
        htmlContent: finalHtmlContent
      });
    } catch (error: any) {
      console.error("Error getting email template preview:", error);
      res.status(500).json({ message: "Failed to get email template preview" });
    }
  });

  // Send test email using template
  app.post("/api/email-templates/:id/send-test", isAuthenticated, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      const { emailAddress } = req.body;

      if (!emailAddress) {
        return res.status(400).json({ message: "Email address is required" });
      }

      // Get the email template
      const template = await storage.getEmailTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }

      // Replace template variables with sample/test data
      const sampleData = {
        "{{projectName}}": "Sample Project",
        "{{customerName}}": "Test Customer",
        "{{primaryEngineer}}": "John Doe",
        "{{specialistEngineer}}": "Jane Smith",
        "{{projectStatus}}": "In Progress",
        "{{startDate}}": new Date().toLocaleDateString(),
        "{{endDate}}": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        "{{userName}}": "Test User",
        "{{userEmail}}": emailAddress,
        "{{userRole}}": "Engineer",
        "{{firstName}}": "Test",
        "{{lastName}}": "User",
        "{{dashboardUrl}}": `${getPublicAppUrl()}/dashboard`,
        "{{projectUrl}}": `${getPublicAppUrl()}/projects/sample`,
        "{{supportEmail}}": (await storage.getBrandingSupportEmail()) ?? "support@example.com",
        "{{resetUrl}}": `${getPublicAppUrl()}/reset-password?token=sample-token`
      };

      let subject = template.subject;
      let textContent = template.textContent || ""; // Legacy text content fallback
      let finalHtmlContent = "";

      // New templates use emailContent, legacy templates use htmlContent
      if (template.emailContent) {
        // New template: wrap emailContent with Email Design if designId exists
        let content = template.emailContent;
        
        // Replace variables in content
        Object.entries(sampleData).forEach(([variable, value]) => {
          const regex = new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          content = content.replace(regex, value);
        });

        // Wrap with Email Design — same fallback contract as the preview
        // and the live send pipeline. If the template's designId is null,
        // use the active default design so test-sends never go out
        // unwrapped.
        const { processEmailDesignVariables } = await import('../email/email');
        const design = template.designId
          ? await storage.getEmailDesign(template.designId)
          : await storage.getDefaultEmailDesign();
        if (design && design.htmlRaw) {
          let wrappedContent = design.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, content);
          finalHtmlContent = processEmailDesignVariables(wrappedContent, design.designVariables || {});
        } else {
          finalHtmlContent = content;
        }

        // For new templates, use emailContent as text fallback if no textContent exists
        if (!textContent) {
          textContent = content; // Use the unwrapped content for text version
        }
      } else {
        // Legacy template: htmlContent already has the design wrapper baked in, use as-is
        finalHtmlContent = template.htmlContent || "";
        
        // Replace variables in content
        Object.entries(sampleData).forEach(([variable, value]) => {
          const regex = new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          finalHtmlContent = finalHtmlContent.replace(regex, value);
        });
      }

      // Replace variables in subject and textContent
      Object.entries(sampleData).forEach(([variable, value]) => {
        const regex = new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        subject = subject.replace(regex, value);
        if (textContent) {
          textContent = textContent.replace(regex, value);
        }
      });

      // Add test email notice to content
      const testNotice = "\n\n--- TEST EMAIL ---\nThis is a test email sent from the Email Templates system. Template variables have been replaced with sample data.";
      const htmlTestNotice = "<div style='margin-top: 20px; padding: 10px; background-color: #f0f0f0; border-left: 4px solid #007bff; font-size: 12px; color: #666;'><strong>TEST EMAIL</strong><br>This is a test email sent from the Email Templates system. Template variables have been replaced with sample data.</div>";

      if (textContent) {
        textContent += testNotice;
      }
      if (finalHtmlContent) {
        finalHtmlContent += htmlTestNotice;
      }

      // Use the configured fromAddress so test emails match what real sends use.
      const emailConfig = await storage.getEmailConfiguration();
      const fromAddress = emailConfig?.fromAddress || process.env.GMAIL_USER || 'noreply@example.com';

      // Send the test email - skip wrapper since Email Design is already applied above.
      // Do NOT pass a hardcoded projectId: email_logs.project_id has a FK reference to
      // projects.id; if the hardcoded ID doesn't exist in the DB the createEmailLog
      // INSERT throws a constraint violation that is caught silently, meaning the send
      // succeeds but no log entry is written. Test emails have no real project context.
      const emailResult = await sendEmail({
        to: emailAddress,
        from: fromAddress,
        subject: `[TEST] ${subject}`,
        text: textContent || undefined,
        html: finalHtmlContent,
        emailType: 'template_test',
        userId: req.session.user?.id,
        skipWrapper: true // Email Design wrapper already applied above if designId was specified
      });

      res.json({
        success: emailResult.success,
        message: emailResult.success ? "Test email sent successfully" : "Failed to send test email",
        messageId: emailResult.messageId,
        error: emailResult.error
      });
    } catch (error: any) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });
}
