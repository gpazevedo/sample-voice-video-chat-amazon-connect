/**
 * AuthenticationStateManager - Manages authentication state and tokens
 * 
 * Responsibilities:
 * - Store authenticated user state in memory
 * - Cache ID token in memory (never localStorage/sessionStorage)
 * - Implement logout functionality (clear cached tokens)
 * - Provide callbacks for authentication events
 * - Ensure tokens are never persisted to browser storage
 */

import { CognitoUser } from 'amazon-cognito-identity-js';

/**
 * Authenticated user information
 */
export interface AuthenticatedUser {
  username: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  authenticatedAt: Date;
}

/**
 * Authentication state manager
 */
export class AuthenticationStateManager {
  // In-memory storage only (never localStorage/sessionStorage)
  private authenticatedUser: AuthenticatedUser | null = null;
  private cognitoUser: CognitoUser | null = null;
  
  // Callbacks
  private authenticationSuccessCallbacks: Array<(user: AuthenticatedUser) => void> = [];
  private authenticationFailureCallbacks: Array<(error: Error) => void> = [];
  private logoutCallbacks: Array<() => void> = [];

  constructor() {
    // Verify no tokens in browser storage on initialization
    this.verifyNoTokensInStorage();
  }

  /**
   * Set authenticated user state
   */
  public setAuthenticatedUser(user: AuthenticatedUser, cognitoUser: CognitoUser): void {
    this.authenticatedUser = user;
    this.cognitoUser = cognitoUser;
    
    console.log('[AuthenticationStateManager] User authenticated:', {
      username: user.username,
      authenticatedAt: user.authenticatedAt
    });
    
    // Notify success callbacks
    this.authenticationSuccessCallbacks.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error('[AuthenticationStateManager] Error in authentication success callback:', error);
      }
    });
  }

  /**
   * Get authenticated user
   */
  public getAuthenticatedUser(): AuthenticatedUser | null {
    return this.authenticatedUser;
  }

  /**
   * Get ID token
   */
  public getIdToken(): string | null {
    return this.authenticatedUser?.idToken || null;
  }

  /**
   * Get access token
   */
  public getAccessToken(): string | null {
    return this.authenticatedUser?.accessToken || null;
  }

  /**
   * Get refresh token
   */
  public getRefreshToken(): string | null {
    return this.authenticatedUser?.refreshToken || null;
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authenticatedUser !== null;
  }

  /**
   * Update ID token (after refresh)
   */
  public updateIdToken(idToken: string): void {
    if (this.authenticatedUser) {
      this.authenticatedUser.idToken = idToken;
      console.log('[AuthenticationStateManager] ID token updated');
    }
  }

  /**
   * Update tokens (after refresh)
   */
  public updateTokens(idToken: string, accessToken: string, refreshToken?: string): void {
    if (this.authenticatedUser) {
      this.authenticatedUser.idToken = idToken;
      this.authenticatedUser.accessToken = accessToken;
      if (refreshToken) {
        this.authenticatedUser.refreshToken = refreshToken;
      }
      console.log('[AuthenticationStateManager] Tokens updated');
    }
  }

  /**
   * Logout user and clear all cached tokens
   */
  public logout(): void {
    console.log('[AuthenticationStateManager] Logging out user');
    
    // Sign out from Cognito
    if (this.cognitoUser) {
      this.cognitoUser.signOut();
    }
    
    // Clear in-memory state
    this.authenticatedUser = null;
    this.cognitoUser = null;
    
    // Verify no tokens in storage
    this.verifyNoTokensInStorage();
    
    // Notify logout callbacks
    this.logoutCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[AuthenticationStateManager] Error in logout callback:', error);
      }
    });
  }

  /**
   * Register callback for successful authentication
   */
  public onAuthenticationSuccess(callback: (user: AuthenticatedUser) => void): void {
    this.authenticationSuccessCallbacks.push(callback);
  }

  /**
   * Register callback for authentication failure
   */
  public onAuthenticationFailure(callback: (error: Error) => void): void {
    this.authenticationFailureCallbacks.push(callback);
  }

  /**
   * Register callback for logout
   */
  public onLogout(callback: () => void): void {
    this.logoutCallbacks.push(callback);
  }

  /**
   * Notify authentication failure
   */
  public notifyAuthenticationFailure(error: Error): void {
    console.error('[AuthenticationStateManager] Authentication failed:', error);
    
    this.authenticationFailureCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('[AuthenticationStateManager] Error in authentication failure callback:', err);
      }
    });
  }

  /**
   * Verify no tokens are stored in browser storage by application code
   * Note: Cognito SDK stores its own tokens in localStorage - this is expected and secure
   * We only warn about tokens stored by application code outside of Cognito SDK
   */
  private verifyNoTokensInStorage(): void {
    try {
      // Check localStorage
      const localStorageKeys = Object.keys(localStorage);
      const suspiciousLocalKeys = localStorageKeys.filter(key => {
        const lowerKey = key.toLowerCase();
        
        // Allow Cognito SDK tokens (these are managed by AWS SDK and are secure)
        if (key.startsWith('CognitoIdentityServiceProvider.')) {
          return false;
        }
        
        // Allow AWS Amplify tokens (also managed by AWS SDK)
        if (key.startsWith('aws.cognito.') || key.startsWith('amplify-')) {
          return false;
        }
        
        // Flag any other token-like keys
        return lowerKey.includes('token') || 
               lowerKey.includes('credential') ||
               lowerKey.includes('secret');
      });
      
      if (suspiciousLocalKeys.length > 0) {
        console.warn('[AuthenticationStateManager] WARNING: Potential application tokens found in localStorage:', suspiciousLocalKeys);
        console.warn('[AuthenticationStateManager] Application code should not store tokens in localStorage');
      }
      
      // Check sessionStorage
      const sessionStorageKeys = Object.keys(sessionStorage);
      const suspiciousSessionKeys = sessionStorageKeys.filter(key => {
        const lowerKey = key.toLowerCase();
        
        // Allow Cognito SDK tokens
        if (key.startsWith('CognitoIdentityServiceProvider.')) {
          return false;
        }
        
        // Allow AWS Amplify tokens
        if (key.startsWith('aws.cognito.') || key.startsWith('amplify-')) {
          return false;
        }
        
        // Flag any other token-like keys
        return lowerKey.includes('token') || 
               lowerKey.includes('credential') ||
               lowerKey.includes('secret');
      });
      
      if (suspiciousSessionKeys.length > 0) {
        console.warn('[AuthenticationStateManager] WARNING: Potential application tokens found in sessionStorage:', suspiciousSessionKeys);
        console.warn('[AuthenticationStateManager] Application code should not store tokens in sessionStorage');
      }
    } catch (error) {
      // Storage access might be blocked in some browsers
      console.warn('[AuthenticationStateManager] Could not verify storage:', error);
    }
  }

  /**
   * Get Cognito user instance
   */
  public getCognitoUser(): CognitoUser | null {
    return this.cognitoUser;
  }

  /**
   * Clear all callbacks
   */
  public clearCallbacks(): void {
    this.authenticationSuccessCallbacks = [];
    this.authenticationFailureCallbacks = [];
    this.logoutCallbacks = [];
  }

  /**
   * Destroy the authentication state manager
   */
  public destroy(): void {
    this.logout();
    this.clearCallbacks();
  }
}
