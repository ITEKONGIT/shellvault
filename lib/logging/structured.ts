/**
 * Structured Logging Standard
 *
 * All application logs MUST conform to this schema.
 * No console.log, no console.error, no unstructured output.
 *
 * Log Schema:
 * {
 *   level: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
 *   service: string,           // Always 'shellvault'
 *   event: string,             // Machine-readable event code (e.g., AUTH_LOGIN_001)
 *   message: string,           // Human-readable message
 *   context: {},               // Arbitrary structured data (NEVER contains secrets)
 *   requestId?: string,        // HTTP request correlation ID
 *   userId?: string,           // Authenticated user (if available)
 *   ip?: string,               // Client IP address
 *   userAgent?: string,        // Client user agent
 *   timestamp: string,         // ISO 8601
 *   environment: string        // 'development' | 'production' | 'test'
 * }
 *
 * Security rules:
 * - NEVER log passwords, tokens, secrets, private keys
 * - NEVER log credit cards, SSNs, personal data (PII)
 * - UUIDs and hashes are safe to log
 * - When in doubt, use logger.sensitive() which automatically redacts known patterns
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { getBuildConfig } from '../config/env';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  service: string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  timestamp?: string;
  environment?: string;
}

export interface LoggerOptions {
  logDir?: string;
  maxFileSize?: number;     // bytes
  maxFiles?: number;
  enableConsole?: boolean;
  enableFile?: boolean;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs');
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_FILES = 5;

// Patterns that MUST never appear in logs
const SENSITIVE_PATTERNS = [
  // Passwords and secrets
  /(password|passwd|pwd)\s*[:=]\s*\S+/gi,
  /(secret|token|key)\s*[:=]\s*['"]\S+['"]/gi,
  /authorization\s*:\s*bearer\s+\S+/gi,
  /-----BEGIN\s+(RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+\w+\s+PRIVATE\s+KEY-----/gi,
  // Credit card patterns
  /\b(?:\d[ -]*?){13,16}\b/g,
  // API keys (common prefixes)
  /\b(sk-[a-zA-Z0-9]{24,})\b/g,
  /\b(pk_[a-zA-Z0-9]{24,})\b/g,
  /\b(ghp_[a-zA-Z0-9]{36,})\b/g,
];

// ────────────────────────────────────────────────────────────────
// Redaction
// ────────────────────────────────────────────────────────────────

/**
 * Recursively redact sensitive patterns from any value.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[MAX_DEPTH]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    let redacted = value;
    for (const pattern of SENSITIVE_PATTERNS) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Always redact known sensitive keys regardless of value
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('privatekey') ||
        lowerKey.includes('apikey')
      ) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitive(val, depth + 1);
      }
    }
    return result;
  }

  return '[UNKNOWN_TYPE]';
}

// ────────────────────────────────────────────────────────────────
// Winston formatter
// ────────────────────────────────────────────────────────────────

function buildWinstonFormat() {
  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format((info) => {
      // Redact before output
      if (info.context) {
        info.context = redactSensitive(info.context) as Record<string, unknown>;
      }
      if (info.message && typeof info.message === 'string') {
        info.message = redactSensitive(info.message) as string;
      }
      return info;
    })(),
    winston.format.json()
  );
}

function buildConsoleFormat() {
  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, event, message, ...meta }) => {
      const eventStr = event ? `[${event}] ` : '';
      const metaStr = Object.keys(meta).length
        ? ' ' + JSON.stringify(redactSensitive(meta))
        : '';
      return `${timestamp} [${level}] ${eventStr}${message}${metaStr}`;
    })
  );
}

// ────────────────────────────────────────────────────────────────
// Logger factory
// ────────────────────────────────────────────────────────────────

let _logger: winston.Logger | null = null;

function createLogger(options?: LoggerOptions): winston.Logger {
  const opts = {
    logDir: options?.logDir ?? DEFAULT_LOG_DIR,
    maxFileSize: options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
    maxFiles: options?.maxFiles ?? DEFAULT_MAX_FILES,
    enableConsole: options?.enableConsole ?? true,
    enableFile: options?.enableFile ?? true,
  };

  // Ensure log directory exists (safe to run multiple times)
  try {
    if (!fs.existsSync(opts.logDir)) {
      fs.mkdirSync(opts.logDir, { recursive: true });
    }
  } catch (error) {
    console.error(`[Logger] Failed to create log directory: ${opts.logDir}`, error);
  }

  const transports: winston.transport[] = [];

  if (opts.enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: buildConsoleFormat(),
      })
    );
  }

  if (opts.enableFile) {
    transports.push(
      new winston.transports.File({
        filename: path.join(opts.logDir, 'combined.log'),
        maxsize: opts.maxFileSize,
        maxFiles: opts.maxFiles,
        format: buildWinstonFormat(),
      })
    );

    transports.push(
      new winston.transports.File({
        filename: path.join(opts.logDir, 'error.log'),
        level: 'error',
        maxsize: opts.maxFileSize,
        maxFiles: opts.maxFiles,
        format: buildWinstonFormat(),
      })
    );
  }

  const buildConfig = getBuildConfig();

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
      service: 'shellvault',
      environment: buildConfig.NODE_ENV,
    },
    transports,

    // Exit on uncaught error in production
    exitOnError: buildConfig.NODE_ENV === 'production',
  });
}

/**
 * Get the application logger singleton.
 */
export function getLogger(options?: LoggerOptions): winston.Logger {
  if (_logger === null) {
    _logger = createLogger(options);
  }
  return _logger;
}

/**
 * Factory method: Create a child logger with bound context
 */
export function createChildLogger(
  parent: winston.Logger,
  context: Record<string, unknown>
): winston.Logger {
  return parent.child(redactSensitive(context) as Record<string, unknown>);
}

// ────────────────────────────────────────────────────────────────
// Convenience exports — structured event logging
// ────────────────────────────────────────────────────────────────

const logger = getLogger();

export { logger };
export default logger;

/**
 * Log a structured event with full metadata.
 * This is the PRIMARY logging method for the application.
 */
export function logEvent(entry: LogEntry): void {
  const { level, event, message, context, ...meta } = entry;

  const logMeta: Record<string, unknown> = {
    event,
    ...(redactSensitive(meta) as Record<string, unknown>),
  };

  if (context) {
    logMeta.context = redactSensitive(context);
  }

  logger.log(level, message, logMeta);
}

/**
 * Log with automatic redaction of any suspected sensitive data.
 * Use this for debug logs where you don't control the input shape.
 */
export function logSensitive(
  level: LogLevel,
  message: string,
  data: unknown
): void {
  logger.log(level, `[SENSITIVE_DATA_CHECKED] ${message}`, {
    data: redactSensitive(data),
  });
}
