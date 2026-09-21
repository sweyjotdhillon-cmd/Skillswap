/**
 * Validates an untrusted redirectTo candidate and returns a safe internal path.
 * If candidate is invalid, malicious, or external, returns defaultPath (defaults to '/explore').
 */
export function getSafeRedirect(candidate?: string | null, defaultPath: string = '/explore'): string {
  const safeDefault = defaultPath.startsWith('/') ? defaultPath : '/explore';

  if (!candidate || typeof candidate !== 'string') {
    return safeDefault;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return safeDefault;
  }

  // Reject candidates starting with protocol-relative or backslash sequences
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('\\') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('/%2f') ||
    trimmed.startsWith('/%2F') ||
    trimmed.startsWith('/%5c') ||
    trimmed.startsWith('/%5C')
  ) {
    return safeDefault;
  }

  // Reject encoded path escaping or CRLF injection attempts
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('%2f%2f') ||
    lower.includes('%5c') ||
    lower.includes('%0a') ||
    lower.includes('%0d') ||
    lower.includes('\r') ||
    lower.includes('\n')
  ) {
    return safeDefault;
  }

  // Reject absolute URLs / explicit protocol specifiers (e.g., http:, https:, javascript:, data:, vbscript:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return safeDefault;
  }

  // Base origin for resolution
  let baseOrigin = 'https://skillswap.sweyjotdhillon.workers.dev';
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    baseOrigin = window.location.origin;
  }

  try {
    const url = new URL(trimmed, baseOrigin);

    // Enforce origin identity
    if (url.origin !== baseOrigin) {
      return safeDefault;
    }

    // Ensure pathname starts with single slash and is not protocol-relative or backslash escaped
    if (
      !url.pathname.startsWith('/') ||
      url.pathname.startsWith('//') ||
      url.pathname.startsWith('/\\')
    ) {
      return safeDefault;
    }

    return url.pathname + url.search + url.hash;
  } catch {
    return safeDefault;
  }
}
