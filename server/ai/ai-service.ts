import {
  aiProviderService,
  AZURE_OPENAI_API_VERSION,
  defaultModelFor,
  openAIModelAcceptsTemperature,
} from './ai-provider-service.js';
import type { AIProviderConfig } from '@shared/schema';
import { assertOutboundUrl } from '../lib/outbound-url';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

interface AICompletionResult {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

class AIService {
  private static instance: AIService;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public async complete(
    prompt: string,
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const config = await aiProviderService.getDefaultConfig();
    
    if (!config) {
      throw new Error('No default AI provider configured. Please configure an AI provider in Configuration > Integrations > AI Providers.');
    }

    return this.executeCompletion(config, prompt, options);
  }

  public async completeWithProvider(
    provider: string,
    prompt: string,
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const config = await aiProviderService.getActiveConfigByProvider(provider);
    
    if (!config) {
      throw new Error(`AI provider '${provider}' not found or not active.`);
    }

    return this.executeCompletion(config, prompt, options);
  }

  public async chat(
    messages: ChatMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const config = await aiProviderService.getDefaultConfig();
    
    if (!config) {
      throw new Error('No default AI provider configured. Please configure an AI provider in Configuration > Integrations > AI Providers.');
    }

    return this.executeChat(config, messages, options);
  }

  public async chatWithProvider(
    provider: string,
    messages: ChatMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const config = await aiProviderService.getActiveConfigByProvider(provider);
    
    if (!config) {
      throw new Error(`AI provider '${provider}' not found or not active.`);
    }

    return this.executeChat(config, messages, options);
  }

  public async isConfigured(): Promise<boolean> {
    const config = await aiProviderService.getDefaultConfig();
    return !!config;
  }

  public async getConfiguredProvider(): Promise<string | null> {
    const config = await aiProviderService.getDefaultConfig();
    return config?.provider || null;
  }

  private async executeCompletion(
    config: AIProviderConfig,
    prompt: string,
    options: AICompletionOptions
  ): Promise<AICompletionResult> {
    const messages: ChatMessage[] = [];
    
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    return this.executeChat(config, messages, options);
  }

