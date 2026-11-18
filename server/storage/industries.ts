// Industries + Compliance Regulations — mixin for DatabaseStorage
// (Phase 7 #12). Combines three related concerns under one mixin:
//
//   Industry CRUD                    (createIndustry / update / delete /
//                                     getIndustries / getIndustry +
//                                     getIndustryComplianceRegulations)
//   Compliance Regulations CRUD      (getComplianceRegulations with filters,
//                                     getById / create / update / delete)
//   Default seeders                  (seedIndustries, seedComplianceRegulations,
//                                     seedIndustryComplianceRegulations)
//
// The seeders ship a large in-code data table of canonical regulations
// (HIPAA, PCI-DSS, SOX, GDPR, CCPA, FERPA, GLBA, FISMA, NIST CSF, etc.)
// and the industry → regulation mappings. They run once at boot from
// `server/index.ts`.
//
// Behavior preserved verbatim. No demo-isolation here because both
// industries and compliance regulations are reference data shared
// across all tenants.
import { db } from "../db";
import { eq, and, or, desc, inArray, ilike } from "drizzle-orm";
import {
  industries,
  industryComplianceRegulations,
  complianceRegulations as complianceRegulationsTable,
} from "@shared/schema";
import type {
  Industry,
  InsertIndustry,
  ComplianceRegulation,
  InsertComplianceRegulation,
} from "@shared/schema";

export class IndustriesStorageMixin {
  // Industry operations
  async createIndustry(industryData: InsertIndustry & { complianceRegulations?: number[], allRegulationsApply?: boolean }): Promise<Industry> {
    const { complianceRegulations, allRegulationsApply, ...industry } = industryData;
    
    // Validate that all provided compliance regulation IDs exist BEFORE transaction
    if (complianceRegulations && complianceRegulations.length > 0) {
      const regulationIds = complianceRegulations; // Rename to avoid table name conflict
      const existingRegulations = await db.select({ id: complianceRegulationsTable.id })
        .from(complianceRegulationsTable)
        .where(inArray(complianceRegulationsTable.id, regulationIds));
      
      const existingIds = new Set(existingRegulations.map((r) => r.id));
      const invalidIds = regulationIds.filter(id => !existingIds.has(id));
      
      if (invalidIds.length > 0) {
        throw new Error(`Invalid compliance regulation IDs: ${invalidIds.join(', ')}`);
      }
    }
    
    // Execute industry creation and relationship setup in a transaction
    return await db.transaction(async (tx) => {
      const [newIndustry] = await tx.insert(industries).values(industry).returning();
      
      // Handle compliance regulations relationship with clear priority logic
      if (allRegulationsApply) {
        // If "All regulations apply" is checked, ignore any specific regulations and create single "all" relationship
        await tx.insert(industryComplianceRegulations).values({
          industryId: newIndustry.id,
          complianceRegulationId: null, // null for "all regulations"
          isAll: true
        });
      } else if (complianceRegulations && complianceRegulations.length > 0) {
        // Only create specific relationships if "All regulations apply" is not selected
        const relationships = complianceRegulations.map(regulationId => ({
          industryId: newIndustry.id,
          complianceRegulationId: regulationId,
          isAll: false
        }));
        await tx.insert(industryComplianceRegulations).values(relationships);
      }
      
      return newIndustry;
    });
  }

