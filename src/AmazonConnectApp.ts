/**
 * AmazonConnectApp - Main application class that orchestrates all managers and UI
 * 
 * Responsibilities:
 * - Initialize all managers (Session, WebRTC, Chat, File)
 * - Wire managers together through SessionManager
 * - Initialize UIController
 * - Set up event listeners and callbacks
 * - Provide high-level API for application control
 */

import { WebRTCManager } from './managers/WebRTCManager';
import { ChatManager } from './managers/ChatManager';
import { SessionManager } from './managers/SessionManager';
import { CredentialManager } from './managers/CredentialManager';
import { UIController } from './ui/UIController';
import { LoginComponent, AuthenticationResult } from './ui/LoginComponent';
import { AuthenticationStateManager } from './managers/AuthenticationStateManager';
import { CallConfig, ChatMessage, AttachmentInfo } from './models';

/**
 * Application configuration interface
 */
export interface AmazonConnectAppConfig {
  // AWS Configuration
  region: string;
  instanceId: string;
  contactFlowId: string;
  chatContactFlowId?: string; // Optional separate flow for chat
  
  // Credential Management
  credentialMode: 'cognito-authenticated';
  cognitoUserPoolId: string;        // Required for authenticated access
  cognitoClientId: string;          // Required for authenticated access
  cognitoIdentityPoolId: string;    // Required for authenticated access
  
  // Participant Details
  participantDisplayName: string;
  
  // UI Configuration
  containerId: string;
  
  // File Upload Configuration
  maxFileSize?: number;
  allowedFileTypes?: string[];
  
  // Feature Flags
  enableVideo?: boolean;
  enableChat?: boolean;
  enableFileSharing?: boolean;
  
  // Custom Attributes
  customAttributes?: Record<string, string>;
}

/**
 * Main application class
 */
export class AmazonConnectApp {
  private config: AmazonConnectAppConfig;
  
  // Managers
  private credentialManager: CredentialManager | null = null;
  private webrtcManager!: WebRTCManager;
  private chatManager!: ChatManager;
  private sessionManager: SessionManager;
  
  // Authentication
  private loginComponent: LoginComponent | null = null;
  private authStateManager: AuthenticationStateManager | null = null;
  
  // UI Controller
  private uiController: UIController;
  
  // State
  private isInitialized: boolean = false;
  private isCallActive: boolean = false;
  private isChatActive: boolean = false;
  
  // Proactive refresh timer
  private refreshTimerId: NodeJS.Timeout | null = null;

  constructor(config: AmazonConnectAppConfig) {
    this.config = this.validateAndNormalizeConfig(config);
    
    // Managers will be created after CredentialManager is initialized
    console.log('[AmazonConnectApp] Running with Cognito User Pool + Identity Pool credentials');
    
    // Initialize session manager (will wire managers in initialize())
    this.sessionManager = new SessionManager();
    
    // Initialize UI controller with callbacks
    this.uiController = new UIController({
      containerId: this.config.containerId,
      onMuteToggle: () => this.handleMuteToggle(),
      onVideoToggle: () => this.handleVideoToggle(),
      onEndCall: () => this.handleEndCall(),
      onSendMessage: (message: string) => this.handleSendMessage(message),
      onFileUpload: (file: File) => this.handleFileUpload(file),
      onFileDownload: (attachmentId: string, attachmentName: string) => 
        this.handleFileDownload(attachmentId, attachmentName),
    });
  }

  /**
   * Validate and normalize configuration
   */
  private validateAndNormalizeConfig(config: AmazonConnectAppConfig): AmazonConnectAppConfig {
    // Validate required fields
    if (!config.region) {
      throw new Error('Configuration error: region is required');
    }
    if (!config.instanceId) {
      throw new Error('Configuration error: instanceId is required');
    }
    if (!config.contactFlowId) {
      throw new Error('Configuration error: contactFlowId is required');
    }
    if (!config.participantDisplayName) {
      throw new Error('Configuration error: participantDisplayName is required');
    }
    if (!config.containerId) {
      throw new Error('Configuration error: containerId is required');
    }
    
    // Set defaults for optional fields
    return {
      ...config,
      chatContactFlowId: config.chatContactFlowId || config.contactFlowId,
      enableVideo: config.enableVideo !== false, // Default true
      enableChat: config.enableChat !== false, // Default true
      enableFileSharing: config.enableFileSharing !== false, // Default true
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB default
      customAttributes: config.customAttributes || {},
    };
  }

