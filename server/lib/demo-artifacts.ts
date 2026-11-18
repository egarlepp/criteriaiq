// Demo Mode Artifacts: documents, links and code scripts for the demo
// solutions, accounts and projects, so Knowledge › Artifacts, a project's
// Project Artifacts tab and an account's Customer Artifacts all have
// content. Rows are is_demo = true (migration 126): Demo Mode shows only
// these and real mode never does. Each document gets a small generated PDF
// in the configured file storage under demo/documents/, so Download works;
// demo-wipe.ts removes the rows and their files.
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { documents, links, codeScripts, projects } from "@shared/schema";
import { uploadFile } from "./cloud-storage";
import type { DemoSolution } from "./demo-library";
import { demoStaffName } from "./demo-story";

/** Storage prefix of every demo document file. */
export const DEMO_DOCUMENT_PREFIX = "demo/documents/";

export interface DemoArtifactProject {
  id: number;
  name: string;
  customerId: number;
  accountName: string;
  solutionIds: number[];
  solutionNames: string[];
  type: string;
  /** Story stage from demo-story.ts (early, mid, late, won, lost, other). */
  stage: string;
  ownerId: string;
  startDate: Date;
}

export interface DemoArtifactAccount {
  id: number;
  accountName: string;
  ownerId: string;
}

export interface DemoArtifactResult {
  documents: number;
  links: number;
  codeScripts: number;
}

interface PlannedDocument {
  givenName: string;
  documentType: string;
  description: string;
  /** Heading, then the body paragraphs of the PDF. */
  sections: Array<{ heading: string; body: string }>;
}

/** Documents every demo project carries, by how far along it is. */
export function planProjectDocuments(project: Pick<DemoArtifactProject, "accountName" | "solutionNames" | "type" | "stage">): PlannedDocument[] {
  const account = project.accountName.replace(/^\[demo\]\s*/, "");
  const solutions = project.solutionNames.join(" and ");
  const docs: PlannedDocument[] = [
    {
      givenName: `${project.type} Kickoff Deck`,
      documentType: "Documentation",
      description: `Kickoff slides for the ${account} ${project.type}: scope, success criteria, team and timeline.`,
      sections: [
        { heading: "Scope", body: `Validate ${solutions} against ${account}'s identity governance requirements in a sandbox tenant.` },
        { heading: "Success criteria", body: "Agreed criteria are tracked in CriteriaIQ; each one has an owner, a test and an expected outcome." },
        { heading: "Team and cadence", body: "Weekly working session with the customer's IAM lead; status shared every Friday." },
      ],
    },
    {
      givenName: `${project.type} Test Plan`,
      documentType: "Reference",
      description: `Test cases mapped to the agreed success criteria for ${solutions}.`,
      sections: [
        { heading: "Approach", body: "Each success criterion has one or more test cases with steps, test data and the evidence to capture." },
        { heading: "Environments", body: "Sandbox tenant connected to a test directory and a sanitized HR extract." },
        { heading: "Sign-off", body: "The customer's IAM lead signs off each criterion as met, partially met or not met." },
      ],
    },
  ];
  if (project.stage !== "early") {
    docs.push({
      givenName: "Solution Architecture",
      documentType: "Architecture",
      description: `How ${solutions} connects to ${account}'s directory, HR system and ticketing tool.`,
      sections: [
        { heading: "Components", body: "Cloud service, on-premises connector host, directory and HR connectors, ticketing integration." },
        { heading: "Data flows", body: "Identities sync from HR into the directory; access reviews and requests flow back to ticketing." },
        { heading: "Security", body: "Outbound HTTPS only from the connector host; service accounts are read-only unless stated." },
      ],
    });
  }
  if (project.stage === "won" || project.stage === "lost") {
    docs.push({
      givenName: `${project.type} Readout`,
      documentType: "Documentation",
      description: `Results of the ${project.type} and the recommendation shared with ${account}.`,
      sections: [
        { heading: "Results", body: "Summary of each success criterion, its result and the evidence captured during testing." },
        {
          heading: "Recommendation",
          body: project.stage === "won"
            ? "The validation met the agreed criteria; the customer is moving ahead with a production rollout."
            : "The validation did not meet enough of the agreed criteria; open gaps and lessons learned are listed in Gap Analysis.",
        },
      ],
    });
  }
  return docs;
}

