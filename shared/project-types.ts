// The Project Type values the project form and project templates offer.
// One list so a seeded or imported project always carries a value the form
// can show.
export const PROJECT_TYPES = ["POC", "POV", "Trial", "Partner", "RTU"] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];
