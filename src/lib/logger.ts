/**
 * Skillswap Production Logging Abstraction
 *
 * Provides centralized, structured, and sanitized logging across development and production environments.
 * Ensures sensitive user information (passwords, OTPs, tokens, service role keys, Auth headers)
 * is never logged to stdout/stderr.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

  /**
   * Sanitizes sensitive fields from objects or arguments prior to logging.
   */
  private sanitize(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (typeof data === 'string') {
      // Redact potential authorization tokens or passwords in raw strings if present
      if (/bearer\s+[a-zA-Z0-9._-]+/i.test(data)) {
        return data.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
      }
      return data;
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
        'service_role_key',
        'serviceKey',
        'authorization',
        'auth_header',
        'secret',
      ]);

      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
          sanitizedObj[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitizedObj[key] = this.sanitize(value);
        } else {
          sanitizedObj[key] = value;
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
