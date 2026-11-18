export function isEngineerOnProject(
  project: {
    primaryEngineerId?: string | null;
    specialistEngineerId?: string | null;
    opportunityEngineerId?: string | null;
    supportingEngineers?: string[] | null;
    supportingEngineerIds?: string[] | null;
  },
  userId: string,
): boolean {
  if (!userId) return false;
  return (
    project.primaryEngineerId === userId ||
    project.specialistEngineerId === userId ||
    project.opportunityEngineerId === userId ||
    (Array.isArray(project.supportingEngineers) && project.supportingEngineers.includes(userId)) ||
    (Array.isArray(project.supportingEngineerIds) && project.supportingEngineerIds.includes(userId))
  );
}
