import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { AppearanceSubTab } from "./appearance-tabs";

const ThemingSection = lazy(() => import("./ThemingSection").then((m) => ({ default: m.ThemingSection })));
const MediaSection = lazy(() => import("./MediaSection").then((m) => ({ default: m.MediaSection })));

/**
 * Admin › Appearance: Theming (chrome colors) and Media (logos and
 * backgrounds). The Admin second-tier menu switches between them.
 */
export function AppearanceSection({ activeSubTab }: { activeSubTab: AppearanceSubTab }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      }
    >
      {activeSubTab === "media" ? <MediaSection /> : <ThemingSection />}
    </Suspense>
  );
}
