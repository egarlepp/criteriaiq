// Admin AI Provider Configuration routes (Phase 8 extraction #11i).
//
// 8 admin-only handlers managing AI provider configurations
// (Anthropic / OpenAI / etc.) used by the assessment engine and other
// AI features:
//
//   GET    /api/admin/ai-providers
//   GET    /api/admin/ai-providers/defaults
//   GET    /api/admin/ai-providers/:id
//   POST   /api/admin/ai-providers
//   PUT    /api/admin/ai-providers/:id
//   DELETE /api/admin/ai-providers/:id
//   POST   /api/admin/ai-providers/:id/test
//   POST   /api/admin/ai-providers/:id/set-default
//
// All real work routes through the `aiProviderService` singleton
// (lazy-imported from ./ai/ai-provider-service.js) so encryption,
// rate limits, and provider-specific quirks live in one place.
import type { Express } from "express";
import { isAuthenticated } from "../auth/simpleAuth";

export function registerAdminAIProvidersRoutes(app: Express) {
  // GET /api/admin/ai-providers - Get all AI provider configurations
  app.get("/api/admin/ai-providers", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const configs = await aiProviderService.getAllConfigs();
      
      res.json({ configs });
    } catch (error: any) {
      console.error("Error fetching AI provider configs:", error);
      res.status(500).json({ message: "Failed to fetch AI provider configurations" });
    }
  });

  // GET /api/admin/ai-providers/defaults - Get provider defaults (models, etc.)
  app.get("/api/admin/ai-providers/defaults", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const defaults = aiProviderService.getProviderDefaults();
      
      res.json({ defaults });
    } catch (error: any) {
      console.error("Error fetching AI provider defaults:", error);
      res.status(500).json({ message: "Failed to fetch AI provider defaults" });
    }
  });

  // GET /api/admin/ai-providers/:id - Get a specific AI provider configuration
  app.get("/api/admin/ai-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const config = await aiProviderService.getConfig(parseInt(req.params.id as string));
      
      if (!config) {
        return res.status(404).json({ message: "AI provider configuration not found" });
      }
      
      res.json({ config });
    } catch (error: any) {
      console.error("Error fetching AI provider config:", error);
      res.status(500).json({ message: "Failed to fetch AI provider configuration" });
    }
  });

  // POST /api/admin/ai-providers - Create a new AI provider configuration
  app.post("/api/admin/ai-providers", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { provider, displayName, apiKey, apiEndpoint, organizationId, defaultModel, availableModels, maxTokens, temperature, isActive, isDefault } = req.body;

      if (!provider) {
        return res.status(400).json({ message: "Provider is required" });
      }
      // Webhook provider is the one exception to the
      // "API key required" rule: operators may secure their n8n
      // webhook by IP allowlist, mutual TLS, or just keep the URL
      // secret — no Authorization header at all. Every other
      // provider requires a key because they hit a vendor REST API
      // that mandates one.
      if (provider !== 'webhook' && !apiKey) {
        return res.status(400).json({ message: "API key is required for this provider" });
      }
      if (provider === 'webhook' && !apiEndpoint) {
        return res.status(400).json({ message: "Webhook providers require an Endpoint URL" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const config = await aiProviderService.createConfig({
        provider,
        displayName,
        apiKey,
        apiEndpoint,
        organizationId,
        defaultModel,
        availableModels,
        maxTokens,
        temperature,
        isActive: isActive ?? true,
        isDefault: isDefault ?? false,
        createdBy: req.session.user.id,
      });
      
      res.status(201).json({ config });
    } catch (error: any) {
      console.error("Error creating AI provider config:", error);
      res.status(500).json({ message: "Failed to create AI provider configuration" });
    }
  });

  // PUT /api/admin/ai-providers/:id - Update an AI provider configuration
  app.put("/api/admin/ai-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const config = await aiProviderService.updateConfig(parseInt(req.params.id as string), req.body);
      
      if (!config) {
        return res.status(404).json({ message: "AI provider configuration not found" });
      }
      
      res.json({ config });
    } catch (error: any) {
      console.error("Error updating AI provider config:", error);
      res.status(500).json({ message: "Failed to update AI provider configuration" });
    }
  });

  // DELETE /api/admin/ai-providers/:id - Delete an AI provider configuration
  app.delete("/api/admin/ai-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const deleted = await aiProviderService.deleteConfig(parseInt(req.params.id as string));
      
      if (!deleted) {
        return res.status(404).json({ message: "AI provider configuration not found" });
      }
      
      res.json({ success: true, message: "AI provider configuration deleted" });
    } catch (error: any) {
      console.error("Error deleting AI provider config:", error);
      res.status(500).json({ message: "Failed to delete AI provider configuration" });
    }
  });

  // POST /api/admin/ai-providers/:id/test - Test AI provider connection
  app.post("/api/admin/ai-providers/:id/test", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const result = await aiProviderService.testConnection(parseInt(req.params.id as string));
      
      res.json(result);
    } catch (error: any) {
      console.error("Error testing AI provider connection:", error);
      res.status(500).json({ message: "Failed to test connection" });
    }
  });

  // POST /api/admin/ai-providers/:id/set-default - Set provider as default
  app.post("/api/admin/ai-providers/:id/set-default", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { aiProviderService } = await import('../ai/ai-provider-service.js');
      const config = await aiProviderService.setAsDefault(parseInt(req.params.id as string));
      
      if (!config) {
        return res.status(404).json({ message: "AI provider configuration not found" });
      }
      
      res.json({ config, message: "Provider set as default" });
    } catch (error: any) {
      console.error("Error setting AI provider as default:", error);
      res.status(500).json({ message: "Failed to set provider as default" });
    }
  });
}
