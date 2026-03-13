/**
 * CredentialManager - Manages temporary AWS credentials lifecycle
 * 
 * This class handles obtaining and refreshing temporary AWS credentials from
 * Amazon Cognito Identity Pool. It implements automatic refresh logic,
 * exponential backoff retry, and event callbacks for credential lifecycle events.
 * 
 * Security: Credentials are cached in memory only, never in localStorage or sessionStorage.
 */

import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

/**
 * AWS temporary credentials with expiration
 */
export interface AWSCredentials {
  accessKeyId: string;        // Temporary access key (e.g., "ASIATEMP...")
  secretAccessKey: string;    // Temporary secret key
  sessionToken: string;       // Session token (required for temporary credentials)
  expiration: Date;           // When credentials expire (typically 1 hour from issuance)
}

/**
 * Cognito Identity Pool configuration
 */
export interface CognitoIdentityPoolConfig {
  identityPoolId: string;     // Cognito Identity Pool ID
  region: string;             // AWS region (e.g., "us-east-1")
  userPoolId?: string;        // Cognito User Pool ID (required for authenticated access)
}

/**
 * Credential-related error codes
 */
export enum CredentialErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  EXPIRED = 'EXPIRED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ID_TOKEN_EXPIRED = 'ID_TOKEN_EXPIRED'
}

/**
 * Credential error with additional context
 */
export class CredentialError extends Error {
  code: CredentialErrorCode;
  retryable: boolean;
  details?: any;

