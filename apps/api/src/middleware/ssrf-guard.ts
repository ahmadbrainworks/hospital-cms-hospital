/**
 * SSRF guard — blocks any request that would cause the server to fetch
 * private/loopback/link-local addresses on behalf of untrusted user input.
 *
 * Used to protect plugin package download URLs and any URL-accepting API
 * fields. All outbound fetches from trusted server code should call
 * assertSafeUrl() before fetch().
 */
import { ForbiddenError } from '@hospital-cms/errors';

// RFC 5735 / RFC 4193 private/reserved ranges
const BLOCKED_PATTERNS = [
  // Loopback
  /^127\./,
  /^::1$/,
  /^localhost$/i,
  // Private RFC1918
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Link-local
  /^169\.254\./,
  /^fe80:/i,
  // Unique local
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  // Cloud metadata endpoints
  /^169\.254\.169\.254$/,           // AWS / GCP / Azure IMDS
  /metadata\.google\.internal$/i,
  /^100\.100\.100\.200$/,           // Alibaba Cloud IMDS
];

export class SsrfError extends ForbiddenError {
  constructor(url: string) {
    super(`SSRF: request to '${url}' is blocked — private/reserved address`);
  }
}

/**
 * Synchronously validates that a URL doesn't point at an internal resource.
 * Throws SsrfError if the hostname is private.
 *
 * @param rawUrl  URL string to validate (from user input, manifest, etc.)
 */
export function assertSafeUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(rawUrl);
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SsrfError(rawUrl);
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new SsrfError(rawUrl);
    }
  }
}

/**
 * Validates a list of URLs (e.g. plugin/theme packageUrl fields in desired state).
 * Throws on the first blocked URL found.
 */
export function assertSafeUrls(urls: string[]): void {
  for (const url of urls) {
    assertSafeUrl(url);
  }
}
