/**
 * LoginComponent - Manages user authentication UI with Cognito User Pool
 * 
 * Responsibilities:
 * - Display login form with username and password fields
 * - Validate form inputs (required fields, minimum lengths)
 * - Handle authentication with Cognito User Pool
 * - Display user-friendly error messages for authentication failures
 * - Manage loading state during authentication
 * - Provide callbacks for successful authentication and failures
 */

import { CognitoUser, CognitoUserPool, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';
import { AuthenticationStateManager, AuthenticatedUser } from '../managers/AuthenticationStateManager';

/**
 * Login component configuration
 */
export interface LoginComponentConfig {
  userPoolId: string;
  clientId: string;
  region: string;
  containerId: string;
  authStateManager?: AuthenticationStateManager;
}

/**
 * Authentication result
 */
export interface AuthenticationResult {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  username: string;
  name?: string; // User's display name from Cognito attributes
}

/**
 * Login component for Cognito User Pool authentication
 */
export class LoginComponent {
  private config: LoginComponentConfig;
  private container: HTMLElement | null = null;
  private userPool: CognitoUserPool | null = null;
  private cognitoUser: CognitoUser | null = null;
  private authStateManager: AuthenticationStateManager | null = null;
  
  // Callbacks
  private loginSuccessCallback: ((result: AuthenticationResult) => void) | null = null;
  private loginFailureCallback: ((error: Error) => void) | null = null;

  constructor(config: LoginComponentConfig) {
    this.config = config;
    this.authStateManager = config.authStateManager || null;
    this.initializeUserPool();
  }

  /**
   * Initialize Cognito User Pool
   */
  private initializeUserPool(): void {
    this.userPool = new CognitoUserPool({
      UserPoolId: this.config.userPoolId,
      ClientId: this.config.clientId
    });
  }

  /**
   * Show the login form
   */
  public show(): void {
    const container = document.getElementById(this.config.containerId);
    if (!container) {
      throw new Error(`Container element with id "${this.config.containerId}" not found`);
    }

    this.container = container;
    this.render();
  }

  /**
   * Hide the login form
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Render the login form
   */
  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="login-overlay">
        <div class="login-container">
          <div class="login-form">
            <div class="login-header">
              <h2>Amazon Connect Web App</h2>
              <p>Please log in to continue</p>
            </div>
            
            <form id="login-form" novalidate>
              <div class="form-group">
                <label for="username">Username</label>
                <input 
                  type="text" 
                  id="username" 
                  name="username" 
                  required 
                  autocomplete="username"
                  placeholder="Enter your username"
                  aria-required="true"
                >
                <span class="field-error" id="username-error"></span>
              </div>
              
              <div class="form-group">
                <label for="password">Password</label>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  required 
                  autocomplete="current-password"
                  placeholder="Enter your password"
                  aria-required="true"
                  minlength="8"
                >
                <span class="field-error" id="password-error"></span>
              </div>
              
              <div class="error-message" id="login-error" style="display: none;"></div>
              
              <button type="submit" class="btn-primary" id="login-btn">
                <span class="btn-text">Log In</span>
                <span class="btn-spinner" style="display: none;">
                  <span class="spinner"></span>
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render the new password form for users who must change their password
   */
  private renderNewPasswordForm(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="login-overlay">
        <div class="login-container">
          <div class="login-form">
            <div class="login-header">
              <h2>Change Password Required</h2>
              <p>You must change your password before continuing</p>
            </div>
            
            <form id="new-password-form" novalidate>
              <div class="form-group">
                <label for="new-password">New Password</label>
                <input 
                  type="password" 
                  id="new-password" 
                  name="new-password" 
                  required 
                  autocomplete="new-password"
                  placeholder="Enter your new password"
                  aria-required="true"
                  minlength="8"
                >
                <span class="field-error" id="new-password-error"></span>
                <span class="field-hint">Password must be at least 8 characters</span>
              </div>
              
              <div class="form-group">
                <label for="confirm-password">Confirm New Password</label>
                <input 
                  type="password" 
                  id="confirm-password" 
                  name="confirm-password" 
                  required 
                  autocomplete="new-password"
                  placeholder="Confirm your new password"
                  aria-required="true"
                  minlength="8"
                >
                <span class="field-error" id="confirm-password-error"></span>
              </div>
              
              <div class="error-message" id="new-password-error-message" style="display: none;"></div>
              
              <button type="submit" class="btn-primary" id="change-password-btn">
                <span class="btn-text">Change Password</span>
                <span class="btn-spinner" style="display: none;">
                  <span class="spinner"></span>
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    this.attachNewPasswordEventListeners();
  }

  /**
   * Attach event listeners to new password form elements
   */
  private attachNewPasswordEventListeners(): void {
    const form = document.getElementById('new-password-form') as HTMLFormElement;
    const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
    const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleNewPasswordSubmit();
      });
    }

    // Clear field errors on input
    if (newPasswordInput) {
      newPasswordInput.addEventListener('input', () => {
        this.clearFieldError('new-password');
      });
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener('input', () => {
        this.clearFieldError('confirm-password');
      });
    }
  }

  /**
   * Handle new password form submission
   */
  private async handleNewPasswordSubmit(): Promise<void> {
    // Clear previous errors
    this.clearNewPasswordError();
    this.clearFieldError('new-password');
    this.clearFieldError('confirm-password');

    // Get form values
    const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
    const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;

    const newPassword = newPasswordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    // Validate inputs
    if (!this.validateNewPasswordInputs(newPassword, confirmPassword)) {
      return;
    }

    // Show loading state
    this.setNewPasswordLoadingState(true);

    try {
      // Complete new password challenge
      await this.completeNewPasswordChallenge(newPassword);
      
      // Hide login form
      this.hide();
      
      // Notify success - the onSuccess callback will be triggered by completeNewPasswordChallenge
    } catch (error) {
      // Show error message
      this.handleNewPasswordError(error as Error);
    } finally {
      // Hide loading state
      this.setNewPasswordLoadingState(false);
    }
  }

  /**
   * Validate new password inputs
   */
  private validateNewPasswordInputs(newPassword: string, confirmPassword: string): boolean {
    let isValid = true;

    // Validate new password
    if (!newPassword) {
      this.showFieldError('new-password', 'New password is required');
      isValid = false;
    } else if (newPassword.length < 8) {
      this.showFieldError('new-password', 'Password must be at least 8 characters');
      isValid = false;
    }

    // Validate confirm password
    if (!confirmPassword) {
      this.showFieldError('confirm-password', 'Please confirm your password');
      isValid = false;
    } else if (newPassword !== confirmPassword) {
      this.showFieldError('confirm-password', 'Passwords do not match');
      isValid = false;
    }

    return isValid;
  }

  /**
   * Complete new password challenge
   */
  private completeNewPasswordChallenge(newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.cognitoUser) {
        reject(new Error('No user session available'));
        return;
      }

      this.cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: (session: CognitoUserSession) => {
          console.log('[LoginComponent] Password changed successfully');
          
          const idToken = session.getIdToken().getJwtToken();
          const accessToken = session.getAccessToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();
          const username = this.cognitoUser!.getUsername();

          // Get user attributes to retrieve the name
          this.cognitoUser!.getUserAttributes((err, attributes) => {
            let displayName = username;
            
            if (!err && attributes) {
              const nameAttr = attributes.find(attr => attr.getName() === 'name');
              if (nameAttr) {
                displayName = nameAttr.getValue();
              }
            }

            const result: AuthenticationResult = {
              idToken,
              accessToken,
              refreshToken,
              username,
              name: displayName
            };

            // Update authentication state manager if available
            if (this.authStateManager && this.cognitoUser) {
              const authenticatedUser: AuthenticatedUser = {
                username,
                idToken,
                accessToken,
                refreshToken,
                authenticatedAt: new Date()
              };
              this.authStateManager.setAuthenticatedUser(authenticatedUser, this.cognitoUser);
            }

            // Notify success
            if (this.loginSuccessCallback) {
              this.loginSuccessCallback(result);
            }

            resolve();
          });
        },
        onFailure: (error: Error) => {
          console.error('[LoginComponent] Password change failed:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * Handle new password errors
   */
  private handleNewPasswordError(error: Error): void {
    console.error('[LoginComponent] New password error:', error);

    let errorMessage = 'Failed to change password. Please try again.';

    const errorCode = (error as any).code || (error as any).name;

    switch (errorCode) {
      case 'InvalidPasswordException':
        errorMessage = 'Password does not meet requirements. Please use a stronger password.';
        break;
      case 'InvalidParameterException':
        errorMessage = 'Invalid password format. Please try a different password.';
        break;
      case 'LimitExceededException':
        errorMessage = 'Too many attempts. Please try again later.';
        break;
      default:
        if (error.message) {
          errorMessage = error.message;
        }
        break;
    }

    this.showNewPasswordError(errorMessage);
  }

  /**
   * Show new password error message
   */
  private showNewPasswordError(message: string): void {
    const errorElement = document.getElementById('new-password-error-message');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  /**
   * Clear new password error message
   */
  private clearNewPasswordError(): void {
    const errorElement = document.getElementById('new-password-error-message');
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.style.display = 'none';
    }
  }

  /**
   * Set loading state for new password form
   */
  private setNewPasswordLoadingState(isLoading: boolean): void {
    const changePasswordBtn = document.getElementById('change-password-btn') as HTMLButtonElement;
    const btnText = changePasswordBtn?.querySelector('.btn-text') as HTMLElement;
    const btnSpinner = changePasswordBtn?.querySelector('.btn-spinner') as HTMLElement;
    const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
    const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;

    if (changePasswordBtn) {
      changePasswordBtn.disabled = isLoading;
    }

    if (btnText) {
      btnText.style.display = isLoading ? 'none' : 'inline';
    }

    if (btnSpinner) {
      btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    if (newPasswordInput) {
      newPasswordInput.disabled = isLoading;
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.disabled = isLoading;
    }
  }

  /**
   * Attach event listeners to form elements
   */
  private attachEventListeners(): void {
    const form = document.getElementById('login-form') as HTMLFormElement;
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Clear field errors on input
    if (usernameInput) {
      usernameInput.addEventListener('input', () => {
        this.clearFieldError('username');
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', () => {
        this.clearFieldError('password');
      });
    }
  }

  /**
   * Handle login form submission
   */
  private async handleLogin(): Promise<void> {
    // Clear previous errors
    this.clearError();
    this.clearFieldError('username');
    this.clearFieldError('password');

    // Get form values
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;

    const username = usernameInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    // Validate inputs
    if (!this.validateInputs(username, password)) {
      return;
    }

    // Show loading state
    this.setLoadingState(true);

    try {
      // Authenticate with Cognito User Pool
      const result = await this.authenticateUser(username, password);
      
      // Hide login form
      this.hide();
      
      // Notify success
      if (this.loginSuccessCallback) {
        this.loginSuccessCallback(result);
      }
    } catch (error) {
      // Show error message
      this.handleAuthenticationError(error as Error);
      
      // Notify failure
      if (this.loginFailureCallback) {
        this.loginFailureCallback(error as Error);
      }
    } finally {
      // Hide loading state
      this.setLoadingState(false);
    }
  }

  /**
   * Validate form inputs
   */
  private validateInputs(username: string, password: string): boolean {
    let isValid = true;

    // Validate username
    if (!username) {
      this.showFieldError('username', 'Username is required');
      isValid = false;
    }

    // Validate password
    if (!password) {
      this.showFieldError('password', 'Password is required');
      isValid = false;
    } else if (password.length < 8) {
      this.showFieldError('password', 'Password must be at least 8 characters');
      isValid = false;
    }

    return isValid;
  }

  /**
   * Authenticate user with Cognito User Pool
   */
  private authenticateUser(username: string, password: string): Promise<AuthenticationResult> {
    return new Promise((resolve, reject) => {
      if (!this.userPool) {
        reject(new Error('User Pool not initialized'));
        return;
      }

      // Create authentication details
      const authDetails = new AuthenticationDetails({
        Username: username,
        Password: password
      });

      // Create Cognito user
      const userData = {
        Username: username,
        Pool: this.userPool
      };

      this.cognitoUser = new CognitoUser(userData);

      // Authenticate
      this.cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session: CognitoUserSession) => {
          const idToken = session.getIdToken().getJwtToken();
          const accessToken = session.getAccessToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();

          // Get user attributes to retrieve the name
          this.cognitoUser!.getUserAttributes((err, attributes) => {
            let displayName = username; // Default to username (email)
            
            if (!err && attributes) {
              // Look for 'name' attribute
              const nameAttr = attributes.find(attr => attr.getName() === 'name');
              if (nameAttr) {
                displayName = nameAttr.getValue();
                console.log('[LoginComponent] User display name from Cognito:', displayName);
              }
            } else if (err) {
              console.warn('[LoginComponent] Could not fetch user attributes:', err);
            }

            const result: AuthenticationResult = {
              idToken,
              accessToken,
              refreshToken,
              username,
              name: displayName
            };

            // Update authentication state manager if available
            if (this.authStateManager && this.cognitoUser) {
              const authenticatedUser: AuthenticatedUser = {
                username,
                idToken,
                accessToken,
                refreshToken,
                authenticatedAt: new Date()
              };
              this.authStateManager.setAuthenticatedUser(authenticatedUser, this.cognitoUser);
            }

            resolve(result);
          });
        },
        onFailure: (error: Error) => {
          // Notify authentication state manager of failure
          if (this.authStateManager) {
            this.authStateManager.notifyAuthenticationFailure(error);
          }
          reject(error);
        },
        newPasswordRequired: (_userAttributes, _requiredAttributes) => {
          console.log('[LoginComponent] New password required for user');
          // Show new password form
          this.renderNewPasswordForm();
          // Resolve the promise - the new password flow will handle authentication completion
          resolve({
            idToken: '',
            accessToken: '',
            refreshToken: '',
            username,
            name: username
          });
        }
      });
    });
  }

  /**
   * Handle authentication errors
   */
  private handleAuthenticationError(error: Error): void {
    console.error('[LoginComponent] Authentication failed:', error);

    let errorMessage = 'Login failed. Please try again.';

    // Check error code for specific messages
    const errorCode = (error as any).code || (error as any).name;

    switch (errorCode) {
      case 'NotAuthorizedException':
        errorMessage = 'Invalid username or password. Please try again.';
        break;
      case 'UserNotFoundException':
        errorMessage = 'User not found. Please check your username.';
        break;
      case 'UserNotConfirmedException':
        errorMessage = 'User account is not confirmed. Please contact your administrator.';
        break;
      case 'PasswordResetRequiredException':
        errorMessage = 'Password reset required. Please contact your administrator.';
        break;
      case 'TooManyRequestsException':
        errorMessage = 'Too many login attempts. Please try again later.';
        break;
      case 'NetworkError':
      case 'NetworkingError':
        errorMessage = 'Network error. Please check your internet connection and try again.';
        break;
      default:
        // Use error message if available
        if (error.message) {
          errorMessage = error.message;
        }
        break;
    }

    this.showError(errorMessage);
  }

  /**
   * Show error message
   */
  public showError(message: string): void {
    const errorElement = document.getElementById('login-error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  /**
   * Clear error message
   */
  private clearError(): void {
    const errorElement = document.getElementById('login-error');
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.style.display = 'none';
    }
  }

  /**
   * Show field-specific error
   */
  private showFieldError(fieldName: string, message: string): void {
    const errorElement = document.getElementById(`${fieldName}-error`);
    const inputElement = document.getElementById(fieldName) as HTMLInputElement;

    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }

    if (inputElement) {
      inputElement.classList.add('error');
      inputElement.setAttribute('aria-invalid', 'true');
    }
  }

  /**
   * Clear field-specific error
   */
  private clearFieldError(fieldName: string): void {
    const errorElement = document.getElementById(`${fieldName}-error`);
    const inputElement = document.getElementById(fieldName) as HTMLInputElement;

    if (errorElement) {
      errorElement.textContent = '';
      errorElement.style.display = 'none';
    }

    if (inputElement) {
      inputElement.classList.remove('error');
      inputElement.removeAttribute('aria-invalid');
    }
  }

  /**
   * Set loading state
   */
  private setLoadingState(isLoading: boolean): void {
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const btnText = loginBtn?.querySelector('.btn-text') as HTMLElement;
    const btnSpinner = loginBtn?.querySelector('.btn-spinner') as HTMLElement;
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;

    if (loginBtn) {
      loginBtn.disabled = isLoading;
    }

    if (btnText) {
      btnText.style.display = isLoading ? 'none' : 'inline';
    }

    if (btnSpinner) {
      btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    if (usernameInput) {
      usernameInput.disabled = isLoading;
    }

    if (passwordInput) {
      passwordInput.disabled = isLoading;
    }
  }

  /**
   * Register callback for successful login
   */
  public onLoginSuccess(callback: (result: AuthenticationResult) => void): void {
    this.loginSuccessCallback = callback;
  }

  /**
   * Register callback for login failure
   */
  public onLoginFailure(callback: (error: Error) => void): void {
    this.loginFailureCallback = callback;
  }

  /**
   * Logout current user
   */
  public logout(): void {
    if (this.cognitoUser) {
      this.cognitoUser.signOut();
      this.cognitoUser = null;
    }
    
    // Clear authentication state
    if (this.authStateManager) {
      this.authStateManager.logout();
    }
  }

  /**
   * Destroy the login component
   */
  public destroy(): void {
    this.logout();
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.loginSuccessCallback = null;
    this.loginFailureCallback = null;
  }
}
