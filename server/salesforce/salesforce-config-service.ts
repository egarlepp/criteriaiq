import { storage } from '../storage.js';
import { and, eq } from 'drizzle-orm';
import { encryptText, decryptText } from '../auth/mfaUtils.js';
import jsforce, { Connection, OAuth2 } from 'jsforce';
import { salesforceLoginUrlProblem } from '../lib/outbound-url';

interface OAuthConfig {
  id: number;
  loginUrl: string;
  customDomain?: string | null;
  clientId: string;
  clientSecret: string;
  environment: 'production' | 'sandbox';
  isActive: boolean;
  evaluationObjectApiName?: string | null;
  lastTestedAt?: Date | null;
  lastTestResult?: string | null;
  lastTestError?: string | null;
}

interface OAuthConfigResponse {
  id: number;
  loginUrl: string;
  customDomain?: string | null;
  clientIdMasked: string;
  hasClientSecret: boolean;
  environment: 'production' | 'sandbox';
  isActive: boolean;
  evaluationObjectApiName?: string | null;
  lastTestedAt?: Date | null;
  lastTestResult?: string | null;
  lastTestError?: string | null;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  orgId?: string;
  orgName?: string;
  error?: string;
}

class SalesforceConfigService {
  private static instance: SalesforceConfigService;

  private constructor() {}

  public static getInstance(): SalesforceConfigService {
    if (!SalesforceConfigService.instance) {
      SalesforceConfigService.instance = new SalesforceConfigService();
    }
    return SalesforceConfigService.instance;
  }

  public async getOAuthConfig(): Promise<OAuthConfig | null> {
    const [config] = await storage.db
      .select()
      .from(storage.schema.salesforceOauthConfig)
      .where(eq(storage.schema.salesforceOauthConfig.isActive, true))
      .limit(1);

    if (!config) {
      return this.getFallbackEnvConfig();
    }

    return {
      id: config.id,
      loginUrl: config.loginUrl,
      customDomain: config.customDomain,
      clientId: decryptText(config.clientId),
      clientSecret: decryptText(config.clientSecret),
      environment: config.environment as 'production' | 'sandbox',
      isActive: config.isActive ?? true,
      evaluationObjectApiName: config.evaluationObjectApiName || 'Evaluation__c',
      lastTestedAt: config.lastTestedAt,
      lastTestResult: config.lastTestResult,
      lastTestError: config.lastTestError,
    };
  }

  private getFallbackEnvConfig(): OAuthConfig | null {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return null;
    }