  /**
   * Initialize the application
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Application already initialized');
      return;
    }
    
    try {
      // Require authentication first
      console.log('[AmazonConnectApp] Authentication required');
      
      // Check if we need to show login (not already authenticated)
      if (!this.authStateManager || !this.authStateManager.isAuthenticated()) {
        // Wait for authentication before proceeding
        const authResult = await this.showLoginAndWaitForAuthentication();
        
        // Initialize credential manager with ID token
        await this.initializeCredentialManagerWithAuth(authResult.idToken);
      } else {
        // Already authenticated, use cached ID token
        const idToken = this.authStateManager.getIdToken();
        if (!idToken) {
          throw new Error('Authentication state invalid: No ID token available');
        }
        await this.initializeCredentialManagerWithAuth(idToken);
      }
      
      // Create managers with CredentialManager
      this.webrtcManager = new WebRTCManager(this.config.region, this.credentialManager!);
      this.chatManager = new ChatManager(this.config.region, this.credentialManager!);
      
      // Wire WebRTC manager
      this.sessionManager.setWebRTCManager(this.webrtcManager);
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Set up proactive credential refresh timer (every 60 seconds)
      this.setupProactiveRefreshTimer();
      
      console.log('[AmazonConnectApp] All managers initialized with authenticated credentials');
      
      // Initialize UI
      this.uiController.initialize(this.config.containerId);
      
      // Restore any previous session
      const restoredContext = this.sessionManager.restoreSessionContext();
      if (restoredContext) {
        console.log('Restored previous session context');
        // TODO: Attempt to reconnect to previous sessions
      }
      
      this.isInitialized = true;
      console.log('Amazon Connect App initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log detailed error to console for debugging
      console.error('[AmazonConnectApp] Application initialization failed:', error);
      
      // If error wasn't already displayed, show a generic initialization error
      if (!this.uiController) {
        // UIController not available, throw error
        throw new Error(`Failed to initialize application: ${errorMessage}`);
      }
      
      // Re-throw to prevent app from starting
      throw new Error(`Failed to initialize application: ${errorMessage}`);
    }
  }

  /**
   * Show login component and wait for successful authentication
   */
  private async showLoginAndWaitForAuthentication(): Promise<AuthenticationResult> {
    return new Promise((resolve, reject) => {
      // Validate required Cognito configuration
      if (!this.config.cognitoUserPoolId || !this.config.cognitoClientId) {
        const error = new Error('Cognito User Pool ID and Client ID are required for authentication');
        console.error('[AmazonConnectApp] Configuration error:', error.message);
        
        // Display error to user
        this.uiController.displayError({
          code: 'CONFIGURATION_ERROR',
          message: 'Configuration error: Missing Cognito User Pool configuration.',
          details: 'Please check your configuration and ensure COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are set correctly.',
          recoverable: false,
        });
        
        reject(error);
        return;
      }
      
      // Create authentication state manager if not exists
      if (!this.authStateManager) {
        this.authStateManager = new AuthenticationStateManager();
      }
      
      // Create login component
      this.loginComponent = new LoginComponent({
        userPoolId: this.config.cognitoUserPoolId,
        clientId: this.config.cognitoClientId,
        region: this.config.region,
        containerId: this.config.containerId,
        authStateManager: this.authStateManager,
      });
      
      // Register success callback
      this.loginComponent.onLoginSuccess((result: AuthenticationResult) => {
        console.log('[AmazonConnectApp] Authentication successful');
        
        // Update participant display name if name is available from Cognito
        if (result.name) {
          this.config.participantDisplayName = result.name;
          console.log('[AmazonConnectApp] Participant display name updated to:', result.name);
        }
        
        resolve(result);
      });
      
      // Register failure callback
      this.loginComponent.onLoginFailure((error: Error) => {
        console.error('[AmazonConnectApp] Authentication failed:', error);
        // Don't reject here - let user retry
      });
      
      // Show login form
      this.loginComponent.show();
    });
  }

