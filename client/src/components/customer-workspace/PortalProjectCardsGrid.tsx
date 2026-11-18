import type { CSSProperties, ReactNode } from "react";
import { useProjectJourneys } from "@/components/value-journey/use-value-journey";

// Sizes of the pieces in a project card's bottom row (ProjectCard with
// JourneyStageTrack variant="icons"), in px.
const STAGE_ICON = 28; // h-7 w-7
const STAGE_STEP = 4 + 8 + 4; // gap, connector (w-2), gap before each later stage
const GATE = 12 + 4; // agreement diamond (h-3 w-3) and its gap
const BUTTONS = 4 * 36 + 3 * 6; // View, Messages, View MAP, Account Users (h-9, gap-1.5)
const CARD_CHROME = 2 * 20 + 2 + 12 + 8; // p-5 both sides, border, gap to the buttons, slack
/** Narrowest column when no project has a journey yet. */
const MIN_COLUMN = 340;
const MAX_COLUMNS = 3;

/** Width of a one-line icon track with `stages` stages and `gates` agreement diamonds. */
export function journeyTrackWidth(stages: number, gates: number): number {
  if (stages <= 0) return 0;
  return stages * STAGE_ICON + (stages - 1) * STAGE_STEP + gates * GATE;
}

/** The narrowest card that shows every journey stage on one line beside the buttons. */
export function projectCardMinWidth(tracks: Array<{ stages: number; gates: number }>): number {
  const widest = Math.max(0, ...tracks.map((track) => journeyTrackWidth(track.stages, track.gates)));
  return Math.max(MIN_COLUMN, widest + BUTTONS + CARD_CHROME);
}

/**
 * The Account Portal's project card grid. Columns are never narrower than
 * the widest card's journey track needs, so the stages stay on one line and
 * the cards keep one height: as the page narrows, a row drops from three
 * cards to two, then one, and a card is never narrower than its stages
 * (a single card scrolls sideways on a very narrow screen). Fewer
 * projects than columns stretch to fill the row.
 */
export function PortalProjectCardsGrid({ projectIds, children }: { projectIds: number[]; children: ReactNode }) {
  const journeys = useProjectJourneys(projectIds);
  const minWidth = projectCardMinWidth(
    projectIds.map((id) => {
      const stages = journeys.get(id)?.stages ?? [];
      return { stages: stages.length, gates: stages.filter((stage) => stage.agreementGate).length };
    }),
  );
  // Each column is at least the card's width and at least a third of the
  // row, so a row holds at most three. A card never gets narrower than its
  // stages: below one card's width the row scrolls sideways instead.
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fit, minmax(max(${minWidth}px, calc((100% - ${MAX_COLUMNS - 1}rem) / ${MAX_COLUMNS})), 1fr))`,
    // Every row as tall as the tallest card, so all cards share one height.
    gridAutoRows: "1fr",
  };
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid gap-4" style={style} data-testid="portal-project-cards-grid">
        {children}
      </div>
    </div>
  );
}
