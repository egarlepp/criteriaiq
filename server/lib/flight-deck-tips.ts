// Flight Deck "Tip of the Day" helpers.
//
// Shared between:
//   - server/routes/admin-flight-deck-tips-routes.ts (admin CRUD + seed)
//   - server/routes.ts (Flight Deck engine endpoints that surface a
//     random tip alongside other widgets)
//
// `defaultTipsOfTheDay` is the hard-coded fallback used both by the
// seed endpoint and by `getRandomTip` when the database is empty (e.g.
// a fresh install where the admin hasn't seeded any tips yet).
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { flightDeckTips } from "@shared/schema";

export const defaultTipsOfTheDay = [
  "Tip: MAPs drive mutual accountability between you and your customer.",
  "Tip: Document all decisions in real-time - memory fades, notes persist.",
  "Tip: Every success criterion should have a clear owner.",
  "Tip: Risk identification early beats problem-solving late.",
  "Tip: Sync with stakeholders weekly - alignment prevents surprises.",
  "Tip: Use templates to maintain consistency across projects.",
  "Tip: Celebrate small wins - they build momentum.",
  "Tip: Customer health checks prevent silent churn.",
  "Tip: Your best deals are reference-ready customers.",
  "Tip: Listen twice as much as you speak in discovery.",
];

// Pull a random active tip from the DB; fall back to the hard-coded
// `defaultTipsOfTheDay` when no rows are present (fresh installs).
export async function getRandomTip(): Promise<string> {
  const tips = await storage.db
    .select({ tipText: flightDeckTips.tipText })
    .from(flightDeckTips)
    .where(eq(flightDeckTips.isActive, true))
    .orderBy(flightDeckTips.displayOrder);

  if (tips.length > 0) {
    return tips[Math.floor(Math.random() * tips.length)].tipText;
  }
  return defaultTipsOfTheDay[Math.floor(Math.random() * defaultTipsOfTheDay.length)];
}
