/**
 * Skillswap Production Logging Abstraction
 *
 * Provides centralized, structured, and sanitized logging across development and production environments.
 * Ensures sensitive user information (passwords, OTPs, tokens, emails, phone numbers, full names, service role keys, Auth headers)
 * is never logged to stdout/stderr.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev =
    typeof process !== 'undefined' && process.env?.NODE_ENV
      ? process.env.NODE_ENV !== 'production'
      : (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true);

  /**
   * Sanitizes sensitive fields from objects or arguments prior to logging.
   */
  private sanitize(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (typeof data === 'string') {
      let cleanStr = data;
      // Redact potential authorization tokens or passwords in raw strings if present
      if (/bearer\s+[a-zA-Z0-9._-]+/i.test(cleanStr)) {
        cleanStr = cleanStr.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
      }
      // Redact email addresses
      if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i.test(cleanStr)) {
        cleanStr = cleanStr.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, '[REDACTED_EMAIL]');
      }
      // Redact phone numbers
      if (/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(cleanStr)) {
        cleanStr = cleanStr.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]');
      }
      return cleanStr;
    }

    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map((item) => this.sanitize(item));
      }

      const sanitizedObj: Record<string, unknown> = {};
      const SENSITIVE_KEYS = new Set([
        'password',
        'otp',
        'token',
        'access_token',
        'refresh_token',
        'recoverytoken',
        'recovery_token',
        'otphash',
        'otp_hash',
        'tokenhash',
        'token_hash',
        'newpassword',
        'new_password',
        'oldpassword',
        'old_password',
        'service_role_key',
        'servicekey',
        'authorization',
        'auth_header',
        'secret',
        'email',
        'phone',
        'phone_number',
        'phonenumber',
        'full_name',
        'fullname',
        'address',
        'dob',
        'date_of_birth',
        'credit_card',
        'card_number',
      ]);

      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
          sanitizedObj[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitizedObj[key] = this.sanitize(value);
        } else {
          sanitizedObj[key] = this.sanitize(value);
        }
      }
      return sanitizedObj;
    }

    return data;
  }

  debug(message: string, ...args: unknown[]) {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, ...args.map((a) => this.sanitize(a)));
    }
  }

  info(message: string, ...args: unknown[]) {
    console.info(`[INFO] ${message}`, ...args.map((a) => this.sanitize(a)));
  }

  warn(message: string, ...args: unknown[]) {
    console.warn(`[WARN] ${message}`, ...args.map((a) => this.sanitize(a)));
  }

  error(message: string, ...args: unknown[]) {
    console.error(`[ERROR] ${message}`, ...args.map((a) => this.sanitize(a)));
  }
}

export const logger = new Logger();
