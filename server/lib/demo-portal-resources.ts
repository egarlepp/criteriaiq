// Demo Mode Resource Content: a few resources written by Demo Staff, so the
// Resource Content page has "Other Resources" next to the System ones. Rows
// are is_demo = true; demo-wipe.ts removes them. They start off the portal
// cards, so the Account Portal keeps showing the System resources.
import { db } from "../db";
import { portalResources } from "@shared/schema";
import type { PortalResourceCard, PortalResourceLinkType } from "@shared/portal-resources";

interface DemoResource {
  card: PortalResourceCard;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  linkType: PortalResourceLinkType;
  url: string;
}

const ENGINEER_RESOURCES: DemoResource[] = [
  {
    card: "learning",
    title: "Identity Governance Quick Start",
    description: "A one-page walkthrough of connecting your first application and running an access review.",
    icon: "Rocket",
    iconColor: "#8b5cf6",
    linkType: "external",
    url: "https://helpcenter.example.com/identity-governance/quick-start",
  },
  {
    card: "support",
    title: "Office Hours",
    description: "Book a weekly 30-minute session with your engineer to work through questions.",
    icon: "CalendarClock",
    iconColor: "#0ea5e9",
    linkType: "external",
    url: "https://www.example.com/office-hours",
  },
];

const SPECIALIST_RESOURCES: DemoResource[] = [
  {
    card: "learning",
    title: "Project Guide",
    description: "How a project runs from kickoff to sign-off, and what we need from your team at each step.",
    icon: "BookOpen",
    iconColor: "#10b981",
    linkType: "internal",
    url: "/getting-started",
  },
];

/** Inserts the demo resources; returns how many were added. */
export async function seedDemoPortalResources(engineerId: string, specialistId: string): Promise<number> {
  const rows = [
    ...ENGINEER_RESOURCES.map((r) => ({ ...r, ownerId: engineerId })),
    ...SPECIALIST_RESOURCES.map((r) => ({ ...r, ownerId: specialistId })),
  ].map((r) => ({ ...r, isSystem: false, isDemo: true, portalPosition: null }));
  const inserted = await db.insert(portalResources).values(rows).returning({ id: portalResources.id });
  return inserted.length;
}
