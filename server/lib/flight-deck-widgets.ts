// Flight Deck widget data assemblers (Phase 8 followup).
//
// The admin Flight Deck preview endpoint
// (server/routes/admin-flight-deck-configs-routes.ts) and the user-facing
// data feed (server/routes/user-flight-deck-routes.ts) both run the same
// per-widget aggregation pipeline, just with different response
// shaping (admin dumps everything, user applies per-setting visibility
// flags). This module extracts the shared aggregation so the two
// endpoints can call into the same logic.
//
// Each `assembleXData(userId, storage)` returns the FULL set of
// metrics for that widget. Callers apply their own field filtering.
import { and, eq } from "drizzle-orm";
import { projects } from "@shared/schema";

// Health Pulse: per-engineer project status / customer sentiment /
// deal urgency / pipeline value / win rate / workload count.
export async function assembleHealthPulseData(userId: string, storage: any) {
  // Exclude demo projects so seeded sample data never inflates the
  // engineer's metrics in the Flight Deck.
  const projectRows = await storage.db
    .select({
      status: projects.status,
      customerStatus: projects.customerStatus,
      ranking: projects.ranking,
      opportunityAcvValue: projects.opportunityAcvValue,
    })
    .from(projects)
    .where(and(eq(projects.primaryEngineerId, userId), eq(projects.isDemo, false)));

  const processStatus = { pending: 0, active: 0, closed: 0, stalled: 0, tcc: 0 };
  const customerStatus = { smooth: 0, friction: 0, atRisk: 0 };
  const dealUrgency: Record<string, number> = {};
  let pipelineValue = 0;
  let closedWon = 0;
  let closedLost = 0;
  let workloadCount = 0;

  projectRows.forEach((p: any) => {
    const ns = p.status?.toLowerCase() || '';
    if (ns === 'planning') processStatus.pending++;
    else if (['in progress', 'complete'].includes(ns)) processStatus.active++;
    else if (['closed won', 'closed lost', 'cancelled'].includes(ns)) processStatus.closed++;
    else if (ns === 'on hold') processStatus.stalled++;
    else if (ns === 'tcc') processStatus.tcc++;

    const cs = p.customerStatus?.toLowerCase() || '';
    if (['on time', 'complete', 'selecting solution'].includes(cs)) customerStatus.smooth++;
    else if (['need assistance', 'delayed', 'in cab', 'pending feedback'].includes(cs)) customerStatus.friction++;
    else if (cs === 'evaluating competitors') customerStatus.atRisk++;

    const ranking = p.ranking || 'Unranked';
    dealUrgency[ranking] = (dealUrgency[ranking] || 0) + 1;

    const closedStatuses = ['closed won', 'closed lost', 'cancelled', 'tcc'];
    if (!closedStatuses.includes(ns)) {
      const acv = parseFloat(p.opportunityAcvValue?.replace(/[^0-9.-]/g, '') || '0');
      if (!isNaN(acv)) pipelineValue += acv;
      workloadCount++;
    }

    if (ns === 'closed won') closedWon++;
    else if (ns === 'closed lost') closedLost++;
  });

  const totalClosed = closedWon + closedLost;
  const winRate = totalClosed > 0 ? Math.round((closedWon / totalClosed) * 100) : null;

  return { processStatus, customerStatus, dealUrgency, pipelineValue, winRate, workloadCount };
}

