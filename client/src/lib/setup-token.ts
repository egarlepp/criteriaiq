// The first-run setup token (server/lib/setup-token.ts). Kept in
// sessionStorage for the wizard's tab only, and sent as X-Setup-Token on
// every /api/setup request.
const STORAGE_KEY = "criteriaiq.setupToken";
export const SETUP_TOKEN_REJECTED_EVENT = "criteriaiq:setup-token-rejected";

let memoryToken: string | null = null;

export function getSetupToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setSetupToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the in-memory copy still covers this page load.
  }
}

/** fetch() for /api/setup routes: adds the token and reports a rejected one. */
export async function setupFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSetupToken();
  if (token) headers.set("X-Setup-Token", token);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => null);
    const code = body && typeof body === "object" ? (body as { errorCode?: unknown }).errorCode : undefined;
    if (code === "setupTokenRequired" || code === "setupTokenInvalid") {
      setSetupToken(null);
      window.dispatchEvent(new Event(SETUP_TOKEN_REJECTED_EVENT));
    }
  }
  return res;
}
