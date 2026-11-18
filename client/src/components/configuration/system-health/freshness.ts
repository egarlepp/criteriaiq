// Live "updated Xs / Xm / Xh ago" formatter shared across the System
// Health overview header (Task #418) and every per-category Health tab
// (Task #425). Lives in its own module so the tabs can import it
// without pulling `SystemHealthSection.tsx` (which itself imports the
// tabs) — that would create a circular import. The overview module
// re-exports this helper so the existing test imports of
// `formatRelativeUpdatedAt` from `SystemHealthSection` keep working.
//
// Clamps to 0 so a clock skew between the client and the just-arrived
// data can't produce negative seconds (which would render as
// "-3s ago" and look broken). Caps the unit at hours — anything older
// than an hour and the dashboard is in a more pathological state than
// this label is meant to communicate.
export function formatRelativeUpdatedAt(updatedAtMs: number, currentMs: number): string {
  const diffSeconds = Math.max(0, Math.floor((currentMs - updatedAtMs) / 1000));
  if (diffSeconds < 60) return `updated ${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `updated ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `updated ${diffHours}h ago`;
}
