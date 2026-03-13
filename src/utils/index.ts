/**
 * Central export for all utility functions
 */

// Error handling utilities
export {
  retryWithBackoff,
  CircuitBreaker,
  ErrorLogger,
  ErrorMessageMapper,
  globalErrorLogger,
  type RetryOptions,
  type CircuitBreakerConfig,
  type CircuitState,
  type ErrorType,
} from './errorHandling';

// Network error handling utilities
export {
  NetworkErrorHandler,
  restorePreservedSession,
  clearPreservedSession,
  isNetworkOnline,
  addNetworkListeners,
  type NetworkErrorHandlerConfig,
  type ConnectionState,
} from './networkErrorHandler';

// Security utilities
export {
  APIResponseValidator,
  InputSanitizer,
  ContentSecurityPolicy,
  SensitiveDataProtection,
  SecureStorage,
  MemoryCleanup,
  type ValidationResult,
} from './security';

// Credential sanitization utilities
export {
  sanitizeCredentials,
  sanitizeObject,
  wrapConsoleMethods,
  unwrapConsoleMethods,
  isConsoleWrapped,
} from './credentialSanitization';

// Credential storage prevention utilities
export {
  scanStorageForCredentials,
  performStartupStorageCheck,
  startPeriodicStorageCheck,
  stopPeriodicStorageCheck,
  isPeriodicCheckRunning,
} from './credentialStoragePrevention';
