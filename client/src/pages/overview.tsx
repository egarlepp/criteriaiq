import MainDashboard from "@/components/dashboard/main-dashboard";

// The home route ("/") renders the main dashboard directly. It used to be an
// "Overview" page with Dashboard + Team Management tabs; Team Management was
// never built and was removed, so the tab bar went with it. Legacy
// "/?tab=..." links simply land on the dashboard.
//
// No extra top margin here: the gap below the header bar comes from the shared
// `.page-scroll-content > .relative` padding, same as Create Project. The page
// title lives in the header bar, so there is no in-page title card.
export default function Overview() {
  return (
    <div data-testid="overview" className="max-w-full mx-auto h-full">
      <MainDashboard />
    </div>
  );
}
