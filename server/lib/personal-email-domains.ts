// Personal and disposable email domains: never a company address, so user
// creation, user import, email changes and CRM contact imports refuse them.
export const PERSONAL_EMAIL_DOMAINS: readonly string[] = [
  "gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com",
  "aol.com", "protonmail.com", "mailinator.com", "10minutemail.com",
  "guerrillamail.com", "temp-mail.org", "yopmail.com",
];

const PERSONAL = new Set(PERSONAL_EMAIL_DOMAINS);

/** The domain part of an email, lower-cased; "" when there is none. */
export function emailDomainOf(email: string | null | undefined): string {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@");
  return at < 0 ? "" : (email ?? "").trim().toLowerCase().slice(at + 1);
}

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL.has(domain.trim().toLowerCase());
}
