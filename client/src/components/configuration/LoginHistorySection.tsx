import { useRef, RefObject, useState, useEffect } from "react";
import { SearchFiltersSection } from "@/components/ui/search-filters-section";

// Admin › Monitoring & Audit › Login History (formerly User Management › Audit).
// The page content portals its filters into the Search & Filters card.
interface LoginHistorySectionProps {
  renderContent: (filterContainerRef: RefObject<HTMLDivElement | null>, filterReady: boolean) => React.ReactNode;
}

export default function LoginHistorySection({ renderContent }: LoginHistorySectionProps) {
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [filterReady, setFilterReady] = useState(false);

  useEffect(() => {
    if (filterContainerRef.current) {
      setFilterReady(true);
    }
  }, []);

  return (
    <div data-testid="login-history-section" className="space-y-4">
      <SearchFiltersSection>
        <div ref={filterContainerRef} />
      </SearchFiltersSection>
      {renderContent(filterContainerRef, filterReady)}
    </div>
  );
}
