// Shared types for Communications components

export interface EmailLog {
  id: number;
  toEmail: string;
  fromEmail: string;
  subject: string;
  textContent?: string;
  htmlContent?: string;
  sentAt: string;
  success: boolean;
  emailType?: string;
  error?: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  description: string;
  templateKey: string;
  category: string;
  subject: string;
  emailContent?: string; // New combined content field
  textContent?: string; // DEPRECATED: kept for backward compatibility
  htmlContent?: string; // DEPRECATED: kept for backward compatibility
  variables: string[];
  isActive: boolean;
  isSystem: boolean;
  emailSafeMode?: boolean;
  includeProjectPdf: boolean;
  emailType: string;
  recipientType: string | string[];
  triggerEvents: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  toRecipients?: string;
  ccRecipients?: string;
  bccRecipients?: string;
  designId?: number | null;
}

export interface InsertEmailTemplate extends Omit<EmailTemplate, 'recipientType'> {
  recipientTypes?: string[];
  toRecipients?: string;
  ccRecipients?: string;
  bccRecipients?: string;
  designId?: number | null;
}

export interface EmailDesign {
  id?: number;
  name: string;
  description: string;
  htmlRaw: string;
  isActive: boolean;
  isSystem?: boolean;
  isDefault?: boolean;
  designVariables: {
    headerBg: string;
    rightTitle: string;
    logoSrc: string;
    logoAlt: string;
    logoWidth: string;
    logoHeight: string;
    graphic1: string;
    graphic2: string;
    graphic3: string;
    footerLine1: string;
    footerLine2: string;
  };
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SharedCommunicationsProps {
  activeTab: string;
  onTabChange?: (tab: string) => void;
}
