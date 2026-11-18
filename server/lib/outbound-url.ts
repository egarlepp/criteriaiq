// Checks for URLs an admin types that the server then calls, often with a
// secret attached: outbound webhooks, n8n, the AI webhook provider and Azure
// OpenAI. Ported from ImpactIQ's services/net/ssrfGuard.ts.
//
// CriteriaIQ is self-hosted and often runs beside n8n or ImpactIQ on the same
// Docker network or VNet, so private (RFC 1918 / IPv6 ULA) addresses are
// allowed. Loopback, link-local (which includes the 169.254.169.254 cloud
// metadata endpoint), unspecified and multicast/reserved addresses never are,
// since no real service the app talks to lives there. Hostnames are resolved,
// so a public name that points at a blocked address is refused too.
//
// Call sites also pass `redirect: "manual"` to fetch, so a host that passes
// this check can't bounce the request somewhere that wouldn't.
import { promises as dns } from "node:dns";

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlError";
  }
}

export interface OutboundUrlOptions {
  /** Refuse plain http:// even for a private address (Azure OpenAI). */
  requireHttps?: boolean;
}

// Local development points n8n and webhooks at localhost; production never may.
function loopbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function assertOutboundUrl(rawUrl: string, options: OutboundUrlOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OutboundUrlError("URL is not valid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OutboundUrlError("Only http:// or https:// URLs are allowed");
  }
  if (options.requireHttps && url.protocol !== "https:") {
    throw new OutboundUrlError("Only https:// URLs are allowed");
  }
  if (url.username || url.password) {
    throw new OutboundUrlError("URLs with a user name or password are not allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIpLiteral(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new OutboundUrlError("URL host could not be resolved");
    }
  }
  for (const address of addresses) {
    if (isLoopback(address) && loopbackAllowed()) continue;
    if (isNeverAllowedAddress(address)) {
      throw new OutboundUrlError("URL resolves to a loopback, link-local or reserved address");
    }
  }
  return url;
}

function isIpLiteral(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
}

// An IPv4-mapped IPv6 address is judged as its IPv4 form. URL parsing writes
// [::ffff:127.0.0.1] as ::ffff:7f00:1, so both spellings are handled.
function unmapIpv4(address: string): string {
  const a = address.replace(/^\[|\]$/g, "").toLowerCase();
  const dotted = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;
  const hex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return a;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function isLoopback(address: string): boolean {
  const a = unmapIpv4(address);
  return a === "::1" || /^127\./.test(a);
}

export function isNeverAllowedAddress(address: string): boolean {
  const a = unmapIpv4(address);
  const v4 = a.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const b1 = Number(v4[1]);
    const b2 = Number(v4[2]);
    return b1 === 127 || b1 === 0 || (b1 === 169 && b2 === 254) || b1 >= 224;
  }
  return (
    a === "::1" ||
    a === "::" ||
    a.startsWith("fe8") ||
    a.startsWith("fe9") ||
    a.startsWith("fea") ||
    a.startsWith("feb") ||
    a.startsWith("ff")
  );
}

const SALESFORCE_HOST_SUFFIXES = ["salesforce.com", "force.com"];

// The Salesforce login URL receives the Connected App's client secret during
// the OAuth token exchange, so it must be an https Salesforce host
// (login, test, or a My Domain). A real suffix match, so neither
// "evil-salesforce.com" nor "salesforce.com.attacker.net" passes.
export function salesforceLoginUrlProblem(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "URL is not valid";
  }
  if (url.protocol !== "https:") return "Only https:// URLs are allowed";
  if (url.username || url.password) return "URLs with a user name or password are not allowed";
  const host = url.hostname.toLowerCase();
  const ok = SALESFORCE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  return ok ? null : "URL must be a salesforce.com or force.com host";
}