  constructor(code: CredentialErrorCode, message: string, retryable: boolean = false, details?: any) {
    super(message);
    this.name = 'CredentialError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Callback type for credential refresh success
 */
type CredentialRefreshCallback = (credentials: AWSCredentials) => void;

/**
 * Callback type for credential refresh failure
 */
type CredentialRefreshFailedCallback = (error: Error) => void;

/**
 * Callback type for re-authentication required
 */
type ReauthenticationRequiredCallback = () => void;

/**
 * CredentialManager - Manages temporary credential lifecycle
 */
export class CredentialManager {
  private config: CognitoIdentityPoolConfig | null = null;
  private credentials: AWSCredentials | null = null;
  private refreshPromise: Promise<AWSCredentials> | null = null;
  private refreshCallbacks: CredentialRefreshCallback[] = [];
  private refreshFailedCallbacks: CredentialRefreshFailedCallback[] = [];
  private reauthenticationRequiredCallbacks: ReauthenticationRequiredCallback[] = [];
  private credentialProvider: AwsCredentialIdentityProvider | null = null;
  private idToken: string | null = null;  // Cached ID token for authenticated access

  /**
   * Initialize the credential manager with Cognito configuration
   * @param config Cognito Identity Pool configuration
   * @param idToken Optional ID token for authenticated access
   */
  async initialize(config: CognitoIdentityPoolConfig, idToken?: string): Promise<void> {
    if (!config.identityPoolId || !config.region) {
      throw new CredentialError(
        CredentialErrorCode.INVALID_CONFIGURATION,
        'Cognito Identity Pool ID and region are required',
        false,
        { config }
      );
    }

    this.config = config;
    this.idToken = idToken || null;

    // Create Cognito credential provider
    try {
      this.credentialProvider = this.createCredentialProvider();
      
      // Log initialization (no credential values)
      console.log('[CredentialManager] Initialized with Cognito Identity Pool');
      console.log('[CredentialManager] Region:', config.region);
      if (this.idToken) {
        console.log('[CredentialManager] Using authenticated credentials (User Pool + Identity Pool)');
      }
    } catch (error) {
      // Log initialization failure (sanitized error message)
      console.error('[CredentialManager] Initialization failed:', (error as Error).message);
      
      throw new CredentialError(
        CredentialErrorCode.INITIALIZATION_FAILED,
        `Failed to initialize Cognito credential provider: ${(error as Error).message}`,
        false,
        { originalError: error }
      );
    }
  }

  /**
   * Update the ID token for authenticated access
   * This recreates the credential provider with the new token
   * @param idToken New ID token from User Pool authentication
   */
  updateIdToken(idToken: string): void {
    if (!this.config) {
      throw new CredentialError(
        CredentialErrorCode.INITIALIZATION_FAILED,
        'CredentialManager not initialized. Call initialize() first.',
        false
      );
    }

    this.idToken = idToken;
    
    // Recreate credential provider with new ID token
    this.credentialProvider = this.createCredentialProvider();
    
    // Clear cached credentials to force refresh with new token
    this.credentials = null;
    
    console.log('[CredentialManager] ID token updated, credential provider recreated');
  }

  /**
   * Create credential provider based on configuration and ID token
   * @returns AWS credential provider
   */
  private createCredentialProvider(): AwsCredentialIdentityProvider {
    if (!this.config) {
      throw new CredentialError(
        CredentialErrorCode.INITIALIZATION_FAILED,
        'Configuration not set',
        false
      );
    }

    const providerConfig: any = {
      identityPoolId: this.config.identityPoolId,
      clientConfig: { region: this.config.region }
    };

    // If ID token is provided, use authenticated access with logins
    if (this.idToken && this.config.userPoolId) {
      const loginsKey = `cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`;
      providerConfig.logins = {
        [loginsKey]: this.idToken
      };
    }

    return fromCognitoIdentityPool(providerConfig);
  }

  /**
   * Get current credentials, refreshing if needed
   * @returns Promise resolving to AWS credentials
   */
  async getCredentials(): Promise<AWSCredentials> {
    // If credentials exist and not expiring soon, return cached
    if (this.credentials && !this.needsRefresh()) {
      return this.credentials;
    }

    // If refresh already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start new refresh
    this.refreshPromise = this.refreshCredentials();
    try {
      this.credentials = await this.refreshPromise;
      return this.credentials;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Check if credentials need refresh
   * Returns true if credentials are null, expired, or expiring within 5 minutes
   * @returns true if refresh needed, false otherwise
   */
  needsRefresh(): boolean {
    if (!this.credentials) {
      return true;
    }

    const now = new Date();
    const expiresIn = this.credentials.expiration.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    return expiresIn < fiveMinutes;
  }

  /**
   * Force refresh credentials with exponential backoff retry
   * Implements retry logic with 3 attempts and exponential delays (2s, 4s, 8s)
   * @returns Promise resolving to new credentials
   */
  async refreshCredentials(): Promise<AWSCredentials> {
    if (!this.config) {
      throw new CredentialError(
        CredentialErrorCode.INITIALIZATION_FAILED,
        'CredentialManager not initialized. Call initialize() first.',
        false
      );
    }

    let lastError: Error | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // This will be implemented in task 2.6 with actual Cognito integration
        // For now, we'll call a placeholder method that will be replaced
        const credentials = await this.fetchCredentialsFromCognito();
        
        // Log successful refresh (timestamp only, no credential values)
        console.log('[CredentialManager] Credentials refreshed successfully');
        console.log('[CredentialManager] Expiration:', credentials.expiration.toISOString());
        
        this.notifyRefreshSuccess(credentials);
        return credentials;
      } catch (error) {
        lastError = error as Error;
        
        // Log refresh failure (error message only, no credential values)
        console.warn(`[CredentialManager] Refresh attempt ${attempt}/${maxAttempts} failed:`, (error as Error).message);

        // If this is not the last attempt, wait before retrying
        if (attempt < maxAttempts) {
          // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(`[CredentialManager] Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }

    // All retries failed - log final failure (sanitized error message)
    console.error('[CredentialManager] All refresh attempts failed');
    console.error('[CredentialManager] Error:', lastError?.message);
    
    this.notifyRefreshFailed(lastError!);

    throw new CredentialError(
      CredentialErrorCode.REFRESH_FAILED,
      `Failed to refresh credentials after ${maxAttempts} attempts: ${lastError?.message}`,
      false,
      { originalError: lastError }
    );
  }

  /**
   * Fetch credentials from Cognito Identity Pool
   * @returns Promise resolving to AWS credentials
   */
  private async fetchCredentialsFromCognito(): Promise<AWSCredentials> {
    if (!this.credentialProvider) {
      throw new CredentialError(
        CredentialErrorCode.INITIALIZATION_FAILED,
        'Credential provider not initialized. Call initialize() first.',
        false
      );
    }

    try {
      const awsCredentials: AwsCredentialIdentity = await this.credentialProvider();

      // Convert AWS SDK credentials to our format
      const credentials: AWSCredentials = {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken || '',
        expiration: awsCredentials.expiration || new Date(Date.now() + 60 * 60 * 1000) // Default 1 hour
      };

      return credentials;
    } catch (error: any) {
      // Handle Cognito-specific errors
      const errorName = error.name || error.constructor?.name || 'Unknown';
      const errorMessage = error.message || '';
      
      // Log credential operation failure (sanitized error message only)
      console.error('[CredentialManager] Credential operation failed:', errorName);
      console.error('[CredentialManager] Error message:', errorMessage);
      
      // Check for expired ID token errors
      if (errorName === 'NotAuthorizedException' || 
          errorMessage.includes('token') && (errorMessage.includes('expired') || errorMessage.includes('invalid'))) {
        console.warn('[CredentialManager] ID token appears to be expired, re-authentication required');
        this.notifyReauthenticationRequired();
        
        throw new CredentialError(
          CredentialErrorCode.ID_TOKEN_EXPIRED,
          'ID token has expired. Please log in again.',
          false,
          { originalError: error }
        );
      }
      
      if (errorName === 'InvalidIdentityPoolConfigurationException') {
        throw new CredentialError(
          CredentialErrorCode.INVALID_CONFIGURATION,
          `Invalid Cognito Identity Pool configuration: ${errorMessage}`,
          false,
          { originalError: error }
        );
      } else if (errorName === 'ResourceNotFoundException') {
        throw new CredentialError(
          CredentialErrorCode.INVALID_CONFIGURATION,
          `Cognito Identity Pool not found: ${errorMessage}`,
          false,
          { originalError: error }
        );
      } else if (errorName === 'NetworkingError' || errorMessage?.includes('network')) {
        throw new CredentialError(
          CredentialErrorCode.NETWORK_ERROR,
          `Network error while fetching credentials: ${errorMessage}`,
          true,
          { originalError: error }
        );
      } else {
        throw new CredentialError(
          CredentialErrorCode.REFRESH_FAILED,
          `Failed to fetch credentials from Cognito: ${errorMessage}`,
          true,
          { originalError: error }
        );
      }
    }
  }

  /**
   * Delay helper for exponential backoff
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register callback for successful credential refresh
   * @param callback Function to call when credentials are refreshed
   */
  onCredentialsRefreshed(callback: CredentialRefreshCallback): void {
    this.refreshCallbacks.push(callback);
  }

  /**
   * Register callback for credential refresh failure
   * @param callback Function to call when refresh fails
   */
  onRefreshFailed(callback: CredentialRefreshFailedCallback): void {
    this.refreshFailedCallbacks.push(callback);
  }

  /**
   * Register callback for re-authentication required
   * @param callback Function to call when ID token expires and re-authentication is needed
   */
  onReauthenticationRequired(callback: ReauthenticationRequiredCallback): void {
    this.reauthenticationRequiredCallbacks.push(callback);
  }

  /**
   * Notify all registered callbacks of successful refresh
   * @param credentials The new credentials
   */
  protected notifyRefreshSuccess(credentials: AWSCredentials): void {
    this.refreshCallbacks.forEach(callback => {
      try {
        callback(credentials);
      } catch (error) {
        console.error('[CredentialManager] Error in refresh callback:', error);
      }
    });
  }

  /**
   * Notify all registered callbacks of refresh failure
   * @param error The error that occurred
   */
  protected notifyRefreshFailed(error: Error): void {
    this.refreshFailedCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('[CredentialManager] Error in refresh failed callback:', callbackError);
      }
    });
  }

  /**
   * Notify all registered callbacks that re-authentication is required
   */
  protected notifyReauthenticationRequired(): void {
    this.reauthenticationRequiredCallbacks.forEach(callback => {
      try {
        callback();
      } catch (callbackError) {
        console.error('[CredentialManager] Error in re-authentication required callback:', callbackError);
      }
    });
  }
}
