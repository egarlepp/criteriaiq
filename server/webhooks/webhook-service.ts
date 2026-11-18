/**
 * Webhook Service
 * 
 * Core service for outbound webhook delivery with:
 * - HMAC-SHA256 signing
 * - Retry logic (3 attempts, exponential backoff)
 * - Handlebars template compilation
 * - Delivery logging
 */

import crypto from 'crypto';
import Handlebars from 'handlebars';
import { storage } from '../storage.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import type { Webhook, WebhookDelivery } from '../../shared/schema/misc.js';
import { assertOutboundUrl, OutboundUrlError } from "../lib/outbound-url";
import { decryptText } from '../auth/mfaUtils.js';
import { isCurrentRequestDemo } from '../lib/demo-mode';

/**
 * Signature headers for one delivery.
 *
 * X-CriteriaIQ-Signature is the original HMAC of the body alone, kept for
 * existing n8n checks. It can be replayed, because the timestamp beside it is
 * not signed. X-CriteriaIQ-Signature-V2 (`t=<unix seconds>,v1=<hex>`) signs
 * `${t}.${body}`, so a receiver can refuse old or replayed deliveries
 * (ImpactIQ's live refresh does). Without a secret the delivery is marked
 * unsigned and gets no V2 header.
 */
export function buildSignatureHeaders(
  bodyString: string,
  secret: string | null | undefined,
  now: Date,
): Record<string, string> {
  const headers: Record<string, string> = { 'X-CriteriaIQ-Timestamp': now.toISOString() };
  if (!secret) {
    headers['X-CriteriaIQ-Signature'] = 'unsigned';
    return headers;
  }
  const t = Math.floor(now.getTime() / 1000);
  const hmac = (data: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');
  headers['X-CriteriaIQ-Signature'] = `sha256=${hmac(bodyString)}`;
  headers['X-CriteriaIQ-Signature-V2'] = `t=${t},v1=${hmac(`${t}.${bodyString}`)}`;
  return headers;
}

export interface WebhookContext {
  triggerKey: string;
  projectId?: number;
  ruleId?: number;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export interface DeliveryResult {
  success: boolean;
  webhookId: number;
  statusCode?: number;
  responseBody?: string;
  responseTimeMs?: number;
  errorMessage?: string;
  attemptNumber: number;
  deliveryId?: number;
}

interface CompiledPayload {
  body: any;
  headers: Record<string, string>;
}

const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s exponential backoff

// Templates are JSON with Handlebars placeholders, and {{json x}} sits inside
// a quoted string value ("data": "{{json metadata}}"). Emitting raw JSON there
// (newlines, quotes) made the rendered body unparseable. The helper instead
// emits a JSON-escaped, marker-prefixed string; after parsing, restoreJsonValues
// turns each marked string back into the real nested value.
const JSON_HELPER_MARKER = '\u0000ciq-json:';

export function renderJsonHelper(context: unknown): Handlebars.SafeString {
  const encoded = JSON.stringify(JSON_HELPER_MARKER + JSON.stringify(context ?? null));
  return new Handlebars.SafeString(encoded.slice(1, -1));
}

export function restoreJsonValues(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith(JSON_HELPER_MARKER)) {
      return JSON.parse(value.slice(JSON_HELPER_MARKER.length));
    }
    // {{json}} mixed with other text: keep the text, drop the marker.
    return value.includes(JSON_HELPER_MARKER) ? value.split(JSON_HELPER_MARKER).join('') : value;
  }
  if (Array.isArray(value)) return value.map(restoreJsonValues);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restoreJsonValues(v)]));
  }
  return value;
}
const MAX_RESPONSE_LENGTH = 5000; // Truncate response body for storage

export class WebhookService {
  private compiledTemplates: Map<number, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('json', renderJsonHelper);

    Handlebars.registerHelper('uppercase', (str: string) => {
      return str?.toUpperCase() || '';
    });

    Handlebars.registerHelper('lowercase', (str: string) => {
      return str?.toLowerCase() || '';
    });