  /**
   * Initialize CredentialManager with authenticated ID token
   */
  private async initializeCredentialManagerWithAuth(idToken: string): Promise<void> {
    if (!this.config.cognitoIdentityPoolId) {
      const error = new Error('Cognito Identity Pool ID is required for credential management');
      console.error('[AmazonConnectApp] Configuration error:', error.message);
      
      // Display error to user
      this.uiController.displayError({
        code: 'CONFIGURATION_ERROR',
        message: 'Configuration error: Cognito Identity Pool ID is missing.',
        details: 'Please check your configuration and ensure COGNITO_IDENTITY_POOL_ID is set correctly.',
        recoverable: false,
      });
      
      throw error;
    }
    
    // Create and initialize CredentialManager
    this.credentialManager = new CredentialManager();
    
    try {
      await this.credentialManager.initialize({
        identityPoolId: this.config.cognitoIdentityPoolId,
        region: this.config.region,
        userPoolId: this.config.cognitoUserPoolId,
      }, idToken);
      
      console.log('[AmazonConnectApp] CredentialManager initialized successfully with authenticated credentials');
    } catch (credError) {
      // Log detailed error to console for debugging
      console.error('[AmazonConnectApp] CredentialManager initialization failed:', credError);
      
      // Display user-friendly error message
      this.uiController.displayError({
        code: 'INITIALIZATION_FAILED',
        message: 'Failed to initialize credential management.',
        details: 'Please check your Cognito configuration and try again. If the problem persists, contact your administrator.',
        recoverable: false,
      });
      
      // Prevent app from starting
      throw credError;
    }
  }

  /**
   * Set up proactive credential refresh timer
   * Checks every 60 seconds if credentials need refresh and triggers refresh if needed
   */
  private setupProactiveRefreshTimer(): void {
    if (!this.credentialManager) {
      console.warn('[AmazonConnectApp] Cannot set up refresh timer: CredentialManager not initialized');
      return;
    }
    
    // Clear any existing timer
    if (this.refreshTimerId) {
      clearInterval(this.refreshTimerId);
    }
    
    // Set up interval timer (every 60 seconds)
    this.refreshTimerId = setInterval(async () => {
      if (!this.credentialManager) {
        return;
      }
      
      try {
        // Check if credentials need refresh
        if (this.credentialManager.needsRefresh()) {
          console.log('[AmazonConnectApp] Proactive refresh: Credentials expiring soon, refreshing...');
          await this.credentialManager.getCredentials();
          console.log('[AmazonConnectApp] Proactive refresh: Credentials refreshed successfully');
        }
      } catch (error) {
        // Log detailed error to console for debugging
        console.error('[AmazonConnectApp] Proactive refresh failed:', error);
        
        // Check if this is an ID token expiration error
        const errorMessage = error instanceof Error ? error.message : '';
        if (errorMessage.includes('token') && errorMessage.includes('expired')) {
          // ID token expired, prompt user to log in again
          this.uiController.displayError({
            code: 'ID_TOKEN_EXPIRED',
            message: 'Your session has expired. Please log in again to continue.',
            details: 'Your authentication token has expired and needs to be refreshed.',
            recoverable: true,
            retryAction: () => this.handleReauthentication(),
            actionLabel: 'Log In Again',
          });
        } else {
          // Display error to user with reload button
          this.uiController.displayError({
            code: 'CREDENTIAL_REFRESH_FAILED',
            message: 'Unable to refresh credentials. Please reload the page to continue.',
            details: 'Your session credentials have expired and could not be refreshed automatically.',
            recoverable: true,
            retryAction: () => window.location.reload(),
            actionLabel: 'Reload',
          });
        }
      }
    }, 60000); // Check every 60 seconds
    
    console.log('[AmazonConnectApp] Proactive credential refresh timer started (60 second interval)');
  }

