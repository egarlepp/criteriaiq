// Queries and shared helpers for the value journey (shared/value-journey.ts):
// the admin's stages, a project's journey, the customer's agreement to the
// success criteria and the warm handoff team. Every screen that changes one
// of these calls invalidateProjectJourney so the others refresh.
import type { TFunction } from "i18next";
import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query";
import type { JourneyStage } from "@shared/schema";
import type { AgreedCriterion } from "@shared/schema";
import type { AgreementChanges, AgreementStatus, ComputedJourneyStage } from "@shared/value-journey";

export interface ProjectJourney {
  stages: ComputedJourneyStage[];
  agreement: {
    status: AgreementStatus;
    agreedAt: string | null;
    agreedByName: string | null;
    requestedAt: string | null;
  };
}

export interface AgreementPerson {
  id: string;
  name: string | null;
  email: string | null;
}

export interface CriteriaAgreementView {
  id: number;
  requestedAt: string;
  requestedBy: AgreementPerson | null;
  recipients: AgreementPerson[];
  agreedAt: string | null;
  agreedByUserId: string | null;
  agreedByName: string | null;
  agreedByTitle: string | null;
  criteriaSnapshot: AgreedCriterion[] | null;
}

export interface CriteriaAgreementState {
  status: AgreementStatus;
  current: CriteriaAgreementView | null;
  lastAgreed: CriteriaAgreementView | null;
  changes: AgreementChanges | null;
  history: CriteriaAgreementView[];
}

export interface HandoffContact {
  userId: string;
  responsibility: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  found: boolean;
}

/** A success criterion as the MAP drawer sees it (GET /api/projects/:id/map). */
export interface MapCriterion {
  id: number;
  lineNumber: number | null;
  productName: string | null;
  criterion: string | null;
  status: string | null;
  priority: string;
  mapPhaseId: number | null;
  isActive: boolean | null;
}

export interface JourneyStageWithUsage extends JourneyStage {
  templateCount: number;
  phaseCount: number;
}

export const JOURNEY_STAGES_KEY = "/api/journey-stages";
export const journeyKey = (projectId: number) => `/api/projects/${projectId}/journey`;
export const agreementKey = (projectId: number) => `/api/projects/${projectId}/criteria-agreement`;
export const handoffKey = (projectId: number) => `/api/projects/${projectId}/handoff-team`;

export function useJourneyStages(enabled = true) {
  return useQuery<JourneyStage[]>({ queryKey: [JOURNEY_STAGES_KEY], enabled, staleTime: 60_000 });
}

export function useJourneyStagesWithUsage(enabled = true) {
  return useQuery<JourneyStageWithUsage[]>({ queryKey: [`${JOURNEY_STAGES_KEY}?include=usage`], enabled });
}

export function useProjectJourney(projectId: number | null | undefined) {
  return useQuery<ProjectJourney>({
    queryKey: [journeyKey(projectId ?? 0)],
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

/** Several projects' journeys at once (the Account Portal roadmap); shares the cache with useProjectJourney. */
export function useProjectJourneys(projectIds: number[]) {
  return useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: [journeyKey(projectId)],
      staleTime: 30_000,
    })),
    combine: (results) => {
      const byProject = new Map<number, ProjectJourney>();
      results.forEach((result, index) => {
        if (result.data) byProject.set(projectIds[index], result.data as ProjectJourney);
      });
      return byProject;
    },
  });
}

export function useCriteriaAgreement(projectId: number | null | undefined, enabled = true) {
  return useQuery<CriteriaAgreementState>({
    queryKey: [agreementKey(projectId ?? 0)],
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });
}

export function useHandoffTeam(projectId: number | null | undefined, enabled = true) {
  return useQuery<HandoffContact[]>({ queryKey: [handoffKey(projectId ?? 0)], enabled: enabled && !!projectId });
}

/** Refreshes everything the journey reads after a criteria, plan or agreement change. */
export function invalidateProjectJourney(queryClient: QueryClient, projectId: number) {
  for (const key of [journeyKey(projectId), agreementKey(projectId), `/api/projects/${projectId}/map`]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
  // The project page keys the project and its MAP as ["/api/projects", id, ...].
  void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
}

/** "#rrggbb" to rgba(), for tinted stage backgrounds; a bad value falls back to the brand blue. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(30,64,175,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

type Translate = TFunction;

/** A stage's state in words: done, current stage, not started. */
export function journeyStateText(stage: ComputedJourneyStage, t: Translate): string {
  return stage.state === "done"
    ? t("valueJourney.state.done")
    : stage.state === "current"
      ? t("valueJourney.state.current")
      : t("valueJourney.state.upcoming");
}

/**
 * The short line under a stage: "Done Nov 3", "2 of 4 must-haves met" or
 * "Due Nov 21", falling back to the state. Shared by the project page's
 * journey card and the Edit Project journey banner.
 */
export function journeyStageSubline(stage: ComputedJourneyStage, t: Translate, lang: string): string {
  const shortDate = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" });
  const fmt = (value: string | null) => (value ? shortDate.format(new Date(value)) : null);
  if (stage.state === "done") {
    const date = fmt(stage.completedDate);
    return date ? t("valueJourney.card.doneOn", { date }) : t("valueJourney.state.done");
  }
  if (stage.state === "current" && stage.mustHaves.total > 0) {
    return t("valueJourney.card.mustHavesMet", { met: stage.mustHaves.met, total: stage.mustHaves.total });
  }
  const due = fmt(stage.dueDate);
  return due ? t("valueJourney.card.dueOn", { date: due }) : journeyStateText(stage, t);
}
