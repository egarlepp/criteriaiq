import { storage } from '../storage.js';
import { eq, and, desc } from 'drizzle-orm';
import { encryptText, decryptText } from '../auth/mfaUtils.js';
import { isCurrentRequestDemo } from '../lib/demo-mode.js';
import type { AIProviderConfig, InsertAIProviderConfig, AIProviderType } from '@shared/schema';
import { assertOutboundUrl } from '../lib/outbound-url';

interface AIProviderConfigResponse {
  id: number;
  provider: string;
  displayName: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  apiEndpoint: string | null;
  organizationId: string | null;
  defaultModel: string | null;
  availableModels: string[];
  maxTokens: number | null;
  temperature: string | null;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  lastTestError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  model?: string;
  latency?: number;
  error?: string;
}

// Curated suggestions per provider, newest first. The model field in the UI
// is free-text, so admins can always type a model not listed here.
// Verified against each vendor's model docs on 2026-11-02:
//   OpenAI      https://developers.openai.com/api/docs/models
//   Gemini      https://ai.google.dev/gemini-api/docs/models
//   Anthropic   https://platform.claude.com/docs/en/about-claude/models/overview
//   xAI         https://docs.x.ai/docs/models
//   Azure       https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
// Update this list as providers ship new releases.
export const PROVIDER_DEFAULTS: Record<string, { displayName: string; models: string[]; defaultModel: string }> = {
  openai: {
    displayName: 'OpenAI',
    models: [
      'gpt-6-astra',   // flagship: complex reasoning and coding
      'gpt-6.1-sol',   // balanced cost / intelligence
      'gpt-6.1-terra', // newest 6.1 tier
      'gpt-6-luna',    // high-volume, cost-sensitive
    ],
    defaultModel: 'gpt-6-astra',
  },
  gemini: {
    displayName: 'Google Gemini',
    models: [
      'gemini-3.8-flash',       // recommended for new projects
      'gemini-4-argon',         // flagship reasoning
      'gemini-3.6-flash',       // previous Flash
      'gemini-3.5-flash-lite',  // fastest / cheapest
      'gemini-3.1-pro-preview', // Pro (preview)
      'gemini-2.5-pro',         // legacy, still served
    ],
    defaultModel: 'gemini-3.8-flash',
  },
  anthropic: {
    displayName: 'Anthropic',
    models: [
      'claude-opus-5-5',   // current Opus (recommended default)
      'claude-sonnet-5-5', // current Sonnet: faster, cheaper
      'claude-haiku-5-5',  // current Haiku: fastest, cheapest
      'claude-fable-5-1',  // most capable, premium price
      'claude-opus-5',     // previous Opus
      'claude-sonnet-5',   // previous Sonnet
    ],
    defaultModel: 'claude-opus-5-5',
  },
  xai: {
    displayName: 'xAI (Grok)',
    models: [
      'grok-4.7',       // flagship
      'grok-4.3',       // previous flagship
      'grok-4.20',      // older generation
      'grok-build-0.1', // agentic coding (early access)
    ],
    defaultModel: 'grok-4.7',
  },
  azure_openai: {
    displayName: 'Azure OpenAI',
    // For Azure the "model" is your DEPLOYMENT name; these are the
    // model names Azure deploys under by default.
    models: [
      'gpt-6-astra',   // flagship
      'gpt-6.1-sol',   // balanced
      'gpt-6.1-terra', // newest 6.1 tier
      'gpt-6-luna',    // cost-sensitive
      'gpt-5.6-sol',   // previous generation
      'gpt-5.5',       // previous generation
    ],
    defaultModel: 'gpt-6-astra',
  },
  webhook: {
    displayName: 'Webhook',
    // "Model" for a webhook provider is passed through to the
    // downstream system (n8n / Lambda / whatever) verbatim. We list
    // common values the operator might want to route on, but they
    // can type anything — the receiving workflow decides what to do
    // with it.
    models: [
      'default',
      'gpt-6-astra',
      'claude-opus-5-5',
      'gemini-3.8-flash',
      'grok-4.7',
      'azure-ai-foundry',
    ],
    defaultModel: 'default',
  },
};

/** Fallback model when a saved config has no default model. */
export function defaultModelFor(provider: string): string {
  return PROVIDER_DEFAULTS[provider]?.defaultModel ?? 'default';
}

/**
 * Decrypts a stored API key without throwing. A row whose key cannot be
 * decrypted (plaintext placeholder from an older demo seed, a key written
 * under a rotated ENCRYPTION_KEY, a corrupted value) must not take down
 * the whole provider list: one bad row used to 500 GET
 * /api/admin/ai-providers and leave the page spinning.
 */
