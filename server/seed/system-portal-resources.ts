// System resources for the Account Portal's Resources tab (Resource Content).
// Seeded at boot by seedSystemPortalResources(); each row is keyed by
// system_key, so an Admin's edits and card choices survive restarts. All
// eight start on their card, in this order.
import type { PortalResourceCard, PortalResourceLinkType } from "@shared/portal-resources";

export interface SystemPortalResourceSeed {
  systemKey: string;
  card: PortalResourceCard;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  linkType: PortalResourceLinkType;
  url: string;
}

export const SYSTEM_PORTAL_RESOURCES: ReadonlyArray<SystemPortalResourceSeed> = [
  {
    systemKey: "technical-guides",
    card: "learning",
    title: "Technical Guides",
    description:
      "Detailed implementation and configuration documentation for all products, including installation guides, best practices, and advanced configurations.",
    icon: "FileText",
    iconColor: "#3b82f6",
    linkType: "external",
    url: "https://helpcenter.example.com/category/technical-documentation",
  },
  {
    systemKey: "security-glossary",
    card: "learning",
    title: "Security Glossary",
    description:
      "Comprehensive definitions of cybersecurity terminology and concepts to help you understand industry standards and security frameworks.",
    icon: "Shield",
    iconColor: "#3b82f6",
    linkType: "external",
    url: "https://www.example.com/glossary.html",
  },
  {
    systemKey: "cyber-attacks-guide",
    card: "learning",
    title: "Cyber Attacks Guide",
    description:
      "Learn about common attack vectors, threat mitigation strategies, and how to protect your organization from evolving cyber threats.",
    icon: "AlertTriangle",
    iconColor: "#ef4444",
    linkType: "external",
    url: "https://www.example.com/cyber_attacks_explained.html",
  },
  {
    systemKey: "compliance-resources",
    card: "learning",
    title: "Compliance Resources",
    description:
      "Guidance on regulatory standards including GDPR, HIPAA, PCI-DSS, SOX, and other compliance requirements for your industry.",
    icon: "ClipboardCheck",
    iconColor: "#22c55e",
    linkType: "external",
    url: "https://www.example.com/resources.html#compliance",
  },
  {
    systemKey: "support-center",
    card: "support",
    title: "Support Center",
    description:
      "Access technical support, submit tickets, and resolve issues with our dedicated support team available to help you succeed.",
    icon: "HelpCircle",
    iconColor: "#3b82f6",
    linkType: "external",
    url: "https://www.example.com/support.html",
  },
  {
    systemKey: "community-forum",
    card: "support",
    title: "Community Forum",
    description:
      "Connect with peers, share experiences, ask questions, and get community support from other users and experts.",
    icon: "Users2",
    iconColor: "#f97316",
    linkType: "external",
    url: "https://community.example.com/",
  },
  {
    systemKey: "supported-versions",
    card: "support",
    title: "Supported Versions",
    description:
      "View compatible product versions, compatibility matrices, and lifecycle information for planning upgrades and deployments.",
    icon: "ClipboardList",
    iconColor: "#22c55e",
    linkType: "external",
    url: "https://helpcenter.example.com/category/supported-versions",
  },
  {
    systemKey: "announcements",
    card: "support",
    title: "Announcements",
    description:
      "Latest product updates, new features, security advisories, and community highlights to keep you informed.",
    icon: "Bell",
    iconColor: "#3b82f6",
    linkType: "external",
    url: "https://www.example.com/announcements.html",
  },
];
