/**
 * Network error handling utilities
 * Handles disconnection detection, reconnection with exponential backoff, and session preservation
 */

import { retryWithBackoff, globalErrorLogger } from './errorHandling';
import { SessionContext } from '../models/session';
import { SecureStorage } from './security';

/**
 * Connection state
 */
export type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

/**
 * Network error handler configuration
 */
export interface NetworkErrorHandlerConfig {
  maxReconnectAttempts?: number;
  baseReconnectDelay?: number;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
  onStateChange?: (state: ConnectionState) => void;
  onReconnectSuccess?: () => void;
  onReconnectFailure?: (error: Error) => void;
}

/**
 * Network error handler for managing connection state and reconnection
 */
export class NetworkErrorHandler {
  private connectionState: ConnectionState = 'CONNECTED';
  private reconnectAttempts: number = 0;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly config: Required<NetworkErrorHandlerConfig>;
  private sessionContext?: SessionContext;

  constructor(config: NetworkErrorHandlerConfig = {}) {
    this.config = {
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      baseReconnectDelay: config.baseReconnectDelay ?? 2000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      onStateChange: config.onStateChange ?? (() => {}),
      onReconnectSuccess: config.onReconnectSuccess ?? (() => {}),
      onReconnectFailure: config.onReconnectFailure ?? (() => {}),
    };
  }

  /**
   * Detect disconnection and initiate reconnection
   * @param error - The error that caused the disconnection
   * @param component - Component where disconnection occurred
   */
  handleDisconnection(error: Error, component: string): void {
    if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'RECONNECTING') {
      // Already handling disconnection
      return;
    }

    this.setConnectionState('DISCONNECTED');

    // Log the disconnection
    globalErrorLogger.logError(
      error,
      'NETWORK',
      component,
      'handleDisconnection',
      this.sessionContext || {},
      { reconnectAttempts: this.reconnectAttempts }
    );

    // Preserve session context
    this.preserveSessionContext();

    // Start reconnection attempts
    this.startReconnection(component);
  }

  /**
   * Attempt to reconnect with exponential backoff
   * @param reconnectOperation - The operation to perform for reconnection
   * @param component - Component attempting reconnection
   */
  async attemptReconnection(
    reconnectOperation: () => Promise<void>,
    component: string
  ): Promise<void> {
    this.setConnectionState('RECONNECTING');

    try {
      await retryWithBackoff(reconnectOperation, {
        maxRetries: this.config.maxReconnectAttempts,
        baseDelay: this.config.baseReconnectDelay,
        maxDelay: this.config.maxReconnectDelay,
        shouldRetry: (error) => {
          // Log each retry attempt
          globalErrorLogger.logError(
            error,
            'NETWORK',
            component,
            'attemptReconnection',
            this.sessionContext || {},
            { reconnectAttempts: this.reconnectAttempts + 1 }
          );
          return true;
        },
      });

      // Reconnection successful
      this.onReconnectionSuccess();
    } catch (error) {
      // All reconnection attempts failed
      this.onReconnectionFailure(error as Error, component);
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Set session context for preservation during disconnection
   * @param context - Session context to preserve
   */
  setSessionContext(context: SessionContext): void {
    this.sessionContext = context;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get number of reconnection attempts
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Start heartbeat monitoring
   * @param heartbeatCheck - Function to check connection health
   */
  startHeartbeat(heartbeatCheck: () => Promise<boolean>): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      try {
        const isHealthy = await heartbeatCheck();
        if (!isHealthy && this.connectionState === 'CONNECTED') {
          this.handleDisconnection(
            new Error('Heartbeat check failed'),
            'NetworkErrorHandler'
          );
        }
      } catch (error) {
        if (this.connectionState === 'CONNECTED') {
          this.handleDisconnection(
            error as Error,
            'NetworkErrorHandler'
          );
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Reset the network error handler
   */
  reset(): void {
    this.stopHeartbeat();
    this.stopReconnection();
    this.reconnectAttempts = 0;
    this.setConnectionState('CONNECTED');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopHeartbeat();
    this.stopReconnection();
    this.sessionContext = undefined;
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.config.onStateChange(state);
    }
  }

  private startReconnection(_component: string): void {
    // Clear any existing reconnection timer
    this.stopReconnection();

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      // The actual reconnection will be triggered by the component
      // This just manages the timing
    }, delay);
  }

  private stopReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private onReconnectionSuccess(): void {
    this.reconnectAttempts = 0;
    this.setConnectionState('CONNECTED');
    this.config.onReconnectSuccess();

    globalErrorLogger.logError(
      new Error('Reconnection successful'),
      'NETWORK',
      'NetworkErrorHandler',
      'onReconnectionSuccess',
      this.sessionContext || {},
      { severity: 'LOW' }
    );
  }

  private onReconnectionFailure(error: Error, _component: string): void {
    this.setConnectionState('DISCONNECTED');
    this.config.onReconnectFailure(error);

    globalErrorLogger.logError(
      error,
      'NETWORK',
      'NetworkErrorHandler',
      'onReconnectionFailure',
      this.sessionContext || {},
      {
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
      }
    );
  }

  private preserveSessionContext(): void {
    if (!this.sessionContext) {
      return;
    }

    try {
      // Preserve session identifiers in local storage with encryption
      const preservedData = {
        webrtcContactId: this.sessionContext.webrtcContactId,
        webrtcContactArn: this.sessionContext.webrtcContactArn,
        chatContactId: this.sessionContext.chatContactId,
        agentId: this.sessionContext.agentId,
        timestamp: new Date().toISOString(),
      };

      SecureStorage.setItem(
        'amazon-connect-session-backup',
        JSON.stringify(preservedData)
      ).then(() => {
        console.log('Session context preserved during disconnection');
      }).catch(error => {
        console.error('Failed to preserve session context:', error);
      });
    } catch (error) {
      console.error('Failed to preserve session context:', error);
    }
  }
}

/**
 * Restore preserved session context from local storage with decryption
 * @returns Preserved session data or null if not found
 */
export async function restorePreservedSession(): Promise<{
  webrtcContactId?: string;
  webrtcContactArn?: string;
  chatContactId?: string;
  agentId?: string;
  timestamp: string;
} | null> {
  try {
    const preserved = await SecureStorage.getItem('amazon-connect-session-backup');
    if (!preserved) {
      return null;
    }

    const data = JSON.parse(preserved);
    
    // Check if the preserved data is not too old (e.g., within last hour)
    const timestamp = new Date(data.timestamp);
    const now = new Date();
    const hourInMs = 60 * 60 * 1000;
    
    if (now.getTime() - timestamp.getTime() > hourInMs) {
      // Data is too old, clear it
      await clearPreservedSession();
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to restore preserved session:', error);
    return null;
  }
}

/**
 * Clear preserved session context from local storage
 */
export async function clearPreservedSession(): Promise<void> {
  try {
    SecureStorage.removeItem('amazon-connect-session-backup');
  } catch (error) {
    console.error('Failed to clear preserved session:', error);
  }
}

/**
 * Check if network is online
 * @returns True if network is online
 */
export function isNetworkOnline(): boolean {
  return navigator.onLine;
}

/**
 * Add network status change listeners
 * @param onOnline - Callback when network comes online
 * @param onOffline - Callback when network goes offline
 * @returns Cleanup function to remove listeners
 */
export function addNetworkListeners(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
