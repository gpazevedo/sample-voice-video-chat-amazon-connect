/**
 * Error handling utilities for Amazon Connect Web Application
 * Provides retry logic, circuit breaker pattern, error logging, and error message mapping
 */

import { ErrorLog } from '../models/error';

/**
 * Error types for categorization
 */
export type ErrorType = 'API' | 'NETWORK' | 'MEDIA' | 'VALIDATION';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  threshold?: number;
  timeout?: number;
  name?: string;
}

/**
 * Retry an operation with exponential backoff
 * @param operation - The async operation to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to the operation result
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt or if shouldRetry returns false
      if (attempt === maxRetries - 1 || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by stopping requests when error threshold is reached
 */
export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: CircuitState = 'CLOSED';
  private readonly threshold: number;
  private readonly timeout: number;
  private readonly name: string;

  constructor(config: CircuitBreakerConfig = {}) {
    this.threshold = config.threshold ?? 5;
    this.timeout = config.timeout ?? 60000; // 60 seconds default
    this.name = config.name ?? 'CircuitBreaker';
  }

  /**
   * Execute an operation through the circuit breaker
   * @param operation - The async operation to execute
   * @returns Promise resolving to the operation result
   * @throws Error if circuit is OPEN
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        console.log(`[${this.name}] Circuit transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
    console.log(`[${this.name}] Circuit reset to CLOSED`);
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      console.log(`[${this.name}] Circuit closed after successful operation`);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.error(
        `[${this.name}] Circuit opened after ${this.failureCount} failures`
      );
    }
  }
}

/**
 * Error logger for structured error logging
 */
export class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs: number = 100;

  /**
   * Log an error with structured information
   * @param error - The error to log
   * @param errorType - Type of error (API, NETWORK, MEDIA, VALIDATION)
   * @param component - Component where error occurred
   * @param operation - Operation that failed
   * @param sessionContext - Current session context
   * @param additionalContext - Additional context information
   */
  logError(
    error: Error | any,
    errorType: ErrorType,
    component: string,
    operation: string,
    sessionContext: {
      webrtcContactId?: string;
      chatContactId?: string;
      agentId?: string;
    } = {},
    additionalContext: Record<string, any> = {}
  ): void {
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      errorCode: this.extractErrorCode(error),
      errorMessage: error.message || String(error),
      errorType,
      component,
      operation,
      sessionContext,
      stackTrace: error.stack,
      context: additionalContext,
      severity: this.determineSeverity(errorType, error),
    };

    this.logs.push(errorLog);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log to console for development
    console.error(
      `[${errorType}] ${component}.${operation}:`,
      errorLog.errorMessage,
      errorLog.context
    );
  }

  /**
   * Get all logged errors
   */
  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by error type
   */
  getLogsByType(errorType: ErrorType): ErrorLog[] {
    return this.logs.filter((log) => log.errorType === errorType);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  private extractErrorCode(error: any): string {
    if (error.code) return error.code;
    if (error.name) return error.name;
    if (error.$metadata?.httpStatusCode) {
      return `HTTP_${error.$metadata.httpStatusCode}`;
    }
    return 'UNKNOWN_ERROR';
  }

  private determineSeverity(
    errorType: ErrorType,
    error: any
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // API errors
    if (errorType === 'API') {
      const statusCode = error.$metadata?.httpStatusCode;
      if (statusCode >= 500) return 'CRITICAL';
      if (statusCode === 429) return 'MEDIUM';
      if (statusCode >= 400) return 'HIGH';
    }

    // Network errors are typically high severity
    if (errorType === 'NETWORK') return 'HIGH';

    // Media errors can prevent core functionality
    if (errorType === 'MEDIA') return 'HIGH';

    // Validation errors are typically low severity
    if (errorType === 'VALIDATION') return 'LOW';

    return 'MEDIUM';
  }
}

/**
 * Error message mapping for user-friendly error display
 */
export class ErrorMessageMapper {
  private static readonly ERROR_MESSAGES: Record<string, string> = {
    // API Errors
    AccessDeniedException: 'You do not have permission to perform this action.',
    InvalidRequestException: 'The request was invalid. Please check your input and try again.',
    ResourceNotFoundException: 'The requested resource was not found.',
    ServiceQuotaExceededException: 'Service quota exceeded. Please try again later.',
    ThrottlingException: 'Too many requests. Please wait a moment and try again.',
    InternalServiceException: 'An internal service error occurred. Please try again.',
    
    // HTTP Status Codes
    HTTP_400: 'Bad request. Please check your input.',
    HTTP_401: 'Authentication failed. Please sign in again.',
    HTTP_403: 'Access denied. You do not have permission for this action.',
    HTTP_404: 'Resource not found.',
    HTTP_429: 'Too many requests. Please wait a moment and try again.',
    HTTP_500: 'Server error. Please try again later.',
    HTTP_503: 'Service temporarily unavailable. Please try again later.',
    HTTP_504: 'Request timeout. Please try again.',
    
    // Network Errors
    NetworkError: 'Network connection lost. Please check your internet connection.',
    TimeoutError: 'Request timed out. Please try again.',
    
    // Media Errors
    NotAllowedError: 'Permission denied to access camera or microphone. Please grant permissions in your browser settings.',
    NotFoundError: 'No camera or microphone found. Please connect a device and try again.',
    NotReadableError: 'Camera or microphone is already in use by another application.',
    OverconstrainedError: 'No device matches the requested constraints.',
    
    // WebSocket Errors
    WebSocketError: 'Connection to chat service failed. Please try again.',
    
    // File Errors
    FileSizeExceeded: 'File size exceeds the maximum allowed limit.',
    InvalidFileType: 'File type is not supported.',
    UploadFailed: 'File upload failed. Please try again.',
    
    // Default
    UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
  };

  /**
   * Get user-friendly error message for an error code
   * @param errorCode - The error code to map
   * @returns User-friendly error message
   */
  static getMessage(errorCode: string): string {
    return this.ERROR_MESSAGES[errorCode] || this.ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  /**
   * Check if an error is retryable
   * @param errorCode - The error code to check
   * @returns True if the error is retryable
   */
  static isRetryable(errorCode: string): boolean {
    const retryableErrors = [
      'ThrottlingException',
      'InternalServiceException',
      'HTTP_429',
      'HTTP_500',
      'HTTP_503',
      'HTTP_504',
      'NetworkError',
      'TimeoutError',
      'WebSocketError',
    ];
    return retryableErrors.includes(errorCode);
  }

  /**
   * Get all error message mappings
   */
  static getAllMappings(): Record<string, string> {
    return { ...this.ERROR_MESSAGES };
  }
}

/**
 * Global error logger instance
 */
export const globalErrorLogger = new ErrorLogger();
