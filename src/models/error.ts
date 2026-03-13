/**
 * Error handling data models and interfaces
 */

/**
 * Error types for categorization
 */
export type ErrorType = 'API' | 'NETWORK' | 'MEDIA' | 'VALIDATION';

/**
 * Error log structure for troubleshooting
 */
export interface ErrorLog {
  timestamp: Date;
  errorCode: string;
  errorMessage: string;
  errorType: ErrorType;
  component: string;
  operation: string;
  sessionContext: {
    webrtcContactId?: string;
    chatContactId?: string;
    agentId?: string;
  };
  stackTrace?: string;
  context: Record<string, any>;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Error information for user display
 */
export interface ErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  retryAction?: () => void;
  details?: string; // Additional details for the user
  actionLabel?: string; // Custom label for action button (default: "Retry" or "Reload")
}

/**
 * Credential error types for specialized handling
 */
export type CredentialErrorType = 
  | 'INITIALIZATION_FAILED'
  | 'REFRESH_FAILED'
  | 'PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'EXPIRED'
  | 'INVALID_CONFIGURATION';