function stripDemo(name: string): string {
  return name.replace(/^\[demo\]\s*/, "");
}

function safeFileName(givenName: string): string {
  return `${givenName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "document"}.pdf`;
}

/** A one-page PDF with a title, a subtitle and the given sections. */
async function buildPdf(title: string, subtitle: string, sections: PlannedDocument["sections"]): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  let y = 22;
  doc.setFontSize(18);
  doc.text(title, 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(subtitle, 20, y);
  doc.setTextColor(0);
  y += 12;
  for (const section of sections) {
    doc.setFontSize(13);
    doc.text(section.heading, 20, y);
    y += 7;
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(section.body, 170) as string[];
    doc.text(lines, 20, y);
    y += lines.length * 6 + 6;
  }
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Demo Mode sample document. Generated by CriteriaIQ; not real customer data.", 20, 285);
  return Buffer.from(doc.output("arraybuffer"));
}

/** Writes one demo document's PDF to file storage and returns its object key and size. */
async function storeDemoPdf(fileName: string, pdf: Buffer): Promise<{ key: string; size: number }> {
  const key = `${DEMO_DOCUMENT_PREFIX}${randomUUID()}/${fileName}`;
  const tmp = path.join(os.tmpdir(), `criteriaiq-demo-${randomUUID()}.pdf`);
  fs.writeFileSync(tmp, pdf);
  try {
    const stored = await uploadFile(tmp, key, "application/pdf");
    return { key: stored.gcsPath, size: pdf.length };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

async function insertDemoDocument(input: {
  doc: PlannedDocument;
  subtitle: string;
  ownerId: string;
  projectId?: number | null;
  customerId?: number | null;
  accountIds?: number[];
  solutionIds: number[];
  uploadedAt: Date;
}): Promise<typeof documents.$inferSelect> {
  const fileName = safeFileName(input.doc.givenName);
  const pdf = await buildPdf(input.doc.givenName, input.subtitle, input.doc.sections);
  const stored = await storeDemoPdf(fileName, pdf);
  const [row] = await db
    .insert(documents)
    .values({
      originalName: fileName,
      givenName: input.doc.givenName,
      fileName,
      mimeType: "application/pdf",
      fileType: "application/pdf",
      fileSize: stored.size,
      uploadedAt: input.uploadedAt,
      uploadedByUserId: input.ownerId,
      projectId: input.projectId ?? null,
      customerId: input.customerId ?? null,
      storedPath: stored.key,
      gcsPath: stored.key,
      description: input.doc.description,
      documentType: input.doc.documentType,
      solutionIds: input.solutionIds,
      accountIds: input.accountIds ?? [],
      owner: demoStaffName(input.ownerId) ?? "Demo",
      ownerId: input.ownerId,
      sensitivityLabel: "internal",
      scanStatus: "clean",
      scannedAt: input.uploadedAt,
      isActive: true,
      isDemo: true,
      createdAt: input.uploadedAt,
      updatedAt: input.uploadedAt,
    })
    .returning();
  return row;
}

const DEMO_SCRIPTS: Array<{ name: string; scriptType: string; description: string; content: (solution: string) => string }> = [
  {
    name: "Connector Health Check",
    scriptType: "PowerShell",
    description: "Checks that the on-premises connector host can reach the directory and the cloud service.",
    content: (solution) => [
      `# ${solution}: connector health check (Demo Mode sample)`,
      "param([string]$Directory = \"dc01.example.local\", [string]$Service = \"service.example.com\")",
      "",
      "Test-NetConnection -ComputerName $Directory -Port 636 | Select-Object ComputerName, TcpTestSucceeded",
      "Test-NetConnection -ComputerName $Service -Port 443 | Select-Object ComputerName, TcpTestSucceeded",
      "Get-Service -Name \"ConnectorAgent\" | Select-Object Name, Status",
    ].join("\n"),
  },
  {
    name: "Access Review Export",
    scriptType: "Python",
    description: "Exports completed access review decisions to CSV for the audit evidence pack.",
    content: (solution) => [
      `"""${solution}: export access review decisions (Demo Mode sample)."""`,
      "import csv",
      "",
      "decisions = [",
      "    {\"user\": \"a.lee\", \"entitlement\": \"Finance-Approver\", \"decision\": \"approve\"},",
      "    {\"user\": \"j.diaz\", \"entitlement\": \"HR-Admin\", \"decision\": \"revoke\"},",
      "]",
      "",
      "with open(\"access_review_export.csv\", \"w\", newline=\"\") as f:",
      "    writer = csv.DictWriter(f, fieldnames=[\"user\", \"entitlement\", \"decision\"])",
      "    writer.writeheader()",
      "    writer.writerows(decisions)",
    ].join("\n"),
  },
];

/** Library documents, links and scripts for each demo solution. */
async function seedSolutionArtifacts(solutions: DemoSolution[], ownerId: string, result: DemoArtifactResult): Promise<void> {
  const uploadedAt = new Date(Date.now() - 120 * 86_400_000);
  for (const solution of solutions) {
    const name = stripDemo(solution.name);
    const slug = solution.abbreviation.toLowerCase();
    await insertDemoDocument({
      doc: {
        givenName: `${name} Datasheet`,
        documentType: "Datasheet",
        description: `Capabilities, deployment options and integrations of ${name}.`,
        sections: [
          { heading: "Capabilities", body: solution.componentNames.join(", ") + "." },
          { heading: "Deployment", body: "Cloud service with an optional on-premises connector for directories and HR systems." },
        ],
      },
      subtitle: `${name} · Solution datasheet`,
      ownerId,
      solutionIds: [solution.id],
      uploadedAt,
    });
    await insertDemoDocument({
      doc: {
        givenName: `${name} Battlecard`,
        documentType: "Battlecard",
        description: `How ${name} compares with the demo competitors, and how to handle common objections.`,
        sections: [
          { heading: "Where we win", body: "Fast time to value, packaged connectors and auditor-ready evidence exports." },
          { heading: "Objections", body: "\"We already have a directory tool\": show the certification workflow and audit trail it lacks." },
        ],
      },
      subtitle: `${name} · Internal only`,
      ownerId,
      solutionIds: [solution.id],
      uploadedAt,
    });
    result.documents += 2;

    await db.insert(links).values([
      {
        name: `${name} Documentation`,
        description: `Product documentation for ${name}.`,
        linkType: "Documentation",
        url: `https://example.com/demo/docs/${slug}`,
        solutionIds: [solution.id],
        accountIds: [],
        owner: demoStaffName(ownerId) ?? "Demo",
        ownerId,
        isDemo: true,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
      },
      {
        name: `${name} Admin Tutorial`,
        description: `Step-by-step setup walkthrough for ${name}.`,
        linkType: "Tutorial",
        url: `https://example.com/demo/tutorials/${slug}`,
        solutionIds: [solution.id],
        accountIds: [],
        owner: demoStaffName(ownerId) ?? "Demo",
        ownerId,
        isDemo: true,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
      },
    ]);
    result.links += 2;

    await db.insert(codeScripts).values(
      DEMO_SCRIPTS.map((script) => ({
        name: `${name} ${script.name}`,
        description: script.description,
        scriptType: script.scriptType,
        content: script.content(name),
        solutionIds: [solution.id],
        accountIds: [],
        owner: demoStaffName(ownerId) ?? "Demo",
        ownerId,
        isDemo: true,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
      })),
    );
    result.codeScripts += DEMO_SCRIPTS.length;
  }
}

/**
 * Seeds the demo Artifacts: per solution a datasheet, a battlecard, two
 * links and two scripts; per account a current-state architecture document
 * (Customer Artifacts); per project its documents and two links, attached
 * to the project the way the project form attaches them (Project Documents
 * and Project Links on the Project Artifacts tab).
 */
export async function seedDemoArtifacts(
  solutions: DemoSolution[],
  accounts: DemoArtifactAccount[],
  demoProjects: DemoArtifactProject[],
  libraryOwnerId: string,
): Promise<DemoArtifactResult> {
  const result: DemoArtifactResult = { documents: 0, links: 0, codeScripts: 0 };
  await seedSolutionArtifacts(solutions, libraryOwnerId, result);

  for (const account of accounts) {
    const name = stripDemo(account.accountName);
    await insertDemoDocument({
      doc: {
        givenName: `${name} Current-State Architecture`,
        documentType: "Architecture",
        description: `${name}'s directories, HR system and access processes today, shared by the customer.`,
        sections: [
          { heading: "Directories", body: "Two Active Directory forests and a cloud directory for SaaS applications." },
          { heading: "HR system", body: "Joiners, movers and leavers are entered in HR; access changes are raised as manual tickets." },
          { heading: "Pain points", body: "Quarterly access reviews run in spreadsheets and take six weeks to complete." },
        ],
      },
      subtitle: `${name} · Shared by the customer`,
      ownerId: account.ownerId,
      customerId: account.id,
      accountIds: [account.id],
      solutionIds: [],
      uploadedAt: new Date(Date.now() - 150 * 86_400_000),
    });
    result.documents++;
  }

  for (const project of demoProjects) {
    const account = stripDemo(project.accountName);
    const planned = planProjectDocuments(project);
    const attached: unknown[] = [];
    for (const [i, doc] of planned.entries()) {
      const uploadedAt = new Date(project.startDate.getTime() + i * 7 * 86_400_000);
      const row = await insertDemoDocument({
        doc,
        subtitle: `${account} · ${project.name}`,
        ownerId: project.ownerId,
        projectId: project.id,
        customerId: project.customerId,
        accountIds: [project.customerId],
        solutionIds: project.solutionIds,
        uploadedAt: uploadedAt > new Date() ? new Date() : uploadedAt,
      });
      // Same shape the project form saves for an existing document.
      attached.push({
        name: row.givenName,
        size: row.fileSize,
        type: row.mimeType,
        lastModified: row.uploadedAt?.getTime() ?? Date.now(),
        isExistingDocument: true,
        documentId: row.id,
        documentData: row,
      });
    }
    result.documents += planned.length;

    const linkRows = await db
      .insert(links)
      .values([
        {
          name: `${account} Shared Workspace`,
          description: `Shared folder for the ${project.type} with ${account}.`,
          linkType: "Portal",
          url: `https://example.com/demo/workspace/${project.id}`,
          solutionIds: project.solutionIds,
          accountIds: [project.customerId],
          owner: demoStaffName(project.ownerId) ?? "Demo",
          ownerId: project.ownerId,
          projectId: project.id,
          isDemo: true,
        },
        {
          name: "Kickoff Recording",
          description: `Recording of the ${project.type} kickoff call.`,
          linkType: "Video",
          url: `https://example.com/demo/recordings/${project.id}`,
          solutionIds: project.solutionIds,
          accountIds: [project.customerId],
          owner: demoStaffName(project.ownerId) ?? "Demo",
          ownerId: project.ownerId,
          projectId: project.id,
          isDemo: true,
        },
      ])
      .returning();
    result.links += linkRows.length;

    await db
      .update(projects)
      .set({
        customerArtifacts: attached,
        projectLinks: linkRows.map((link) => ({
          linkType: link.linkType,
          url: link.url,
          description: link.description ?? "",
          name: link.name,
          linkId: String(link.id),
        })),
      })
      .where(eq(projects.id, project.id));
  }

  return result;
}