function tryDecryptApiKey(stored: string | null | undefined): { key: string; readable: boolean } {
  if (!stored || stored.length === 0) return { key: '', readable: true };
  try {
    return { key: decryptText(stored), readable: true };
  } catch {
    return { key: '', readable: false };
  }
}

/**
 * Azure OpenAI data-plane API version. 2024-10-21 is the GA version that
 * accepts `max_completion_tokens`, which the GPT-5/GPT-6 reasoning
 * deployments require (they reject `max_tokens`).
 */
export const AZURE_OPENAI_API_VERSION = '2024-10-21';

/**
 * Model families whose Chat Completions endpoint rejects a non-default
 * `temperature` (OpenAI o-series and the GPT-5.x reasoning models).
 * GPT-4.x and the GPT-6 family accept it.
 */
export function openAIModelAcceptsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5)/i.test(model.trim());
}

const UNREADABLE_KEY_MESSAGE =
  'The saved API key cannot be read (it was stored under a different encryption key or is not encrypted). Edit this provider and enter the API key again.';

/**
 * Demo isolation for AI providers. Providers are system settings, not
 * customer records: in Demo Mode, admins still see (and use) the real
 * providers alongside the demo stub; outside Demo Mode the demo stub
 * stays hidden.
 */
function providerVisibilityFilter() {
  return isCurrentRequestDemo() ? undefined : eq(storage.schema.aiProviderConfigs.isDemo, false);
}

class AIProviderService {
  private static instance: AIProviderService;

  private constructor() {}

  public static getInstance(): AIProviderService {
    if (!AIProviderService.instance) {
      AIProviderService.instance = new AIProviderService();
    }
    return AIProviderService.instance;
  }

  public getProviderDefaults() {
    return PROVIDER_DEFAULTS;
  }

  public async getAllConfigs(): Promise<AIProviderConfigResponse[]> {
    // Task #723 — demo isolation
    const configs = await storage.db
      .select()
      .from(storage.schema.aiProviderConfigs)
      .where(providerVisibilityFilter())
      .orderBy(desc(storage.schema.aiProviderConfigs.isDefault), storage.schema.aiProviderConfigs.displayName);

    return configs.map(this.maskConfig);
  }

  public async getConfig(id: number): Promise<AIProviderConfigResponse | null> {
    const [config] = await storage.db
      .select()
      .from(storage.schema.aiProviderConfigs)
      .where(eq(storage.schema.aiProviderConfigs.id, id))
      .limit(1);

    if (!config) return null;
    return this.maskConfig(config);
  }

  public async getDefaultConfig(): Promise<AIProviderConfig | null> {
    const [config] = await storage.db
      .select()
      .from(storage.schema.aiProviderConfigs)
      .where(
        and(
          eq(storage.schema.aiProviderConfigs.isDefault, true),
          eq(storage.schema.aiProviderConfigs.isActive, true)
        )
      )
      .limit(1);

    if (!config) return null;

    // Webhook providers may store an empty apiKey (see createConfig).
    const { key, readable } = tryDecryptApiKey(config.apiKey);
    if (!readable) throw new Error(`${config.displayName}: ${UNREADABLE_KEY_MESSAGE}`);
    return { ...config, apiKey: key };
  }

  public async getActiveConfigByProvider(provider: string): Promise<AIProviderConfig | null> {
    const [config] = await storage.db
      .select()
      .from(storage.schema.aiProviderConfigs)
      .where(
        and(
          eq(storage.schema.aiProviderConfigs.provider, provider),
          eq(storage.schema.aiProviderConfigs.isActive, true)
        )
      )
      .limit(1);

    if (!config) return null;

    // Empty webhook bearer is legitimate — tryDecryptApiKey passes it through.
    const { key, readable } = tryDecryptApiKey(config.apiKey);
    if (!readable) throw new Error(`${config.displayName}: ${UNREADABLE_KEY_MESSAGE}`);
    return { ...config, apiKey: key };
  }

