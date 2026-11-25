// Where a solution's uploaded graphic (products.solutionIcon) is served from.
// Same rule as the client's solutionGraphicUrl (client/src/components/ui/
// solution-graphic.tsx): a bare filename lives under system/solution-icons/,
// a path or URL is used as it is, and "none" or blank means no graphic.
export function solutionGraphicPath(graphic: string | null | undefined): string | null {
  const g = graphic?.trim();
  if (!g || g === "none") return null;
  if (g.startsWith("/") || /^https?:\/\//.test(g)) return g;
  return `/api/files/system/solution-icons/${encodeURIComponent(g)}`;
}