  async updateIndustry(id: number, updates: Partial<InsertIndustry & { complianceRegulations?: number[], allRegulationsApply?: boolean }>): Promise<Industry> {
    const { complianceRegulations, allRegulationsApply, ...industryUpdates } = updates;
    
    // Validate that all provided compliance regulation IDs exist BEFORE transaction
    if (complianceRegulations && complianceRegulations.length > 0) {
      const regulationIds = complianceRegulations; // Rename to avoid table name conflict
      const existingRegulations = await db.select({ id: complianceRegulationsTable.id })
        .from(complianceRegulationsTable)
        .where(inArray(complianceRegulationsTable.id, regulationIds));
      
      const existingIds = new Set(existingRegulations.map((r) => r.id));
      const invalidIds = regulationIds.filter(id => !existingIds.has(id));
      
      if (invalidIds.length > 0) {
        throw new Error(`Invalid compliance regulation IDs: ${invalidIds.join(', ')}`);
      }
    }
    
    // Execute industry update and relationship setup in a transaction
    return await db.transaction(async (tx) => {
      const [updatedIndustry] = await tx
        .update(industries)
        .set({ ...industryUpdates, updatedAt: new Date() })
        .where(eq(industries.id, id))
        .returning();
        
      // Handle compliance regulations relationship update
      if (complianceRegulations !== undefined || allRegulationsApply !== undefined) {
        // First, delete existing relationships for this industry
        await tx.delete(industryComplianceRegulations).where(eq(industryComplianceRegulations.industryId, id));
        
        // Then, insert new relationships with clear priority logic
        if (allRegulationsApply) {
          // If "All regulations apply" is checked, ignore any specific regulations and create single "all" relationship
          await tx.insert(industryComplianceRegulations).values({
            industryId: id,
            complianceRegulationId: null, // null for "all regulations"
            isAll: true
          });
        } else if (complianceRegulations && complianceRegulations.length > 0) {
          // Only create specific relationships if "All regulations apply" is not selected
          const relationships = complianceRegulations.map(regulationId => ({
            industryId: id,
            complianceRegulationId: regulationId,
            isAll: false
          }));
          await tx.insert(industryComplianceRegulations).values(relationships);
        }
      }
      
      return updatedIndustry;
    });
  }

  async deleteIndustry(id: number): Promise<void> {
    await db.delete(industries).where(eq(industries.id, id));
  }

  async getIndustries(): Promise<(Industry & { complianceRegulations?: number[], allRegulationsApply?: boolean })[]> {
    const industriesData = await db.select().from(industries).orderBy(industries.name);
    
    // For each industry, fetch compliance regulation data
    const industriesWithCompliance = await Promise.all(
      industriesData.map(async (industry) => {
        try {
          const complianceData = await this.getIndustryComplianceRegulations(industry.id);
          return {
            ...industry,
            complianceRegulations: complianceData.regulationIds,
            allRegulationsApply: complianceData.allRegulationsApply
          };
        } catch (error) {
          console.error(`Error fetching compliance regulations for industry ${industry.id}:`, error);
          return {
            ...industry,
            complianceRegulations: [],
            allRegulationsApply: false
          };
        }
      })
    );
    
    return industriesWithCompliance;
  }

  async getIndustry(id: number): Promise<Industry | undefined> {
    const [industry] = await db.select().from(industries).where(eq(industries.id, id));
    return industry;
  }

  // Industry Compliance Regulations operations
  async getIndustryComplianceRegulations(industryId: number): Promise<{ regulationIds: number[], allRegulationsApply: boolean }> {
    const relationships = await db
      .select()
      .from(industryComplianceRegulations)
      .where(eq(industryComplianceRegulations.industryId, industryId));
      
    const allRegulationsApply = relationships.some((rel) => rel.isAll);
    const regulationIds = relationships
      .filter((rel) => rel.complianceRegulationId !== null && rel.complianceRegulationId !== -1)
      .map((rel) => rel.complianceRegulationId!)
      .filter((id): id is number => id !== null);
      
    return { regulationIds, allRegulationsApply };
  }