  public async createConfig(data: InsertAIProviderConfig): Promise<AIProviderConfigResponse> {
    // Webhook providers may omit the bearer token entirely (IP allowlist /
    // mTLS / shared-secret-in-URL deployments). Store empty string as-is
    // so the at-rest encryption envelope only wraps real secrets.
    const encryptedApiKey = data.apiKey && data.apiKey.length > 0 ? encryptText(data.apiKey) : '';

    if (data.isDefault) {
      await this.clearDefaultFlag();
    }

    const [config] = await storage.db
      .insert(storage.schema.aiProviderConfigs)
      // Not demo-tagged even when created during Demo Mode: a provider
      // is real configuration (a real API key) and must survive the demo
      // wipe and stay visible once Demo Mode is turned off.
      .values({
        ...data,
        apiKey: encryptedApiKey,
        displayName: data.displayName || PROVIDER_DEFAULTS[data.provider]?.displayName || data.provider,
        defaultModel: data.defaultModel || PROVIDER_DEFAULTS[data.provider]?.defaultModel,
        availableModels: data.availableModels || PROVIDER_DEFAULTS[data.provider]?.models || [],
      } as typeof storage.schema.aiProviderConfigs.$inferInsert)
      .returning();

    return this.maskConfig(config);
  }

  public async updateConfig(id: number, data: Partial<InsertAIProviderConfig>): Promise<AIProviderConfigResponse | null> {
    const updateData: any = { ...data, updatedAt: new Date() };

    // For webhook providers the operator can intentionally CLEAR the
    // bearer token (move from "secured by bearer" to "secured by IP
    // allowlist"). `undefined` means "leave existing value alone";
    // an empty string means "clear it". Both are valid.
    if (data.apiKey !== undefined) {
      updateData.apiKey = data.apiKey.length > 0 ? encryptText(data.apiKey) : '';
    }

    if (data.isDefault) {
      await this.clearDefaultFlag();
    }

    const [config] = await storage.db
      .update(storage.schema.aiProviderConfigs)
      .set(updateData)
      .where(eq(storage.schema.aiProviderConfigs.id, id))
      .returning();

    if (!config) return null;
    return this.maskConfig(config);
  }

  public async deleteConfig(id: number): Promise<boolean> {
    const result = await storage.db
      .delete(storage.schema.aiProviderConfigs)
      .where(eq(storage.schema.aiProviderConfigs.id, id))
      .returning();

    return result.length > 0;
  }

  public async setAsDefault(id: number): Promise<AIProviderConfigResponse | null> {
    await this.clearDefaultFlag();

    const [config] = await storage.db
      .update(storage.schema.aiProviderConfigs)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(storage.schema.aiProviderConfigs.id, id))
      .returning();