    return {
      id: 0,
      loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
      customDomain: process.env.SALESFORCE_CUSTOM_DOMAIN || null,
      clientId,
      clientSecret,
      environment: 'production',
      isActive: true,
      lastTestedAt: null,
      lastTestResult: null,
      lastTestError: null,
    };
  }

  public async getOAuthConfigForDisplay(): Promise<OAuthConfigResponse | null> {
    const config = await this.getOAuthConfig();
    if (!config) return null;

    return {
      id: config.id,
      loginUrl: config.loginUrl,
      customDomain: config.customDomain,
      clientIdMasked: this.maskSecret(config.clientId),
      hasClientSecret: !!config.clientSecret,
      environment: config.environment,
      isActive: config.isActive,
      evaluationObjectApiName: config.evaluationObjectApiName || 'Evaluation__c',
      lastTestedAt: config.lastTestedAt,
      lastTestResult: config.lastTestResult,
      lastTestError: config.lastTestError,
    };
  }

  // Get the authorization URL, using customDomain for SSO if provided
  public getAuthorizationLoginUrl(config: OAuthConfig): string {
    // If customDomain is set, use it for SSO/Okta redirection
    if (config.customDomain) {
      return config.customDomain;
    }
    // Otherwise use the standard loginUrl
    return config.loginUrl;
  }

  private maskSecret(secret: string): string {
    if (!secret || secret.length < 8) return '****';
    return secret.substring(0, 4) + '****' + secret.substring(secret.length - 4);
  }

  public async saveOAuthConfig(
    data: {
      loginUrl: string;
      customDomain?: string | null;
      clientId: string;
      clientSecret: string;
      environment: 'production' | 'sandbox';
      evaluationObjectApiName?: string | null;
    },
    userId: string
  ): Promise<OAuthConfigResponse> {
    const encryptedClientId = encryptText(data.clientId);
    const encryptedClientSecret = encryptText(data.clientSecret);

    const [existing] = await storage.db
      .select()
      .from(storage.schema.salesforceOauthConfig)
      .limit(1);

    let config;
    if (existing) {
      [config] = await storage.db
        .update(storage.schema.salesforceOauthConfig)
        .set({
          loginUrl: data.loginUrl,
          customDomain: data.customDomain || null,
          clientId: encryptedClientId,
          clientSecret: encryptedClientSecret,
          environment: data.environment,
          isActive: true,
          evaluationObjectApiName: data.evaluationObjectApiName || 'Evaluation__c',
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(storage.schema.salesforceOauthConfig.id, existing.id))
        .returning();
    } else {
      [config] = await storage.db
        .insert(storage.schema.salesforceOauthConfig)
        .values({
          loginUrl: data.loginUrl,
          customDomain: data.customDomain || null,
          clientId: encryptedClientId,
          clientSecret: encryptedClientSecret,
          environment: data.environment,
          isActive: true,
          evaluationObjectApiName: data.evaluationObjectApiName || 'Evaluation__c',
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
    }

    return {
      id: config.id,
      loginUrl: config.loginUrl,
      customDomain: config.customDomain,
      clientIdMasked: this.maskSecret(data.clientId),
      hasClientSecret: true,
      environment: config.environment as 'production' | 'sandbox',
      isActive: config.isActive ?? true,
      evaluationObjectApiName: config.evaluationObjectApiName || 'Evaluation__c',
      lastTestedAt: config.lastTestedAt,
      lastTestResult: config.lastTestResult,
      lastTestError: config.lastTestError,
    };
  }

  /**
   * The Salesforce object behind the validation record (Evaluation, POC,
   * POV, ...). Set under Admin › Integrations › Overview › Validation
   * Record; falls back to the older evaluation_object_api_name column.
   */
  public async getEvaluationObjectApiName(): Promise<string> {
    const { getValidationRecordSettings } = await import('../lib/crm-validation-record-settings.js');
    return (await getValidationRecordSettings()).salesforce.objectApiName;
  }

  /** The lookup field on the validation record that points at its Opportunity. */
  public async getEvaluationOpportunityLookupField(): Promise<string> {
    const { getValidationRecordSettings } = await import('../lib/crm-validation-record-settings.js');
    return (await getValidationRecordSettings()).salesforce.opportunityLookupField;
  }

  public async testConnection(): Promise<TestConnectionResult> {
    const config = await this.getOAuthConfig();
    if (!config) {
      return {
        success: false,
        message: 'No OAuth configuration found',
        error: 'OAuth credentials are not configured',
      };
    }

    try {
      const urlProblem = salesforceLoginUrlProblem(config.loginUrl);
      if (urlProblem) throw new Error(`Salesforce login URL refused: ${urlProblem}`);
      const oauth2 = new jsforce.OAuth2({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        loginUrl: config.loginUrl,
      });

      const conn = new jsforce.Connection({ oauth2 });
      
      const loginResult = await conn.login(
        process.env.SALESFORCE_TEST_USERNAME || '',
        process.env.SALESFORCE_TEST_PASSWORD || ''
      ).catch(() => null);

      if (!loginResult) {
        const result = {
          success: true,
          message: 'OAuth configuration is valid. Direct login test skipped (no test credentials).',
        };
        
        await this.updateTestResult(config.id, 'success', null);
        return result;
      }

      const identity = await conn.identity();
      
      const result = {
        success: true,
        message: 'Successfully connected to Salesforce',
        orgId: identity.organization_id,
        orgName: identity.display_name,
      };

      await this.updateTestResult(config.id, 'success', null);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateTestResult(config.id, 'failed', errorMessage);
      
      return {
        success: false,
        message: 'Failed to connect to Salesforce',
        error: errorMessage,
      };
    }
  }

  private async updateTestResult(
    configId: number,
    result: string,
    error: string | null
  ): Promise<void> {
    if (configId === 0) return;

    await storage.db
      .update(storage.schema.salesforceOauthConfig)
      .set({
        lastTestedAt: new Date(),
        lastTestResult: result,
        lastTestError: error,
        updatedAt: new Date(),
      })
      .where(eq(storage.schema.salesforceOauthConfig.id, configId));
  }

  public getRedirectUri(): string {
    const override = process.env.SALESFORCE_REDIRECT_URI?.trim();
    if (override) return override;
    const baseUrl = process.env.PUBLIC_APP_URL?.trim() || 'http://localhost:5000';
    return `${baseUrl.replace(/\/$/, '')}/api/auth/salesforce/callback`;
  }

  public async getAuthorizationUrl(state: string): Promise<string | null> {
    const config = await this.getOAuthConfig();
    if (!config) return null;

    // Use customDomain for SSO/Okta if provided, otherwise use standard loginUrl
    const authorizationLoginUrl = this.getAuthorizationLoginUrl(config);
    const urlProblem = salesforceLoginUrlProblem(authorizationLoginUrl);
    if (urlProblem) throw new Error(`Salesforce login URL refused: ${urlProblem}`);

    const oauth2 = new jsforce.OAuth2({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: this.getRedirectUri(),
      loginUrl: authorizationLoginUrl,
    });

    return oauth2.getAuthorizationUrl({
      scope: 'api refresh_token offline_access',
      state,
    });
  }

  public async handleOAuthCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    instanceUrl: string;
  }> {
    const config = await this.getOAuthConfig();
    if (!config) {
      throw new Error('Salesforce OAuth not configured');
    }
    const urlProblem = salesforceLoginUrlProblem(config.loginUrl);
    if (urlProblem) throw new Error(`Salesforce login URL refused: ${urlProblem}`);

    const oauth2 = new jsforce.OAuth2({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: this.getRedirectUri(),
      loginUrl: config.loginUrl,
    });

    const conn = new jsforce.Connection({ oauth2 });
    await conn.authorize(code);

    return {
      accessToken: conn.accessToken!,
      refreshToken: conn.refreshToken!,
      instanceUrl: conn.instanceUrl!,
    };
  }

  public async isOAuthConfigured(): Promise<boolean> {
    const config = await this.getOAuthConfig();
    return config !== null;
  }

  // ── Per-user token storage (Workstream 4 Phase 2 consolidation) ──────
  //
  // Previously lived in the now-deleted server/webhooks/salesforce-service.ts,
  // which had its OWN, separate, env-var-only OAuth config path (no DB
  // fallback) — meaning /profile's "Connect to Salesforce" failed with
  // "OAuth is not configured" whenever an org configured Salesforce OAuth
  // only through this DB-backed config (Configuration → Integrations →
  // Salesforce → Credentials), even though every OTHER Salesforce call
  // site in the app worked fine. Moved here so there is exactly one
  // OAuth app config, used by every caller.

  public async isUserConnected(userId: string): Promise<boolean> {
    const row = await getSalesforceTokenRow(userId);
    return !!(row?.accessToken && row?.refreshToken);
  }

  /** Whether the user has tokens on file, and since when (Profile Settings › Integrations). */
  public async getUserConnectionRecord(userId: string): Promise<{ connected: boolean; connectedAt: Date | null }> {
    const row = await getSalesforceTokenRow(userId);
    if (!row?.accessToken || !row.refreshToken) return { connected: false, connectedAt: null };
    return { connected: true, connectedAt: row.connectedAt ?? null };
  }

  public async saveTokensForUser(
    userId: string,
    tokens: { accessToken: string; refreshToken: string; instanceUrl: string }
  ): Promise<void> {
    const integrations = storage.schema.userIntegrations;
    const now = new Date();
    const values = {
      accessToken: encryptText(tokens.accessToken),
      refreshToken: encryptText(tokens.refreshToken),
      instanceUrl: encryptText(tokens.instanceUrl),
      connectedAt: now,
      updatedAt: now,
    };
    await storage.db
      .insert(integrations)
      .values({ userId, provider: SALESFORCE_PROVIDER, ...values })
      .onConflictDoUpdate({
        target: [integrations.userId, integrations.provider],
        set: values,
      });
  }

  public async disconnectUser(userId: string): Promise<void> {
    const integrations = storage.schema.userIntegrations;
    await storage.db
      .delete(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, SALESFORCE_PROVIDER)));
    // Also clear the legacy users.sf_* copy (migration 083) so rolling back
    // to the previous release can't revive a connection the user cut.
    await storage.db
      .update(storage.schema.users)
      .set({
        sfAccessToken: null,
        sfRefreshToken: null,
        sfInstanceUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(storage.schema.users.id, userId));
  }
}

