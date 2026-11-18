// Account (customer) logo URLs.
//
// On a cloud storage provider (GCS, S3, Azure) an upload's URL is a signed
// URL that expires after an hour, yet it is what customers.logo_url keeps.
// Reads re-sign it from the object key, the same way branding assets are
// refreshed (server/routes/branding-routes.ts). Local and database storage
// use /api/files/ URLs, which never expire and pass through unchanged.
// cloud-storage is loaded lazily so server/storage.ts can import the pure
// logoUrlToObjectKey without pulling the storage drivers in.

/** Resolves the storage object key from a logo URL, or null if unparseable. */
export function logoUrlToObjectKey(logoUrl: string, bucketName: string | null): string | null {
  if (logoUrl.startsWith('/api/files/')) {
    try {
      return decodeURIComponent(logoUrl.replace('/api/files/', ''));
    } catch {
      return null;
    }
  }
  if (!logoUrl.startsWith('https://') || !bucketName) return null;
  try {
    const urlObj = new URL(logoUrl);
    const pathname = decodeURIComponent(urlObj.pathname.slice(1)); // remove leading /
    // GCS / S3-path-style / Azure: bucket or container is the first path segment
    if (pathname.startsWith(bucketName + '/')) {
      return pathname.slice(bucketName.length + 1);
    }
    // S3 virtual-hosted-style: bucket name is in the hostname (BUCKET.s3.…)
    if (urlObj.hostname.startsWith(bucketName + '.')) {
      return pathname;
    }
  } catch {
    // malformed URL — fall through
  }
  return null;
}

const LOGO_URL_TTL_MINUTES = 60;

/** Returns a logo URL that loads now: cloud URLs re-signed, others unchanged. */
export async function freshLogoUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('/api/files/')) return logoUrl;
  const { generateSignedUrl, getActiveBucketName, isCloudConfigured } = await import('./cloud-storage');
  if (!isCloudConfigured()) return logoUrl;
  const objectKey = logoUrlToObjectKey(logoUrl, getActiveBucketName());
  if (!objectKey) return logoUrl;
  try {
    return await generateSignedUrl(objectKey, LOGO_URL_TTL_MINUTES);
  } catch (err) {
    console.warn('[customer-logo] Could not re-sign logo URL:', err instanceof Error ? err.message : String(err));
    return logoUrl;
  }
}

/** Same row with its logoUrl refreshed (see freshLogoUrl). */
export async function withFreshLogo<T extends { logoUrl?: string | null }>(customer: T): Promise<T> {
  if (!customer.logoUrl) return customer;
  const url = await freshLogoUrl(customer.logoUrl);
  return url === customer.logoUrl ? customer : { ...customer, logoUrl: url };
}