    if (!config) return null;
    return this.maskConfig(config);
  }

  public async testConnection(id: number): Promise<TestConnectionResult> {
    const [config] = await storage.db
      .select()
      .from(storage.schema.aiProviderConfigs)
      .where(eq(storage.schema.aiProviderConfigs.id, id))
      .limit(1);

    if (!config) {
      return { success: false, message: 'Configuration not found', error: 'NOT_FOUND' };
    }

    // Webhook providers may store an empty apiKey (when secured by
    // IP allowlist instead of bearer); tryDecryptApiKey passes it through.
    const { key: decryptedKey, readable } = tryDecryptApiKey(config.apiKey);
    if (!readable) {
      const failure = { success: false, message: 'Connection test failed', error: UNREADABLE_KEY_MESSAGE };
      await storage.db
        .update(storage.schema.aiProviderConfigs)
        .set({ lastTestedAt: new Date(), lastTestResult: 'failed', lastTestError: failure.error, updatedAt: new Date() })
        .where(eq(storage.schema.aiProviderConfigs.id, id));
      return failure;
    }
    const model = config.defaultModel || defaultModelFor(config.provider);
    const startTime = Date.now();

    try {
      let result: TestConnectionResult;

      switch (config.provider) {
        case 'openai':
          result = await this.testOpenAI(decryptedKey, model);
          break;
        case 'gemini':
          result = await this.testGemini(decryptedKey, model);
          break;
        case 'anthropic':
          result = await this.testAnthropic(decryptedKey, model);
          break;
        case 'xai':
          result = await this.testXAI(decryptedKey, model);
          break;
        case 'azure_openai':
          result = await this.testAzureOpenAI(decryptedKey, config.apiEndpoint, model);
          break;
        case 'webhook':
          result = await this.testWebhook(decryptedKey, config.apiEndpoint, model);
          break;
        default:
          result = { success: false, message: `Unknown provider: ${config.provider}`, error: 'UNKNOWN_PROVIDER' };
      }

      result.latency = Date.now() - startTime;

      await storage.db
        .update(storage.schema.aiProviderConfigs)
        .set({
          lastTestedAt: new Date(),
          lastTestResult: result.success ? 'success' : 'failed',
          lastTestError: result.error || null,
          updatedAt: new Date(),
        })
        .where(eq(storage.schema.aiProviderConfigs.id, id));

      return result;
    } catch (error: any) {
      const errorResult = {
        success: false,
        message: 'Connection test failed',
        error: error.message || 'Unknown error',
        latency: Date.now() - startTime,
      };

      await storage.db
        .update(storage.schema.aiProviderConfigs)
        .set({
          lastTestedAt: new Date(),
          lastTestResult: 'failed',
          lastTestError: error.message,
          updatedAt: new Date(),
        })
        .where(eq(storage.schema.aiProviderConfigs.id, id));

      return errorResult;
    }
  }

  private async testOpenAI(apiKey: string, model: string): Promise<TestConnectionResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "test successful" in exactly 2 words.' }],
        // Reasoning models (gpt-5+, gpt-6, o-series) reject `max_tokens`;
        // `max_completion_tokens` is accepted by every chat model.
        max_completion_tokens: 32,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return { success: true, message: 'OpenAI connection successful', model };
  }

  private async testGemini(apiKey: string, model: string): Promise<TestConnectionResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "test successful" in exactly 2 words.' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return { success: true, message: 'Gemini connection successful', model };
  }

  private async testAnthropic(apiKey: string, model: string): Promise<TestConnectionResult> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Say "test successful" in exactly 2 words.' }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return { success: true, message: 'Anthropic connection successful', model };
  }

  private async testXAI(apiKey: string, model: string): Promise<TestConnectionResult> {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "test successful" in exactly 2 words.' }],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return { success: true, message: 'xAI connection successful', model };
  }

  private async testAzureOpenAI(apiKey: string, endpoint: string | null, model: string): Promise<TestConnectionResult> {
    if (!endpoint) {
      throw new Error('Azure OpenAI requires an endpoint URL');
    }

    const url = `${endpoint}/openai/deployments/${model}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
    await assertOutboundUrl(url, { requireHttps: true });
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "test successful" in exactly 2 words.' }],
        max_completion_tokens: 32,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return { success: true, message: 'Azure OpenAI connection successful', model };
  }

  /**
   * Verifies the webhook endpoint is reachable AND speaks the
   * documented contract (returns `{ content: string, ... }`).
   *
   * We pass the same minimal "say test successful" prompt the other
   * vendor-specific testers use so the operator's downstream system
   * pays the lowest possible cost on the round-trip. apiKey is
   * optional — empty string means "do not send Authorization header,"
   * which matches the IP-allowlist deployment mode.
   */
  private async testWebhook(apiKey: string, endpoint: string | null, model: string): Promise<TestConnectionResult> {
    if (!endpoint) {
      throw new Error('Webhook provider requires an Endpoint URL');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey.length > 0) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    await assertOutboundUrl(endpoint);
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers,
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "test successful" in exactly 2 words.' }],
        model,
        maxTokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error || err?.message;
      throw new Error(typeof msg === 'string' && msg.length > 0 ? msg : `HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data.content !== 'string') {
      throw new Error(
        'Webhook responded 2xx but the body is missing the required `content` field. ' +
          'Confirm your workflow ends with a Respond-to-Webhook node returning { "content": "...", "model": "...", "usage": { ... } }.',
      );
    }

    return { success: true, message: 'Webhook connection successful', model };
  }

  private async clearDefaultFlag(): Promise<void> {
    await storage.db
      .update(storage.schema.aiProviderConfigs)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(storage.schema.aiProviderConfigs.isDefault, true));
  }

  private maskConfig(config: AIProviderConfig): AIProviderConfigResponse {
    // Never throws: one unreadable row must not break the whole list.
    const { key: decryptedKey, readable } = tryDecryptApiKey(config.apiKey);
    const maskedKey = !readable
      ? '••••••••'
      : decryptedKey
        ? `${decryptedKey.slice(0, 4)}${'*'.repeat(Math.max(0, decryptedKey.length - 8))}${decryptedKey.slice(-4)}`
        : '';

    return {
      id: config.id,
      provider: config.provider,
      displayName: config.displayName,
      apiKeyMasked: maskedKey,
      hasApiKey: !!config.apiKey,
      apiEndpoint: config.apiEndpoint,
      organizationId: config.organizationId,
      defaultModel: config.defaultModel,
      availableModels: (config.availableModels as string[]) || [],
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      isActive: config.isActive ?? true,
      isDefault: config.isDefault ?? false,
      lastTestedAt: config.lastTestedAt,
      lastTestResult: config.lastTestResult,
      lastTestError: readable ? config.lastTestError : UNREADABLE_KEY_MESSAGE,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}

export const aiProviderService = AIProviderService.getInstance();
