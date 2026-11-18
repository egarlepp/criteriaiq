/**
 * Utility functions for name formatting and capitalization
 */

export function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatFullName(firstName?: string | null, lastName?: string | null): string {
  const formattedFirst = firstName ? capitalizeWords(firstName.trim()) : '';
  const formattedLast = lastName ? capitalizeWords(lastName.trim()) : '';
  
  if (formattedFirst && formattedLast) {
    return `${formattedFirst} ${formattedLast}`;
  } else if (formattedFirst) {
    return formattedFirst;
  } else if (formattedLast) {
    return formattedLast;
  }
  return '';
}

/**
 * Best display label for a user: "First Last" when a name is available,
 * otherwise the email, otherwise the id. Structurally typed so callers don't
 * need the full `User` schema type.
 *
 * Single source of truth — previously duplicated verbatim in multiple
 * component scopes (e.g. config.tsx). Defining it once at module scope also
 * sidesteps the temporal-dead-zone class of bug that arises when a local
 * `const` form is referenced from a `useMemo` declared above it.
 */
export function getUserDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  id?: string | null;
}): string {
  return formatFullName(user.firstName, user.lastName) || user.email || user.id || '';
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: '', lastName: '' };
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  } else if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  } else {
    // If more than 2 parts, treat first as firstName and rest as lastName
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }
}