    Handlebars.registerHelper('formatDate', (date: Date | string) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    });

    Handlebars.registerHelper('ifEquals', function(this: any, arg1: any, arg2: any, options: any) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('statusColor', (status: string) => {
      const colors: Record<string, string> = {
        'completed': '#10B981',
        'in_progress': '#3B82F6',
        'pending': '#F59E0B',
        'failed': '#EF4444',
        'blocked': '#6B7280',
        'red': '#DC2626',
        'yellow': '#EAB308',
        'green': '#10B981'
      };
      return colors[status?.toLowerCase()] || '#6B7280';
    });
  }

  /**
   * Deliver an event to every active webhook subscribed to its trigger key
   * (webhooks.subscribed_events, migration 080). Deliveries run in parallel
   * and each keeps its own retry loop; one slow or failing receiver does
   * not hold up the others.
   */
  async deliverToSubscribers(context: WebhookContext): Promise<DeliveryResult[]> {
    // Demo Mode never sends anything out: events raised in a demo session
    // are about demo data, and demo webhooks are never delivered.
    if (isCurrentRequestDemo()) return [];
    const subscribers = await storage.db
      .select()
      .from(storage.schema.webhooks)
      .where(
        and(
          eq(storage.schema.webhooks.isActive, true),
          eq(storage.schema.webhooks.isDemo, false),
          sql`${storage.schema.webhooks.subscribedEvents} @> ${JSON.stringify([context.triggerKey])}::jsonb`
        )
      );

    if (subscribers.length === 0) return [];

    const results = await Promise.allSettled(
      subscribers.map((webhook) => this.deliverWithRetry(webhook, context))
    );
    return results.map((result, i) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            success: false,
            webhookId: subscribers[i].id,
            errorMessage: result.reason instanceof Error ? result.reason.message : 'Delivery failed',
            attemptNumber: 0,
          }
    );
  }

  async triggerWebhook(webhookId: number, context: WebhookContext): Promise<DeliveryResult> {
    const [webhook] = await storage.db
      .select()
      .from(storage.schema.webhooks)
      .where(eq(storage.schema.webhooks.id, webhookId))
      .limit(1);

    if (!webhook) {
      return {
        success: false,
        webhookId,
        errorMessage: 'Webhook not found',
        attemptNumber: 0
      };
    }

    if (!webhook.isActive) {
      return {
        success: false,
        webhookId,
        errorMessage: 'Webhook is disabled',
        attemptNumber: 0
      };
    }

    return this.deliverWithRetry(webhook, context);
  }

  private async deliverWithRetry(webhook: Webhook, context: WebhookContext): Promise<DeliveryResult> {
    if (webhook.isDemo) {
      return { success: false, webhookId: webhook.id, errorMessage: 'Demo webhooks are never sent', attemptNumber: 0 };
    }
    const maxAttempts = webhook.retryEnabled ? (webhook.maxRetries || 3) : 1;
    let lastResult: DeliveryResult | null = null;

    // signing_secret is stored AES-256-GCM encrypted (webhooks-routes.ts).
    // It must be decrypted before use as the HMAC key — signing with the
    // ciphertext produced signatures no receiver (n8n) could verify. Fail
    // closed if it can't be decrypted rather than silently sending unsigned.
    let signingSecret: string | null = null;
    if (webhook.signingSecret) {
      try {
        signingSecret = decryptText(webhook.signingSecret);
      } catch (error) {
        console.error(`[Webhook] Could not decrypt signing secret for webhook ${webhook.id}:`, error);
        return {
          success: false,
          webhookId: webhook.id,
          errorMessage: 'Signing secret could not be decrypted; re-save the webhook secret',
          attemptNumber: 0,
        };
      }
    }

    try {
      await assertOutboundUrl(webhook.endpointUrl);
    } catch (error) {
      const errorMessage = error instanceof OutboundUrlError ? error.message : 'Endpoint URL is not allowed';
      console.warn(`[Webhook] Refused endpoint for webhook ${webhook.id}: ${errorMessage}`);
      return { success: false, webhookId: webhook.id, errorMessage, attemptNumber: 0 };
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();
      
      try {
        const payload = this.compilePayload(webhook, context);
        // Sign the exact string that is sent, so a receiver can verify the raw body.
        const bodyString = JSON.stringify(payload.body);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'CriteriaIQ-Webhook/1.0',
          ...buildSignatureHeaders(bodyString, signingSecret, new Date()),
          'X-CriteriaIQ-Delivery-Attempt': attempt.toString(),
          ...payload.headers
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs || 30000);

        const response = await fetch(webhook.endpointUrl, {
          method: 'POST',
          headers,
          body: bodyString,
          signal: controller.signal,
          redirect: 'manual'
        });

        clearTimeout(timeout);

        const responseTimeMs = Date.now() - startTime;
        let responseBody = '';
        
        try {
          responseBody = await response.text();
          if (responseBody.length > MAX_RESPONSE_LENGTH) {
            responseBody = responseBody.substring(0, MAX_RESPONSE_LENGTH) + '... [truncated]';
          }
        } catch {
          responseBody = '[Unable to read response body]';
        }

        const success = response.ok;
        
        const deliveryId = await this.logDelivery({
          webhookId: webhook.id,
          triggerKey: context.triggerKey,
          ruleId: context.ruleId,
          projectId: context.projectId,
          statusCode: response.status,
          responseBody,
          responseTimeMs,
          payloadSent: payload.body,
          attemptNumber: attempt,
          success,
          deliveredAt: new Date()
        });

        lastResult = {
          success,
          webhookId: webhook.id,
          statusCode: response.status,
          responseBody,
          responseTimeMs,
          attemptNumber: attempt,
          deliveryId
        };

        if (success) {
          console.log(`[Webhook] Delivered successfully to ${webhook.name} (attempt ${attempt})`);
          return lastResult;
        }

        console.warn(`[Webhook] Delivery failed to ${webhook.name} (attempt ${attempt}): ${response.status}`);

      } catch (error) {
        const responseTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const deliveryId = await this.logDelivery({
          webhookId: webhook.id,
          triggerKey: context.triggerKey,
          ruleId: context.ruleId,
          projectId: context.projectId,
          errorMessage,
          responseTimeMs,
          payloadSent: null,
          attemptNumber: attempt,
          success: false,
          deliveredAt: new Date()
        });

        lastResult = {
          success: false,
          webhookId: webhook.id,
          errorMessage,
          responseTimeMs,
          attemptNumber: attempt,
          deliveryId
        };

        console.error(`[Webhook] Error delivering to ${webhook.name} (attempt ${attempt}):`, errorMessage);
      }

      if (attempt < maxAttempts) {
        const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        await this.sleep(delay);
      }
    }

    return lastResult || {
      success: false,
      webhookId: webhook.id,
      errorMessage: 'All retry attempts failed',
      attemptNumber: maxAttempts
    };
  }

  private compilePayload(webhook: Webhook, context: WebhookContext): CompiledPayload {
    const template = webhook.template as any;
    
    if (!template) {
      throw new Error('Webhook template is missing');
    }

    const templateData = {
      ...context.metadata,
      triggerKey: context.triggerKey,
      projectId: context.projectId,
      timestamp: context.timestamp || new Date(),
      webhookName: webhook.name
    };

    let compiledTemplate = this.compiledTemplates.get(webhook.id);
    
    if (!compiledTemplate) {
      const templateString = typeof template === 'string' 
        ? template 
        : JSON.stringify(template);
      compiledTemplate = Handlebars.compile(templateString);
      this.compiledTemplates.set(webhook.id, compiledTemplate);
    }

    try {
      const renderedString = compiledTemplate(templateData);
      const body = restoreJsonValues(JSON.parse(renderedString));
      
      const headers: Record<string, string> = {};
      if (webhook.headers) {
        const customHeaders = webhook.headers as Record<string, string>;
        Object.entries(customHeaders).forEach(([key, value]) => {
          if (typeof value === 'string') {
            const headerTemplate = Handlebars.compile(value);
            headers[key] = headerTemplate(templateData);
          }
        });
      }

      return { body, headers };
    } catch (error) {
      console.error('[Webhook] Template compilation error:', error);
      throw new Error(`Template compilation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async logDelivery(data: {
    webhookId: number;
    triggerKey: string;
    ruleId?: number;
    projectId?: number;
    statusCode?: number;
    responseBody?: string;
    responseTimeMs?: number;
    payloadSent: any;
    errorMessage?: string;
    attemptNumber: number;
    success: boolean;
    deliveredAt: Date;
  }): Promise<number> {
    const [delivery] = await storage.db
      .insert(storage.schema.webhookDeliveries)
      .values({
        webhookId: data.webhookId,
        triggerKey: data.triggerKey,
        ruleId: data.ruleId || null,
        projectId: data.projectId || null,
        statusCode: data.statusCode,
        responseBody: data.responseBody,
        responseTimeMs: data.responseTimeMs,
        payloadSent: data.payloadSent,
        errorMessage: data.errorMessage,
        attemptNumber: data.attemptNumber,
        success: data.success,
        deliveredAt: data.deliveredAt
      })
      .returning({ id: storage.schema.webhookDeliveries.id });

    return delivery.id;
  }

  async getRecentDeliveries(webhookId: number, limit: number = 10): Promise<WebhookDelivery[]> {
    return storage.db
      .select()
      .from(storage.schema.webhookDeliveries)
      .where(eq(storage.schema.webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(storage.schema.webhookDeliveries.createdAt))
      .limit(limit);
  }

  async testWebhook(webhookId: number): Promise<DeliveryResult> {
    const testContext: WebhookContext = {
      triggerKey: 'webhook.test',
      metadata: {
        projectName: 'Test Project',
        projectStatus: 'In Progress',
        projectId: 1,
        customerName: 'Test Customer',
        riskLevel: 'Yellow',
        mapProgress: 75,
        phaseName: 'Discovery',
        stepName: 'Requirements Gathering',
        taskName: 'Initial Meeting',
        userName: 'John Doe',
        userEmail: 'john@example.com',
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook delivery from CriteriaIQ'
      },
      timestamp: new Date()
    };

    return this.triggerWebhook(webhookId, testContext);
  }

  invalidateTemplateCache(webhookId: number): void {
    this.compiledTemplates.delete(webhookId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const webhookService = new WebhookService();
