/**
 * Email Provider Templates
 * Pre-configured SMTP settings for popular email providers
 * Converted from Go implementation for CriteriaIQ
 */

export interface EmailProvider {
  name: string;
  smtpHost: string;
  smtpPort: number;
  tls: boolean;
  startTLS: boolean;
  authRequired: boolean;
  instructions: string;
}

export function getEmailProviders(): EmailProvider[] {
  return [
    {
      name: "Gmail / Google Workspace",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and generate password
   - Use this password (not your regular password)
3. Use your full email as username`,
    },
    {
      name: "SendGrid",
      smtpHost: "smtp.sendgrid.net",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://sendgrid.com
2. Create an API Key:
   - Settings > API Keys > Create API Key
   - Choose "Restricted Access" with "Mail Send" permission
3. Username: "apikey" (literal string)
4. Password: Your API key
5. Verify sender identity in SendGrid dashboard`,
    },
    {
      name: "Mailgun",
      smtpHost: "smtp.mailgun.org",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://mailgun.com
2. Add and verify your domain
3. Get SMTP credentials:
   - Dashboard > Sending > Domain settings > SMTP credentials
4. Username: Default SMTP Login from dashboard
5. Password: Default Password from dashboard
Note: EU region uses smtp.eu.mailgun.org`,
    },
    {
      name: "Amazon SES (US East)",
      smtpHost: "email-smtp.us-east-1.amazonaws.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Set up Amazon SES in AWS Console
2. Verify your domain or email address
3. Create SMTP credentials:
   - SES Console > SMTP Settings > Create SMTP Credentials
4. Request production access (exit sandbox)
5. Use generated SMTP username and password
Other regions: us-west-2, eu-west-1, etc.`,
    },
    {
      name: "Microsoft 365 / Outlook",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `IMPORTANT: Basic authentication (username/password) is being deprecated.
You MUST use an App Password:

1. Enable 2-factor authentication on your Microsoft account
2. Generate an App Password:
   - Go to https://account.microsoft.com/security
   - Click "Advanced security options"
   - Under "App passwords", create a new app password
   - Use this app password (not your regular password)
3. Username: Your full email address (e.g., user@domain.com)
4. Password: The app password you generated

Note: If using a work/school account, your admin may need to enable
"Authenticated SMTP" in the Microsoft 365 admin center.`,
    },
    {
      name: "Brevo (formerly Sendinblue)",
      smtpHost: "smtp-relay.brevo.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://brevo.com
2. Get SMTP credentials:
   - Account > SMTP & API > SMTP
3. Username: Your account email
4. Password: Your SMTP password (not login password)
5. Add sender in Senders management`,
    },
    {
      name: "Postmark",
      smtpHost: "smtp.postmarkapp.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://postmarkapp.com
2. Create a server and get credentials:
   - Servers > Your Server > API Tokens
3. Username: Your API token
4. Password: Your API token (same as username)
5. Verify sender signature`,
    },
    {
      name: "SparkPost",
      smtpHost: "smtp.sparkpostmail.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://sparkpost.com
2. Create API key with "Send via SMTP" permission
3. Username: SMTP_Injection
4. Password: Your API key
5. Verify sending domain
EU endpoint: smtp.eu.sparkpostmail.com`,
    },
    {
      name: "Resend",
      smtpHost: "smtp.resend.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://resend.com
2. Create an API key
3. Username: resend
4. Password: Your API key
5. Add and verify domain
Simple, developer-friendly service`,
    },
    {
      name: "SMTP2GO",
      smtpHost: "mail.smtp2go.com",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `1. Sign up at https://smtp2go.com
2. Get SMTP credentials from dashboard
3. Username: Your SMTP username
4. Password: Your SMTP password
5. Add sender in Sender Domains`,
    },
    {
      name: "Custom SMTP Server",
      smtpHost: "",
      smtpPort: 587,
      tls: false,
      startTLS: true,
      authRequired: true,
      instructions: `Configure your own SMTP server:
- Common ports: 25 (no encryption), 587 (STARTTLS), 465 (TLS)
- Enable TLS/StartTLS for security
- Set AuthRequired=false for open relays (not recommended)
- Test connection before saving`,
    },
  ];
}

export function getProviderDefaults(providerName: string): Partial<EmailProvider> | null {
  const providers = getEmailProviders();
  const provider = providers.find(p => p.name === providerName);
  
  if (!provider) {
    return null;
  }
  
  return {
    smtpHost: provider.smtpHost,
    smtpPort: provider.smtpPort,
    tls: provider.tls,
    startTLS: provider.startTLS,
    authRequired: provider.authRequired,
  };
}