  /**
   * Handle re-authentication when ID token expires
   */
  private async handleReauthentication(): Promise<void> {
    try {
      // Show login form again
      const authResult = await this.showLoginAndWaitForAuthentication();
      
      // Update ID token in credential manager
      if (this.credentialManager) {
        this.credentialManager.updateIdToken(authResult.idToken);
        console.log('[AmazonConnectApp] ID token updated after re-authentication');
        
        // Clear any displayed errors
        // Note: This would require adding a clearError method to UIController
        console.log('[AmazonConnectApp] Re-authentication successful');
      }
    } catch (error) {
      console.error('[AmazonConnectApp] Re-authentication failed:', error);
      // Error already displayed by showLoginAndWaitForAuthentication
    }
  }

  /**
   * Set up event listeners for all managers
   */
  private setupEventListeners(): void {
    // Register credential refresh failure handler if using CredentialManager
    if (this.credentialManager) {
      this.credentialManager.onRefreshFailed((error) => {
        // Log detailed error to console for debugging
        console.error('[AmazonConnectApp] Credential refresh failed:', error);
        
        // Display error to user with reload button
        this.uiController.displayError({
          code: 'CREDENTIAL_REFRESH_FAILED',
          message: 'Unable to refresh credentials. Please reload the page to continue.',
          details: 'Your session credentials have expired and could not be refreshed after multiple attempts.',
          recoverable: true,
          retryAction: () => window.location.reload(),
          actionLabel: 'Reload',
        });
      });
    }
    
    // WebRTC Manager Events
    this.webrtcManager.onConnectionEstablished(() => {
      console.log('[AmazonConnectApp] onConnectionEstablished callback fired!');
      this.isCallActive = true;
      console.log('[AmazonConnectApp] isCallActive set to true');
      this.uiController.updateCallStatus({
        state: 'CONNECTED',
        duration: 0,
      });
      
      // Show chat option if enabled - but note that agent ID is being fetched
      if (this.config.enableChat) {
        this.uiController.displayNotification(
          'Call connected. Fetching agent information...',
          'INFO'
        );
      }
      console.log('[AmazonConnectApp] onConnectionEstablished callback completed');
    });
    
    this.webrtcManager.onConnectionFailed((error: Error) => {
      this.isCallActive = false;
      
      // Check if this is a permission denied error
      if (error.message.includes('Permission denied') || error.message.includes('Insufficient permissions')) {
        // Log detailed error to console for debugging
        console.error('[AmazonConnectApp] Permission denied error:', error);
        
        this.uiController.displayError({
          code: 'PERMISSION_DENIED',
          message: 'Configuration error: Insufficient permissions to start call.',
          details: 'The application does not have the required permissions. Please contact your administrator to verify the IAM role configuration.',
          recoverable: false,
        });
      } else if (error.message.includes('Network error') || error.message.includes('Unable to connect')) {
        // Log detailed error to console for debugging
        console.error('[AmazonConnectApp] Network error:', error);
        
        this.uiController.displayError({
          code: 'NETWORK_ERROR',
          message: 'Network connectivity issue: Unable to connect to Amazon Connect.',
          details: 'Please check your internet connection and try again.',
          recoverable: true,
          retryAction: () => this.retryCall(),
          actionLabel: 'Retry',
        });
      } else {
        this.uiController.displayError({
          code: 'WEBRTC_CONNECTION_FAILED',
          message: `Failed to connect: ${error.message}`,
          recoverable: true,
          retryAction: () => this.retryCall(),
        });
      }
    });
    
    this.webrtcManager.onCallEnded(() => {
      this.isCallActive = false;
      this.uiController.updateCallStatus({
        state: 'DISCONNECTED',
        duration: 0,
      });
      
      // Notify user if chat is still active
      if (this.isChatActive) {
        this.uiController.displayNotification(
          'Call ended. Chat session is still active.',
          'INFO'
        );
      }
    });
    
    // Chat Manager Events
    this.chatManager.onChatEstablished(() => {
      this.isChatActive = true;
      this.uiController.displayNotification(
        'Chat connected with the same agent.',
        'SUCCESS'
      );
    });
    
    this.chatManager.onChatFailed((error: Error) => {
      this.isChatActive = false;
      
      // Check if this is a permission denied error
      if (error.message.includes('Permission denied') || error.message.includes('Insufficient permissions')) {
        // Log detailed error to console for debugging
        console.error('[AmazonConnectApp] Permission denied error:', error);
        
        this.uiController.displayError({
          code: 'PERMISSION_DENIED',
          message: 'Configuration error: Insufficient permissions to start chat.',
          details: 'The application does not have the required permissions. Please contact your administrator to verify the IAM role configuration.',
          recoverable: false,
        });
      } else if (error.message.includes('Network error') || error.message.includes('Unable to connect')) {
        // Log detailed error to console for debugging
        console.error('[AmazonConnectApp] Network error:', error);
        
        this.uiController.displayError({
          code: 'NETWORK_ERROR',
          message: 'Network connectivity issue: Unable to connect to Amazon Connect.',
          details: 'Please check your internet connection and try again.',
          recoverable: true,
          retryAction: () => this.retryChat(),
          actionLabel: 'Retry',
        });
      } else {
        this.uiController.displayError({
          code: 'CHAT_CONNECTION_FAILED',
          message: `Failed to start chat: ${error.message}`,
          recoverable: true,
          retryAction: () => this.retryChat(),
        });
      }
    });
    
    this.chatManager.onMessageReceived((message: ChatMessage) => {
      this.uiController.displayMessage(message);
      
      // Handle attachments
      if (message.attachments && message.attachments.length > 0) {
        message.attachments.forEach((attachment: AttachmentInfo) => {
          this.uiController.displayAttachment(attachment);
        });
      }
    });
    
    this.chatManager.onTypingIndicator((isTyping: boolean) => {
      this.uiController.displayTypingIndicator(isTyping);
    });
    
    this.chatManager.onChatEnded(() => {
      this.isChatActive = false;
      this.uiController.displayNotification(
        'Chat session ended.',
        'INFO'
      );
    });
    
    // Session Manager Events
    this.sessionManager.onSessionStateChanged((state) => {
      console.log('Session state changed:', state);
      
      // Notify when agent ID becomes available
      if (state.agentConnected && this.isCallActive && this.config.enableChat) {
        const agentId = this.sessionManager.getAgentId();
        if (agentId) {
          this.uiController.displayNotification(
            `Agent connected (ID: ${agentId}). You can now start a chat.`,
            'SUCCESS'
          );
        }
      }
      
      // Update UI based on session state
      if (!state.webrtcActive && !state.chatActive) {
        // All sessions ended
        this.uiController.displayNotification(
          'All sessions ended.',
          'INFO'
        );
      }
    });
  }