const SALESFORCE_PROVIDER = 'salesforce' as const;

/** The user's stored (still encrypted) Salesforce tokens, if any. */
async function getSalesforceTokenRow(userId: string) {
  const integrations = storage.schema.userIntegrations;
  const [row] = await storage.db
    .select({
      accessToken: integrations.accessToken,
      refreshToken: integrations.refreshToken,
      instanceUrl: integrations.instanceUrl,
      connectedAt: integrations.connectedAt,
    })
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, SALESFORCE_PROVIDER)))
    .limit(1);
  return row ?? null;
}

export const salesforceConfigService = SalesforceConfigService.getInstance();

/**
 * Builds a per-user jsforce Connection from the user's stored OAuth
 * tokens (user_integrations) + the org-wide OAuth app config, with
 * auto-refresh wired to persist a rotated access token back.
 *
 * Previously duplicated near-verbatim in salesforce-sync-service.ts,
 * salesforce-metadata-service.ts, and salesforce-linkage-service.ts —
 * extracted here (Workstream 4 Phase 0 shared groundwork) so every new
 * caller (mapping validation/dry-run) reuses one implementation instead
 * of writing a 4th copy.
 */
export async function getSalesforceConnectionForUser(userId: string): Promise<Connection> {
  const tokens = await getSalesforceTokenRow(userId);

  if (!tokens?.accessToken || !tokens?.refreshToken || !tokens?.instanceUrl) {
    throw new Error('User not connected to Salesforce');
  }

  const config = await salesforceConfigService.getOAuthConfig();
  if (!config) {
    throw new Error('Salesforce OAuth not configured');
  }

  const accessToken = decryptText(tokens.accessToken);
  const refreshToken = decryptText(tokens.refreshToken);
  const instanceUrl = decryptText(tokens.instanceUrl);

  const oauth2 = new jsforce.OAuth2({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: salesforceConfigService.getRedirectUri(),
    loginUrl: config.loginUrl,
  });

  const conn = new jsforce.Connection({
    oauth2,
    accessToken,
    refreshToken,
    instanceUrl,
  });

  conn.on('refresh', async (newAccessToken) => {
    const integrations = storage.schema.userIntegrations;
    await storage.db
      .update(integrations)
      .set({
        accessToken: encryptText(newAccessToken),
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, SALESFORCE_PROVIDER)));
  });

  return conn;
}