  private async executeChat(
    config: AIProviderConfig,
    messages: ChatMessage[],
    options: AICompletionOptions
  ): Promise<AICompletionResult> {
    const model = options.model || config.defaultModel || defaultModelFor(config.provider);
    const maxTokens = options.maxTokens || config.maxTokens || 4096;
    const temperature = options.temperature ?? parseFloat(config.temperature || '0.7');

    switch (config.provider) {
      case 'openai':
        return this.executeOpenAI(config, messages, model, maxTokens, temperature);
      case 'gemini':
        return this.executeGemini(config, messages, model, maxTokens, temperature);
      case 'anthropic':
        return this.executeAnthropic(config, messages, model, maxTokens, temperature);
      case 'xai':
        return this.executeXAI(config, messages, model, maxTokens, temperature);
      case 'azure_openai':
        return this.executeAzureOpenAI(config, messages, model, maxTokens, temperature);
      case 'webhook':
        return this.executeWebhook(config, messages, model, maxTokens, temperature);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  private async executeOpenAI(
    config: AIProviderConfig,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    temperature: number
  ): Promise<AICompletionResult> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (config.organizationId) {
      headers['OpenAI-Organization'] = config.organizationId;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        // `max_completion_tokens` works on every chat model; the reasoning
        // models (gpt-5+, gpt-6, o-series) reject the older `max_tokens`.
        max_completion_tokens: maxTokens,
        ...(openAIModelAcceptsTemperature(model) ? { temperature } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      provider: 'openai',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  }

  private async executeGemini(
    config: AIProviderConfig,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    temperature: number
  ): Promise<AICompletionResult> {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system')?.content;

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      model,
      provider: 'gemini',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
    };
  }

  private async executeAnthropic(
    config: AIProviderConfig,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    _temperature: number
  ): Promise<AICompletionResult> {
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body: any = {
      model,
      max_tokens: maxTokens,
      // No `temperature`: Claude Opus 4.7 and every later model reject
      // sampling parameters with a 400, so the configured value is not
      // sent to Anthropic.
      messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      // Current Claude models think before answering, so content[0] can
      // be a `thinking` block; join the `text` blocks instead.
      content: Array.isArray(data.content)
        ? data.content
            .filter((block: { type?: string }) => block?.type === 'text')
            .map((block: { text?: string }) => block.text ?? '')
            .join('')
        : '',
      model: data.model || model,
      provider: 'anthropic',
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  private async executeXAI(
    config: AIProviderConfig,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    temperature: number
  ): Promise<AICompletionResult> {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `xAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      provider: 'xai',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  }

  private async executeAzureOpenAI(
    config: AIProviderConfig,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    temperature: number
  ): Promise<AICompletionResult> {
    if (!config.apiEndpoint) {
      throw new Error('Azure OpenAI requires an endpoint URL');
    }

    const url = `${config.apiEndpoint}/openai/deployments/${model}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
    await assertOutboundUrl(url, { requireHttps: true });

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        max_completion_tokens: maxTokens,
        ...(openAIModelAcceptsTemperature(model) ? { temperature } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Azure OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      provider: 'azure_openai',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  }

  /**
   * Generic webhook provider — POSTs the chat-completion request to an
   * operator-configured URL and expects a normalized response shape
   * back. The whole point is to let admins route AI traffic through
   * n8n (which can then call Azure AI Foundry, Bedrock, an internal
   * proxy, etc.) without CriteriaIQ having to know about the
   * downstream provider.
   *
   * Contract (see docs/guides/ai-provider-webhook.md):
   *
   *   POST <apiEndpoint>
   *     Authorization: Bearer <apiKey>   (only sent if apiKey is non-empty)
   *     Content-Type: application/json
   *     {
   *       messages: [{ role: 'system'|'user'|'assistant', content: string }],
   *       model: string,
   *       maxTokens: number,
   *       temperature: number
   *     }
   *   →
   *     {
   *       content: string,                          // required — the AI reply
   *       model?: string,                           // optional, echoes back
   *       usage?: {
   *         promptTokens?: number,
   *         completionTokens?: number,
   *         totalTokens?: number
   *       }
   *     }
   *
   * Errors should surface as either non-2xx status + `{ error: "..." }`
   * body, OR a 2xx with a missing `content` field (which we treat as a
   * contract violation and surface to the operator).
   *
   * `apiKey` is optional here — some operators secure their n8n
   * webhook by IP allowlist instead of bearer auth. Empty string
   * omits the Authorization header.
   */
  private async executeWebhook(
    config: AIProviderConfig,
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    temperature: number
  ): Promise<AICompletionResult> {
    if (!config.apiEndpoint) {
      throw new Error('Webhook AI provider requires an Endpoint URL');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey && config.apiKey.trim().length > 0) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    await assertOutboundUrl(config.apiEndpoint);
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      redirect: 'manual',
      headers,
      body: JSON.stringify({
        messages,
        model,
        maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error || err?.message;
      throw new Error(
        typeof msg === 'string' && msg.length > 0
          ? `Webhook AI provider error: ${msg}`
          : `Webhook AI provider responded ${response.status}`,
      );
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data.content !== 'string') {
      throw new Error(
        'Webhook AI provider response is missing the required `content` field. ' +
          'Confirm your n8n workflow ends with a "Respond to Webhook" node returning ' +
          '{ "content": "...", "model": "...", "usage": { ... } }.',
      );
    }

    return {
      content: data.content,
      model: typeof data.model === 'string' && data.model.length > 0 ? data.model : model,
      provider: 'webhook',
      usage: data.usage && typeof data.usage === 'object'
        ? {
            promptTokens: typeof data.usage.promptTokens === 'number' ? data.usage.promptTokens : undefined,
            completionTokens: typeof data.usage.completionTokens === 'number' ? data.usage.completionTokens : undefined,
            totalTokens: typeof data.usage.totalTokens === 'number' ? data.usage.totalTokens : undefined,
          }
        : undefined,
    };
  }
}

export const aiService = AIService.getInstance();

export type { ChatMessage, AICompletionOptions, AICompletionResult };