  // Compliance Regulations methods
  async getComplianceRegulations(filters?: {
    category?: string;
    applicableRegions?: string;
    priority?: string;
    search?: string;
    isActive?: boolean;
  }): Promise<ComplianceRegulation[]> {
    let query = db.select().from(complianceRegulationsTable).$dynamic();

    const conditions = [];

    // Default to active regulations only unless explicitly specified
    if (filters?.isActive !== false) {
      conditions.push(eq(complianceRegulationsTable.isActive, true));
    }

    if (filters?.category) {
      conditions.push(eq(complianceRegulationsTable.category, filters.category));
    }

    if (filters?.applicableRegions) {
      conditions.push(eq(complianceRegulationsTable.applicableRegions, filters.applicableRegions));
    }

    if (filters?.priority) {
      conditions.push(eq(complianceRegulationsTable.priority, filters.priority));
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(complianceRegulationsTable.name, `%${filters.search}%`),
          ilike(complianceRegulationsTable.description, `%${filters.search}%`),
          ilike(complianceRegulationsTable.keyRequirements, `%${filters.search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(complianceRegulationsTable.createdAt));
  }

  async getComplianceRegulationById(id: number): Promise<ComplianceRegulation | undefined> {
    const [regulation] = await db.select().from(complianceRegulationsTable).where(eq(complianceRegulationsTable.id, id));
    return regulation;
  }

  async createComplianceRegulation(data: InsertComplianceRegulation): Promise<ComplianceRegulation> {
    const [regulation] = await db
      .insert(complianceRegulationsTable)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return regulation;
  }

  async updateComplianceRegulation(id: number, updates: Partial<InsertComplianceRegulation>): Promise<ComplianceRegulation | undefined> {
    const [regulation] = await db
      .update(complianceRegulationsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(complianceRegulationsTable.id, id))
      .returning();
    return regulation;
  }

  async deleteComplianceRegulation(id: number): Promise<void> {
    await db.delete(complianceRegulationsTable).where(eq(complianceRegulationsTable.id, id));
  }

  // =============================================================================
  // INDUSTRIES — DEFAULT SEED
  // =============================================================================

  async seedIndustries(): Promise<void> {
    const DEFAULT_INDUSTRIES = [
      { name: 'Technology', description: 'Software, hardware, IT services, and internet companies', icon: 'Cpu' },
      { name: 'Healthcare', description: 'Hospitals, clinics, medical providers, and health services', icon: 'Stethoscope' },
      { name: 'Financial Services', description: 'Banks, investment firms, payment processors, and fintech', icon: 'Landmark' },
      { name: 'Insurance', description: 'Insurance carriers, brokers, and reinsurance providers', icon: 'ShieldCheck' },
      { name: 'Manufacturing', description: 'Industrial, discrete, and process manufacturing', icon: 'Factory' },
      { name: 'Retail', description: 'Brick-and-mortar retail, e-commerce, and consumer goods sales', icon: 'ShoppingBag' },
      { name: 'Energy & Utilities', description: 'Oil & gas, power generation, water, and renewable energy', icon: 'Zap' },
      { name: 'Telecommunications', description: 'Wireless carriers, ISPs, and communications infrastructure', icon: 'Antenna' },
      { name: 'Government', description: 'Federal, state, and local government agencies', icon: 'Building' },
      { name: 'Education', description: 'K-12 schools, higher education, and edtech', icon: 'GraduationCap' },
      { name: 'Media & Entertainment', description: 'Publishing, broadcasting, gaming, and streaming services', icon: 'Clapperboard' },
      { name: 'Real Estate', description: 'Commercial and residential real estate, property management', icon: 'Home' },
      { name: 'Transportation & Logistics', description: 'Airlines, shipping, trucking, rail, and supply chain', icon: 'Truck' },
      { name: 'Pharmaceutical & Biotech', description: 'Drug manufacturers, biotech research, and life sciences', icon: 'FlaskConical' },
      { name: 'Consumer Goods', description: 'CPG, food & beverage, apparel, and household products', icon: 'Package' },
      { name: 'Professional Services', description: 'Consulting, legal, accounting, and advisory firms', icon: 'Briefcase' },
      { name: 'Non-Profit', description: 'Charities, foundations, and social-impact organizations', icon: 'HeartHandshake' },
      { name: 'Hospitality & Travel', description: 'Hotels, restaurants, tourism, and travel services', icon: 'Hotel' },
    ];

    let added = 0;
    for (const industry of DEFAULT_INDUSTRIES) {
      const inserted = await db.insert(industries).values({
        name: industry.name,
        description: industry.description,
        icon: industry.icon,
        isActive: true,
      }).onConflictDoNothing({ target: industries.name }).returning({ id: industries.id });
      if (inserted.length > 0) added++;
    }

    if (added > 0) {
      console.log(`✅ Industries seeded: ${added} added`);
    }
  }

  // =============================================================================
  // COMPLIANCE REGULATIONS — DEFAULT SEED
  // =============================================================================

  async seedComplianceRegulations(): Promise<void> {
    const DEFAULT_REGULATIONS: Array<{
      name: string;
      longName: string;
      category: string;
      description: string;
      industry: string;
      objective: string;
      priority: string;
      status: string;
      applicableRegions: string;
      keyRequirements: string;
    }> = [
      {
        name: 'NIST CSF 2.0',
        longName: 'NIST Cybersecurity Framework (CSF)',
        category: 'Frameworks',
        description: 'The NIST Cybersecurity Framework (CSF) is a voluntary assessment checklist designed to help organizations manage and reduce cybersecurity risks. Developed by NIST, it provides a structured and flexible approach to improving cybersecurity resilience across sectors.',
        industry: 'Applicable to organizations of all sizes and sectors',
        objective: 'Providing organizations with a risk-based approach to managing cybersecurity threats',
        priority: 'high',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'Identify/Protect/Detect/Respond/Recover functions; governance & risk management; profiles & tiers for outcomes',
      },
      {
        name: 'CIS CSC',
        longName: 'CIS Critical Security Controls',
        category: 'Frameworks',
        description: 'The CIS Critical Security Controls are best-practice guidelines designed for primarily automated implementation and monitoring to defend against common and severe cyber threats.',
        industry: 'Relevant to all major industries',
        objective: 'Providing a prioritized set of actions to protect systems and data from cyber threats',
        priority: 'high',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'Implement CIS Controls (v8); asset & software inventory; secure configuration; vulnerability mgmt; logging & monitoring; access control',
      },
      {
        name: 'FedRAMP',
        longName: 'Federal Risk & Authorization Management Program',
        category: 'Government',
        description: 'Standardized approach to security assessment, authorization, and continuous monitoring of cloud products and services used by U.S. federal agencies.',
        industry: 'Cloud service providers to U.S. federal agencies',
        objective: 'Reduce time, cost, and complexity of securing cloud services for federal information',
        priority: 'high',
        status: 'active',
        applicableRegions: 'United States (Federal)',
        keyRequirements: 'NIST SP 800-53 baseline; 3PAO assessment; System Security Plan; ATO by agency; continuous monitoring & POA&Ms',
      },
      {
        name: 'FISMA',
        longName: 'Federal Information Security Management Act',
        category: 'Government',
        description: 'Mandates information security programs to ensure confidentiality, integrity, and availability of government data.',
        industry: 'U.S. federal agencies and contractors',
        objective: 'Develop, document, and implement programs to protect sensitive government information',
        priority: 'high',
        status: 'active',
        applicableRegions: 'United States (Federal)',
        keyRequirements: 'FIPS 199/200 categorization; NIST 800-53 controls; risk assessment; POA&M; annual reporting & re-authorization',
      },
      {
        name: 'CMMC',
        longName: 'Cybersecurity Maturity Model Certification',
        category: 'Government',
        description: 'A tiered cybersecurity certification framework for Defense Industrial Base contractors and subcontractors.',
        industry: 'Organizations within the U.S. DoD supply chain',
        objective: 'Ensure adequate protection of Controlled Unclassified Information (CUI) in the DIB',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'United States (DoD)',
        keyRequirements: 'NIST 800-171-aligned practices; levels-based requirements; documented policies/procedures; third-party certification',
      },
      {
        name: 'CJIS',
        longName: 'Criminal Justice Information Services',
        category: 'Government',
        description: 'FBI-established security and privacy requirements for handling criminal justice information across law enforcement and justice entities.',
        industry: 'Entities that access, process, store, or transmit criminal justice information',
        objective: 'Protect criminal justice information (CJI) and govern secure handling/access',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Encrypt CJI at rest/in transit; MFA; personnel screening; security awareness; incident response; audit logging',
      },
      {
        name: 'NERC CIP-003-9',
        longName: 'NERC Critical Infrastructure Protection (CIP) Standards',
        category: 'Critical Infrastructure',
        description: "Mandatory cybersecurity standards for North America's bulk power system administered by NERC.",
        industry: 'Bulk electric system owners, operators, and users',
        objective: 'Safeguard the bulk electric system against cybersecurity risks',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'North America',
        keyRequirements: 'BES Cyber Systems inventory; electronic/physical perimeter security; change & access control; incident response & recovery',
      },
      {
        name: 'NIS2',
        longName: 'EU Directive on Security of Network and Information Systems (NIS2)',
        category: 'Critical Infrastructure',
        description: 'Updated EU-wide cybersecurity legislation requiring risk management measures and reporting by essential/important entities.',
        industry: 'Essential and important entities across specified sectors',
        objective: 'Strengthen cybersecurity risk management and incident reporting across the EU',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'European Union (EU/EEA)',
        keyRequirements: 'Risk mgmt measures; supply-chain security; incident reporting timelines; governance accountability; business continuity',
      },
      {
        name: 'ES-C2M2',
        longName: 'Electricity Subsector Cybersecurity Capability Maturity Model',
        category: 'Critical Infrastructure',
        description: 'Maturity model guiding electricity organizations to assess and strengthen cybersecurity across domains and practices.',
        industry: 'Electricity subsector organizations',
        objective: 'Evaluate, prioritize, and improve cybersecurity capabilities',
        priority: 'low',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Self-assessment across domains; maturity targets; gap remediation plans; continuous improvement',
      },
      {
        name: 'GLBA',
        longName: 'Gramm-Leach-Bliley Act',
        category: 'Finance',
        description: 'Requires safeguards for customer financial data, governs collection, storage, sharing, and transparency to consumers.',
        industry: 'U.S. financial institutions',
        objective: "Protect consumers' personal financial information",
        priority: 'low',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Written security program; risk assessment; access controls & encryption; service provider oversight; annual privacy notices',
      },
      {
        name: 'PCI DSS 4.0',
        longName: 'Payment Card Industry Data Security Standard',
        category: 'Finance',
        description: 'Global standard issued by PCI SSC for securing payment card data; applies to merchants and service providers.',
        industry: 'Any organization handling cardholder data',
        objective: 'Protect security and privacy of cardholder data',
        priority: 'high',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'Scope cardholder data; strong authentication; encryption; vulnerability scans & pen tests; logging/monitoring; annual SAQ/ROC',
      },
      {
        name: 'SOX',
        longName: 'Sarbanes-Oxley Act of 2002',
        category: 'Finance',
        description: 'U.S. law mandating internal controls over financial reporting; has cybersecurity implications via control requirements.',
        industry: 'Public companies subject to U.S. securities laws',
        objective: 'Improve accuracy and reliability of corporate disclosures',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'ITGCs over change, access, operations; segregation of duties; evidence & testing; management attestation',
      },
      {
        name: 'FINRA',
        longName: 'Financial Industry Regulatory Authority',
        category: 'Finance',
        description: 'Self-regulatory organization enforcing rules and standards for the U.S. securities industry.',
        industry: 'U.S. broker-dealers and registered representatives',
        objective: 'Protect investors; oversee market integrity and compliance',
        priority: 'low',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Written supervisory procedures; surveillance/trade monitoring; books & records retention (SEA 17a-4); cybersecurity program controls',
      },
      {
        name: 'FERPA',
        longName: 'Family Educational Rights and Privacy Act',
        category: 'Education',
        description: 'U.S. federal law establishing rights and privacy protections for student education records and regulating disclosures.',
        industry: 'Educational institutions receiving U.S. Department of Education funding',
        objective: 'Protect the privacy of student education records',
        priority: 'low',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Access/amend rights; consent for disclosures; directory information controls; reasonable safeguards',
      },
      {
        name: 'GDPR',
        longName: 'General Data Protection Regulation',
        category: 'Privacy',
        description: 'Comprehensive EU data protection law with extraterritorial scope and strict rights, obligations, and penalties.',
        industry: 'Organizations processing personal data of EU/EEA residents',
        objective: 'Protect personal data and regulate its processing and transfer',
        priority: 'high',
        status: 'active',
        applicableRegions: 'EU/EEA (extraterritorial)',
        keyRequirements: 'Lawful basis & transparency; data subject rights; DPIAs; DPO where required; 72-hour breach notification; cross-border transfer rules',
      },
      {
        name: 'CCPA',
        longName: 'California Consumer Privacy Act',
        category: 'Privacy',
        description: 'U.S. state privacy law granting rights to California residents; amended by CPRA with expanded obligations.',
        industry: 'For-profit businesses collecting personal information from California residents',
        objective: 'Provide California residents greater control over personal information',
        priority: 'high',
        status: 'active',
        applicableRegions: 'United States (California)',
        keyRequirements: 'Notice at collection; right to know/delete/correct; opt-out of sale/share; service provider contracts; data minimization & retention',
      },
      {
        name: 'HIPAA',
        longName: 'Health Insurance Portability and Accountability Act',
        category: 'Healthcare',
        description: 'U.S. federal law establishing national standards for safeguarding protected health information, including Security and Privacy Rules.',
        industry: 'Healthcare providers, health plans, and clearinghouses',
        objective: "Protect individuals' medical records and other PHI",
        priority: 'high',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Admin/physical/technical safeguards; risk analysis; business associate agreements; minimum necessary; breach notification',
      },
      {
        name: 'HITRUST CSF',
        longName: 'HITRUST Common Security Framework',
        category: 'Healthcare',
        description: 'Risk-based framework integrating multiple standards (e.g., HIPAA, NIST, ISO, PCI) for comprehensive security and compliance programs.',
        industry: 'Healthcare organizations and health IT vendors',
        objective: 'Protect sensitive data, manage risk, and meet regulatory requirements',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'Risk-based control selection; validated assessment/certification; corrective action plans; continuous monitoring',
      },
      {
        name: 'NIST 800-53',
        longName: 'Security and Privacy Controls for Information Systems and Organizations',
        category: 'NIST Special Publications',
        description: 'Widely adopted catalog of controls for federal systems and other regulated environments.',
        industry: 'U.S. federal information systems and contractors handling federal data',
        objective: 'Provide comprehensive security and privacy controls to protect systems from threats',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'United States (Federal)',
        keyRequirements: 'Select/tailor baselines; implement & assess controls; continuous monitoring; ATO process',
      },
      {
        name: 'NIST 800-171',
        longName: 'Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations',
        category: 'NIST Special Publications',
        description: 'Requirements for safeguarding CUI, commonly flowed down via federal contracts (e.g., DFARS).',
        industry: 'Non-federal organizations processing, storing, or transmitting CUI',
        objective: 'Ensure adequate protection of CUI in non-federal information systems',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: '110 requirements across 14 families; SSP & POA&M; incident reporting; access & configuration management',
      },
      {
        name: 'ISO 27002',
        longName: 'Applicable to ISO 27001, 27011, 27015, and 27018',
        category: 'General',
        description: 'Guidance for implementing and maintaining an information security management system and control baseline.',
        industry: 'Organizations managing digital assets across industries',
        objective: 'Provide best-practice recommendations for information security controls',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'Policies & Annex A controls; risk treatment; awareness & training; monitoring; continual improvement (PDCA)',
      },
      {
        name: 'COBIT5',
        longName: 'Control Objectives for Information and Related Technologies',
        category: 'General',
        description: 'Framework providing comprehensive IT governance practices, including risk, security, and control guidance.',
        industry: 'Enterprises seeking IT governance and management best practices',
        objective: 'Govern and manage enterprise IT while protecting digital assets',
        priority: 'low',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'EDM/APO/BAI/DSS/MEA processes; roles & responsibilities (RACI); performance metrics; capability levels',
      },
      {
        name: 'SOC2',
        longName: 'System and Organization Controls 2',
        category: 'General',
        description: 'AICPA framework and attestation reporting against Trust Services Criteria; commonly required by customers and partners.',
        industry: 'Service organizations handling customer data (cloud/tech and beyond)',
        objective: 'Assure security, availability, processing integrity, confidentiality, and privacy',
        priority: 'high',
        status: 'active',
        applicableRegions: 'Global',
        keyRequirements: 'Trust Services Criteria; design/operating effectiveness; vendor risk mgmt; continuous monitoring; auditor attestation report',
      },
      {
        name: 'NCCoE',
        longName: 'National Cybersecurity Center of Excellence',
        category: 'General',
        description: 'U.S. NIST center collaborating with industry to publish practice guides that accelerate real-world cybersecurity implementations.',
        industry: 'Organizations seeking practical, standards-based cybersecurity solutions',
        objective: 'Advance adoption of integrated cybersecurity tools and practices',
        priority: 'medium',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Adopt NIST practice guides; implement reference architectures; document use cases & outcomes',
      },
      {
        name: 'CISA',
        longName: 'Cybersecurity Information Sharing Act',
        category: 'General',
        description: 'U.S. federal law enabling government-private sector information sharing to improve national cybersecurity posture.',
        industry: 'Federal agencies and private sector companies',
        objective: 'Promote sharing of cyber threat indicators and defensive measures',
        priority: 'high',
        status: 'active',
        applicableRegions: 'United States',
        keyRequirements: 'Share threat indicators/defensive measures; remove personal data; follow liability protections & reporting mechanisms',
      },
    ];

    let added = 0;
    for (const reg of DEFAULT_REGULATIONS) {
      const inserted = await db
        .insert(complianceRegulationsTable)
        .values({
          name: reg.name,
          longName: reg.longName,
          category: reg.category,
          description: reg.description,
          industry: reg.industry,
          objective: reg.objective,
          priority: reg.priority,
          status: reg.status,
          applicableRegions: reg.applicableRegions,
          keyRequirements: reg.keyRequirements,
          isActive: true,
        })
        .onConflictDoNothing({ target: complianceRegulationsTable.name })
        .returning({ id: complianceRegulationsTable.id });
      if (inserted.length > 0) added++;
    }

    if (added > 0) {
      console.log(`✅ Compliance regulations seeded: ${added} added`);
    }
  }

  // =============================================================================
  // INDUSTRY ↔ COMPLIANCE REGULATION LINKS — DEFAULT SEED
  // =============================================================================

  async seedIndustryComplianceRegulations(): Promise<void> {
    const MAPPINGS: Array<{ industry: string; regulations: string[] }> = [
      { industry: 'Healthcare', regulations: ['HIPAA', 'HITRUST CSF'] },
      { industry: 'Financial Services', regulations: ['GLBA', 'PCI DSS 4.0', 'SOX', 'FINRA'] },
      { industry: 'Government', regulations: ['FedRAMP', 'FISMA', 'CMMC', 'CJIS'] },
      { industry: 'Education', regulations: ['FERPA'] },
      { industry: 'Energy & Utilities', regulations: ['NERC CIP-003-9', 'NIS2', 'ES-C2M2'] },
      {
        industry: 'Technology',
        regulations: [
          'NIST CSF 2.0',
          'CIS CSC',
          'SOC2',
          'ISO 27002',
          'NIST 800-53',
          'NIST 800-171',
          'COBIT5',
          'NCCoE',
          'CISA',
          'GDPR',
          'CCPA',
        ],
      },
    ];

    // Industries that should also receive an `isAll = true` sentinel row,
    // marking that the cross-industry frameworks they contain (e.g. NIST CSF
    // 2.0, CIS CSC) effectively make all regulations applicable.
    const ALL_REGULATIONS_INDUSTRIES = new Set<string>(['Technology']);

    const allIndustries = await db
      .select({ id: industries.id, name: industries.name })
      .from(industries);
    const industryByName = new Map(allIndustries.map((i) => [i.name, i.id]));

    const allRegs = await db
      .select({ id: complianceRegulationsTable.id, name: complianceRegulationsTable.name })
      .from(complianceRegulationsTable);
    const regByName = new Map(allRegs.map((r) => [r.name, r.id]));

    const conflictTarget = [
      industryComplianceRegulations.industryId,
      industryComplianceRegulations.complianceRegulationId,
    ];

    let added = 0;
    for (const { industry, regulations: regNames } of MAPPINGS) {
      const industryId = industryByName.get(industry);
      if (!industryId) continue;

      for (const regName of regNames) {
        const regId = regByName.get(regName);
        if (!regId) continue;

        const inserted = await db
          .insert(industryComplianceRegulations)
          .values({
            industryId,
            complianceRegulationId: regId,
            isAll: false,
          })
          .onConflictDoNothing({ target: conflictTarget })
          .returning({ id: industryComplianceRegulations.id });

        if (inserted.length > 0) added++;
      }

      if (ALL_REGULATIONS_INDUSTRIES.has(industry)) {
        const inserted = await db
          .insert(industryComplianceRegulations)
          .values({
            industryId,
            complianceRegulationId: null,
            isAll: true,
          })
          .onConflictDoNothing({ target: conflictTarget })
          .returning({ id: industryComplianceRegulations.id });

        if (inserted.length > 0) added++;
      }
    }

    if (added > 0) {
      console.log(`✅ Industry compliance regulations seeded: ${added} links added`);
    }
  }
}
