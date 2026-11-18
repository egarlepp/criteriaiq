// Tag utility functions for consistent casing and coloring across the application

export interface TagInfo {
  name: string;
  color: string;
  description?: string;
}

export interface DatabaseTag {
  id: number;
  name: string;
  color: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

// Centralized tag definitions with consistent casing and colors (fallback for system tags)
export const SYSTEM_TAGS: Record<string, TagInfo> = {
  'FIM/SCM': { name: 'FIM/SCM', color: '#EF4444', description: 'File Integrity Monitoring and Security Configuration Management' },
  'Compliance': { name: 'Compliance', color: '#10B981', description: 'Compliance and regulatory features' },
  'ERP/CRM': { name: 'ERP/CRM', color: '#F59E0B', description: 'Compliance across NetSuite and Salesforce.' },
  'Passwords': { name: 'Passwords', color: '#8B5CF6', description: 'Passwords' },
  'Recovery': { name: 'Recovery', color: '#06B6D4', description: 'Comprehensive recovery' },
  'Classification': { name: 'Classification', color: '#84CC16', description: 'Discover, classify, and secure sensitive data' },
  'Endpoint': { name: 'Endpoint', color: '#64748B', description: 'Endpoint Management' },
  'AD-Security': { name: 'AD-Security', color: '#1E40AF', description: 'AD Security-related' },
  'Audit': { name: 'Audit', color: '#DC2626', description: 'Audit trails and logging' },
  'DLP': { name: 'DLP', color: '#059669', description: 'Data Loss Prevention' },
  'ITDR': { name: 'ITDR', color: '#7C3AED', description: 'Identity Threat Detection and Response' },
  'DSPM': { name: 'DSPM', color: '#0891B2', description: 'Data Security Posture Management' },
  'IGA': { name: 'IGA', color: '#2563EB', description: 'Identity Governance and Administration' },
  'PAM': { name: 'PAM', color: '#9333EA', description: 'Privileged Access Management' },
  'SaaS': { name: 'SaaS', color: '#0D9488', description: 'Software as a Service deployment' },
  'On-Prem': { name: 'On-Prem', color: '#475569', description: 'On-Premises deployment' },
  'Hybrid': { name: 'Hybrid', color: '#EA580C', description: 'Hybrid cloud/on-premises deployment' }
};

// Function to get tag info from database tags (preferred) or fallback to system tags
export function getTagInfoFromDatabase(tagName: string, databaseTags: DatabaseTag[] = []): TagInfo {
  // First try to find in database tags
  const dbTag = databaseTags.find(tag =>
    tag.name.toLowerCase() === tagName.toLowerCase()
  );

  if (dbTag) {
    return {
      name: dbTag.name,
      color: dbTag.color,
      description: dbTag.description
    };
  }

  // Fallback to system tags
  return getTagInfo(tagName);
}

// Deterministic HSL-based color for tag names that aren't in either the
// DB tags table or SYSTEM_TAGS. Without this, every unknown tag rendered
// as the same #64748B slate-gray pill — legacy Solutions tags like
// "Security", "Data Protection", "Auditing" all collapsed into the same
// visual blob. Each unique name now gets its own stable color so the
// pills are at least distinguishable, without forcing an admin to
// retroactively add every legacy tag to Tags Management.
//
// Uses a small string hash → HSL with fixed S/L bands to avoid muddy or
// washed-out colors. Returns a CSS `#rrggbb` hex literal so it composes
// with the existing `style={{ backgroundColor }}` call sites.
export function colorFromTagName(tagName: string): string {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = (hash << 5) - hash + tagName.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  // Saturated, medium-darkness band — readable as a colored pill with
  // white text and visible against light and dark surfaces alike.
  const sat = 55;
  const light = 42;
  return hslToHex(hue, sat, light);
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const x = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * x).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Function to get tag color from database tags (preferred) or fallback to system tags
export function getTagColorFromDatabase(tagName: string, databaseTags: DatabaseTag[] = []): string {
  return getTagInfoFromDatabase(tagName, databaseTags).color;
}

// Function to get tag info with consistent casing and color (legacy - uses only system tags)
export function getTagInfo(tagName: string): TagInfo {
  // Try exact match first
  if (SYSTEM_TAGS[tagName]) {
    return SYSTEM_TAGS[tagName];
  }

  // Try case-insensitive match
  const normalizedName = tagName.toLowerCase();
  const matchedKey = Object.keys(SYSTEM_TAGS).find(key => 
    key.toLowerCase() === normalizedName
  );

  if (matchedKey) {
    return SYSTEM_TAGS[matchedKey];
  }

  // Return default for unknown tags
  return {
    name: tagName,
    color: '#64748B',
    description: `Custom tag - ${tagName}`
  };
}

// Function to normalize tag name to standard casing
export function normalizeTagName(tagName: string): string {
  return getTagInfo(tagName).name;
}

// Function to get tag color (legacy - uses only system tags)
export function getTagColor(tagName: string): string {
  return getTagInfo(tagName).color;
}

// Function to get all system tag names
export function getAllSystemTagNames(): string[] {
  return Object.keys(SYSTEM_TAGS);
}

// Function to check if a tag is a system tag
export function isSystemTag(tagName: string): boolean {
  return Object.keys(SYSTEM_TAGS).some(key => 
    key.toLowerCase() === tagName.toLowerCase()
  );
}