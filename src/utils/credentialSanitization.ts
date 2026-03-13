/**
 * Credential Sanitization Utilities
 * 
 * Provides utilities to detect and redact AWS credentials from logs and error messages.
 * Prevents accidental exposure of sensitive credential information.
 * 
 * Security: All console output is sanitized to remove credential patterns.
 */

/**
 * Credential patterns to detect and redact
 * Order matters - more specific patterns should come first
 */
const CREDENTIAL_PATTERNS = [
  // Session tokens (longer, base64-like strings) - must come before generic 40-char pattern
  /FwoGZXIvYXdzE[A-Za-z0-9/+=]{100,}/g,  // Session tokens often start with this prefix
  
  // AWS Access Key ID patterns
  /AKIA[0-9A-Z]{16}/gi,           // Long-term access keys
  /ASIA[0-9A-Z]{16}/gi,           // Temporary access keys (STS)
  /AIDA[0-9A-Z]{16}/gi,           // IAM user IDs
  /AROA[0-9A-Z]{16}/gi,           // IAM role IDs
  
  // AWS Secret Access Key patterns (40 characters, base64-like)
  /[A-Za-z0-9/+=]{40}/g,          // Secret keys
  
  // Generic patterns for tokens and credentials in JSON
  /"accessKeyId"\s*:\s*"[^"]+"/gi,
  /"secretAccessKey"\s*:\s*"[^"]+"/gi,
  /"sessionToken"\s*:\s*"[^"]+"/gi,
  /'accessKeyId'\s*:\s*'[^']+'/gi,
  /'secretAccessKey'\s*:\s*'[^']+'/gi,
  /'sessionToken'\s*:\s*'[^']+'/gi,
];

/**
 * Redaction placeholder
 */
const REDACTED = '[REDACTED]';

/**
 * Sanitize a string by redacting credential patterns
 * @param input String to sanitize
 * @returns Sanitized string with credentials redacted
 */
export function sanitizeCredentials(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  // Apply all credential patterns
  for (const pattern of CREDENTIAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED);
  }

  return sanitized;
}

/**
 * Sanitize an object by redacting credential patterns in all string values
 * @param obj Object to sanitize
 * @returns Sanitized object with credentials redacted
 */
export function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeCredentials(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact known credential fields completely
      if (key === 'accessKeyId' || key === 'secretAccessKey' || key === 'sessionToken') {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize arguments for console methods
 * @param args Arguments to sanitize
 * @returns Sanitized arguments
 */
function sanitizeArgs(...args: any[]): any[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return sanitizeCredentials(arg);
    } else if (typeof arg === 'object') {
      return sanitizeObject(arg);
    }
    return arg;
  });
}

/**
 * Original console methods (stored before wrapping)
 */
let originalConsole: {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
  debug: typeof console.debug;
} | null = null;

/**
 * Flag to track if console methods are already wrapped
 */
let consoleWrapped = false;

/**
 * Wrap console methods to sanitize output
 * This should be called once during application initialization
 */
export function wrapConsoleMethods(): void {
  if (consoleWrapped) {
    return; // Already wrapped
  }

  // Store original methods before wrapping
  originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  // Wrap console.log
  console.log = function(...args: any[]) {
    originalConsole!.log(...sanitizeArgs(...args));
  };

  // Wrap console.error
  console.error = function(...args: any[]) {
    originalConsole!.error(...sanitizeArgs(...args));
  };

  // Wrap console.warn
  console.warn = function(...args: any[]) {
    originalConsole!.warn(...sanitizeArgs(...args));
  };

  // Wrap console.info
  console.info = function(...args: any[]) {
    originalConsole!.info(...sanitizeArgs(...args));
  };

  // Wrap console.debug
  console.debug = function(...args: any[]) {
    originalConsole!.debug(...sanitizeArgs(...args));
  };

  consoleWrapped = true;
}

/**
 * Restore original console methods (for testing)
 */
export function unwrapConsoleMethods(): void {
  if (!consoleWrapped || !originalConsole) {
    return;
  }

  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;

  originalConsole = null;
  consoleWrapped = false;
}

/**
 * Check if console methods are wrapped
 */
export function isConsoleWrapped(): boolean {
  return consoleWrapped;
}