  /**
   * Start a voice or video call
   */
  public async startCall(options?: { enableVideo?: boolean }): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Application not initialized. Call initialize() first.');
    }
    
    if (this.isCallActive) {
      throw new Error('Call already active');
    }
    
    try {
      this.uiController.updateCallStatus({
        state: 'CONNECTING',
        duration: 0,
      });
      
      const enableVideo = options?.enableVideo !== false && this.config.enableVideo;
      
      const callConfig: CallConfig = {
        instanceId: this.config.instanceId,
        contactFlowId: this.config.contactFlowId,
        participantDetails: {
          displayName: this.config.participantDisplayName,
        },
        attributes: {
          ...this.config.customAttributes,
          Name: this.config.participantDisplayName, // Add customer name to attributes
        },
        allowedCapabilities: {
          customer: {
            video: enableVideo ? 'SEND' : 'NONE',
            screenShare: 'NONE',
          },
          agent: {
            video: enableVideo ? 'SEND' : 'NONE',
            screenShare: 'NONE',
          },
        },
      };
      
      await this.sessionManager.initializeWebRTCSession(callConfig);
      
      console.log('Call started successfully');
    } catch (error) {
      this.uiController.updateCallStatus({
        state: 'FAILED',
        duration: 0,
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to start call: ${errorMessage}`);
    }
  }

  /**
   * End the current call
   */
  public async endCall(): Promise<void> {
    if (!this.webrtcManager.isActive()) {
      console.warn('No active call to end');
      return;
    }
    
    try {
      await this.webrtcManager.endCall();
      console.log('Call ended successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to end call: ${errorMessage}`);
    }
  }

  /**
   * Start a chat session (requires active call)
   */
  public async startChat(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Application not initialized. Call initialize() first.');
    }
    
    if (!this.config.enableChat) {
      throw new Error('Chat is not enabled in configuration');
    }
    
    if (!this.isCallActive) {
      throw new Error('Cannot start chat: Call must be active first');
    }
    
    if (this.isChatActive) {
      throw new Error('Chat already active');
    }
    
    try {
      await this.sessionManager.initializeChatSession(
        this.config.instanceId,
        this.config.chatContactFlowId!
      );
      
      // Render chat widget
      this.uiController.renderChatWidget();
      
      console.log('Chat started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to start chat: ${errorMessage}`);
    }
  }

  /**
   * End the chat session
   */
  public async endChat(): Promise<void> {
    if (!this.isChatActive) {
      console.warn('No active chat to end');
      return;
    }
    
    try {
      await this.chatManager.endChat();
      console.log('Chat ended successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to end chat: ${errorMessage}`);
    }
  }

  /**
   * Send a chat message
   */
  public async sendMessage(_message: string): Promise<void> {
    // Messages are sent via the Amazon Connect Chat Standard Widget.
    console.log('[AmazonConnectApp] sendMessage: handled by Chat Widget');
  }

  /**
   * Terminate all sessions and clean up
   */
  public async terminateAllSessions(): Promise<void> {
    try {
      await this.sessionManager.terminateAllSessions();
      this.isCallActive = false;
      this.isChatActive = false;
      console.log('All sessions terminated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to terminate sessions: ${errorMessage}`);
    }
  }

  /**
   * Update the agent ID in the session context
   * This should be called when the agent ID becomes available (e.g., from CCP integration)
   * 
   * @param agentId - The agent ID to set
   * 
   * @example
   * // Using Amazon Connect Streams API
   * connect.contact((contact) => {
   *   contact.onConnected(() => {
   *     const agentId = contact.getAgentConnection().getEndpoint().agentId;
   *     app.updateAgentId(agentId);
   *   });
   * });
   */
  public updateAgentId(agentId: string): void {
    this.sessionManager.updateAgentId(agentId);
    console.log('Agent ID updated:', agentId);
  }

  /**
   * Get the current agent ID from the session context
   * 
   * @returns The agent ID or null if not available
   */
  public getAgentId(): string | null {
    return this.sessionManager.getAgentId();
  }

  /**
   * Get the current contact ID from the WebRTC session
   * 
   * @returns The contact ID or null if no active call
   */
  public getContactId(): string | null {
    return this.webrtcManager.getContactId();
  }

  /**
   * Get the WebRTC manager instance for device selection
   * 
   * @returns The WebRTC manager instance
   */
  public getWebRTCManager(): WebRTCManager {
    return this.webrtcManager;
  }

  /**
   * Mute audio during an active call
   */
  public muteAudio(): void {
    if (!this.isCallActive) {
      console.warn('No active call to mute');
      return;
    }
    this.webrtcManager.muteAudio();
  }

  /**
   * Unmute audio during an active call
   */
  public async unmuteAudio(): Promise<void> {
    if (!this.isCallActive) {
      console.warn('No active call to unmute');
      return;
    }
    await this.webrtcManager.unmuteAudio();
  }

  /**
   * Enable video during an active call
   */
  public async enableVideo(): Promise<void> {
    if (!this.isCallActive) {
      console.warn('No active call to enable video');
      return;
    }
    await this.webrtcManager.enableVideo();
  }

  /**
   * Disable video during an active call
   */
  public async disableVideo(): Promise<void> {
    if (!this.isCallActive) {
      console.warn('No active call to disable video');
      return;
    }
    await this.webrtcManager.disableVideo();
  }

  /**
   * Destroy the application and clean up resources
   */
  public destroy(): void {
    // Clear proactive refresh timer
    if (this.refreshTimerId) {
      clearInterval(this.refreshTimerId);
      this.refreshTimerId = null;
      console.log('[AmazonConnectApp] Proactive refresh timer cleared');
    }
    
    // Destroy login component
    if (this.loginComponent) {
      this.loginComponent.destroy();
      this.loginComponent = null;
    }
    
    // Destroy authentication state manager
    if (this.authStateManager) {
      this.authStateManager.destroy();
      this.authStateManager = null;
    }
    
    this.uiController.destroy();
    this.isInitialized = false;
    this.isCallActive = false;
    this.isChatActive = false;
    console.log('Application destroyed');
  }

  // UI Event Handlers

  private handleMuteToggle(): void {
    if (!this.isCallActive) {
      return;
    }
    
    if (this.webrtcManager.isAudioMutedState()) {
      this.webrtcManager.unmuteAudio();
    } else {
      this.webrtcManager.muteAudio();
    }
  }

  private handleVideoToggle(): void {
    if (!this.isCallActive) {
      return;
    }
    
    if (this.webrtcManager.isVideoEnabledState()) {
      this.webrtcManager.disableVideo();
    } else {
      this.webrtcManager.enableVideo();
    }
  }

  private async handleEndCall(): Promise<void> {
    try {
      await this.endCall();
    } catch (error) {
      console.error('Error ending call:', error);
      this.uiController.displayError({
        code: 'END_CALL_FAILED',
        message: 'Failed to end call',
        recoverable: false,
      });
    }
  }

  private async handleSendMessage(message: string): Promise<void> {
    try {
      await this.sendMessage(message);
    } catch (error) {
      console.error('Error sending message:', error);
      this.uiController.displayError({
        code: 'SEND_MESSAGE_FAILED',
        message: 'Failed to send message',
        recoverable: true,
        retryAction: () => this.handleSendMessage(message),
      });
    }
  }

  private async handleFileUpload(_file: File): Promise<void> {
    // File upload is handled by the Amazon Connect Chat Widget
    // The widget has built-in file sharing capabilities
    console.log('[AmazonConnectApp] File upload requested - handled by Amazon Connect Chat Widget');
    this.uiController.displayNotification(
      'File sharing is handled by the Amazon Connect Chat Widget',
      'INFO'
    );
  }

  private async handleFileDownload(_attachmentId: string, _attachmentName: string): Promise<void> {
    // File download is handled by the Amazon Connect Chat Widget
    // The widget has built-in file sharing capabilities
    console.log('[AmazonConnectApp] File download requested - handled by Amazon Connect Chat Widget');
    this.uiController.displayNotification(
      'File downloads are handled by the Amazon Connect Chat Widget',
      'INFO'
    );
  }

  private async retryCall(): Promise<void> {
    try {
      await this.startCall();
    } catch (error) {
      console.error('Retry call failed:', error);
    }
  }

  private async retryChat(): Promise<void> {
    try {
      await this.startChat();
    } catch (error) {
      console.error('Retry chat failed:', error);
    }
  }

  // Public API for state queries

  /**
   * Check if application is initialized
   */
  public isAppInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if call is active
   */
  public isCallActiveState(): boolean {
    return this.isCallActive;
  }

  /**
   * Check if chat is active
   */
  public isChatActiveState(): boolean {
    return this.isChatActive;
  }

  /**
   * Get current session context
   */
  public getSessionContext() {
    return this.sessionManager.getSessionContext();
  }

  /**
   * Get application configuration
   */
  public getConfig(): Readonly<AmazonConnectAppConfig> {
    return { ...this.config };
  }

  /**
   * Get participant display name
   */
  public getParticipantDisplayName(): string {
    return this.config.participantDisplayName;
  }

}