// Risk Radar: per-engineer risk/ranking distributions, deadline
// tracking, pending-TCC tracking, and curated highAlertProjects list.
export async function assembleRiskRadarData(userId: string, storage: any) {
  // Same demo filter as Health Pulse — high-alert lists and deadline
  // counts should never call out seeded demo rows.
  const projectRows = await storage.db
    .select({
      id: projects.id,
      solutionName: projects.solutionName,
      risk: projects.risk,
      ranking: projects.ranking,
      customerStatus: projects.customerStatus,
      status: projects.status,
      endDate: projects.endDate,
    })
    .from(projects)
    .where(and(eq(projects.primaryEngineerId, userId), eq(projects.isDemo, false)));

  const riskCounts = { red: 0, yellow: 0 };
  const technicalRiskCounts = { red: 0, yellow: 0, green: 0 };
  const rankingCounts = { inQuarter: 0, burnItDown: 0 };
  const highAlertProjects: Array<{ id: number; name: string; reason: string }> = [];
  const deadlineCounts = { endingToday: 0, endingThisWeek: 0, overdue: 0 };
  const deadlineProjects: Array<{ id: number; name: string; reason: string; daysOverdue?: number }> = [];
  let pendingTccCount = 0;
  const pendingTccProjects: Array<{ id: number; name: string }> = [];

  const finalStatuses = ['tcc', 'closed won', 'closed lost', 'cancelled'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);

  projectRows.forEach((p: any) => {
    const risk = p.risk?.toLowerCase() || '';
    if (risk === 'red') {
      riskCounts.red++;
      technicalRiskCounts.red++;
      highAlertProjects.push({ id: p.id, name: p.solutionName, reason: 'Red Risk' });
    } else if (risk === 'yellow') {
      riskCounts.yellow++;
      technicalRiskCounts.yellow++;
    } else if (risk === 'green') {
      technicalRiskCounts.green++;
    }

    const rank = p.ranking?.toLowerCase() || '';
    if (rank === 'in quarter') rankingCounts.inQuarter++;
    if (rank === 'burn it down') rankingCounts.burnItDown++;

    const cs = p.customerStatus?.toLowerCase() || '';
    if (cs === 'evaluating competitors' && !highAlertProjects.find(h => h.id === p.id)) {
      highAlertProjects.push({ id: p.id, name: p.solutionName, reason: 'Evaluating Competitors' });
    }

    const ns = p.status?.toLowerCase() || '';
    if (!finalStatuses.includes(ns) && p.endDate) {
      const closeDate = new Date(p.endDate);
      closeDate.setHours(0, 0, 0, 0);

      if (closeDate < today) {
        const daysOverdue = Math.floor((today.getTime() - closeDate.getTime()) / (1000 * 60 * 60 * 24));
        deadlineCounts.overdue++;
        deadlineProjects.push({ id: p.id, name: p.solutionName, reason: `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`, daysOverdue });
      } else if (closeDate.getTime() === today.getTime()) {
        deadlineCounts.endingToday++;
        deadlineProjects.push({ id: p.id, name: p.solutionName, reason: 'Ends today' });
      } else if (closeDate <= endOfWeek) {
        deadlineCounts.endingThisWeek++;
        const daysUntil = Math.floor((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        deadlineProjects.push({ id: p.id, name: p.solutionName, reason: `Ends in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}` });
      }
    }

    if (ns === 'complete' && (ns as string) !== 'tcc') {
      pendingTccCount++;
      pendingTccProjects.push({ id: p.id, name: p.solutionName });
    }
  });

  return {
    riskCounts,
    technicalRiskCounts,
    rankingCounts,
    highAlertProjects,
    deadlineCounts,
    deadlineProjects,
    pendingTccCount,
    pendingTccProjects,
  };
}

// Resume widget: just looks up one project by id. Demo projects
// (is_demo = true) are excluded — the Flight Deck should never offer
// to "resume" seeded demo data, even if the user happened to open one
// most recently.
export async function assembleResumeWidget(lastAccessedProjectId: number, storage: any) {
  const [lastProject] = await storage.db
    .select({
      id: projects.id,
      solutionName: projects.solutionName,
      customerName: projects.customerName,
      isDemo: projects.isDemo,
    })
    .from(projects)
    .where(eq(projects.id, lastAccessedProjectId))
    .limit(1);

  if (!lastProject) return null;
  if (lastProject.isDemo) return null;
  return {
    projectId: lastProject.id,
    projectName: lastProject.solutionName,
    customerName: lastProject.customerName,
  };
}
