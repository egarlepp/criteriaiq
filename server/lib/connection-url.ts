// Mask the password in a Postgres connection string for safe display.
//
// Used by the Database Connection Management routes. Lives in lib/ so a future extraction of the
// db-connections surface can keep importing the same helper without
// reaching back into routes.ts.
export function maskConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '****';
    return parsed.toString();
  } catch {
    // If URL parsing fails, mask password between last ':' before '@' and '@'
    // Using indexOf instead of regex to avoid ReDoS on malformed input
    const atIdx = url.indexOf('@');
    if (atIdx > 0) {
      const colonIdx = url.lastIndexOf(':', atIdx);
      if (colonIdx >= 0) {
        return url.slice(0, colonIdx + 1) + '****' + url.slice(atIdx);
      }
    }
    return url;
  }
}
