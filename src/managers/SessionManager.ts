/**
 * SessionManager - Manages session context and coordinates between WebRTC and Chat sessions
 * 
 * Responsibilities:
 * - Maintain session context across multiple communication channels
 * - Persist session state to local storage with encryption
 * - Extract and store agent information
 * - Coordinate session lifecycle
 * - Clear sensitive data on session end
 */

import { SessionContext, SessionState, ParticipantDetails, CallConfig } from '../models';
import { SecureStorage, MemoryCleanup } from '../utils/security';
import type { WebRTCManager } from './WebRTCManager';

const SESSION_STORAGE_KEY = 'amazon-connect-session-context';

// Define a minimal interface for WebRTC manager to support both real and proxy versions
interface IWebRTCManager {
  startCall(config: CallConfig): Promise<any>;
  getContactId(): string | null;
  getContactArn(): string | null;
  getAgentId(): string | null;
  onCallEnded(callback: () => void): void;
  onConnectionEstablished(callback: () => void): void;
}


export class SessionManager {
  private sessionContext: SessionContext | null = null;
  private stateChangeCallbacks: Array<(state: SessionState) => void> = [];
  private webrtcManager: IWebRTCManager | null = null;
  private instanceId: string | null = null;

  constructor(webrtcManager?: IWebRTCManager | WebRTCManager) {
    this.webrtcManager = webrtcManager || null;
    this.restoreSessionContext();
  }

  /**
   * Set WebRTC manager for integration
   */
  public setWebRTCManager(webrtcManager: IWebRTCManager | WebRTCManager): void {
    this.webrtcManager = webrtcManager;
  }

  /**
   * Set Chat manager for integration
   */
  public setChatManager(_chatManager: any): void {
    // Chat is handled by the Standard Widget; this method is retained for compatibility.
  }

  /**
   * Initialize WebRTC session by delegating to WebRTCManager and updating context
   * This method orchestrates the WebRTC session initialization and context management
   */
  public async initializeWebRTCSession(config: CallConfig): Promise<void> {
    if (!this.webrtcManager) {
      throw new Error('WebRTCManager not set. Call setWebRTCManager() first.');
    }

    try {
      // Store instance ID for later use
      this.instanceId = config.instanceId;

      // Delegate to WebRTCManager to start the call
      const callSession = await this.webrtcManager.startCall(config);

      // Extract session identifiers
      const contactId = callSession.contactId;
      const contactArn = callSession.contactArn;
      
      // Extract agentId from WebRTC connection
      // Note: AgentId extraction depends on the actual connection data structure
      // For now, we'll check if it's available in the WebRTCManager
      const agentId = this.webrtcManager.getAgentId();

      // Create or update session context
      if (!this.sessionContext) {
        this.sessionContext = {
          participantDetails: config.participantDetails,
          startTime: new Date(),
          lastActivityTime: new Date(),
        };
      }

      // Update with WebRTC session information
      this.sessionContext.webrtcContactId = contactId;
      this.sessionContext.webrtcContactArn = contactArn;
      if (agentId) {
        this.sessionContext.agentId = agentId;
      }
      this.sessionContext.lastActivityTime = new Date();

      // Set up event listeners for WebRTC events
      this.setupWebRTCEventListeners();

      // Start fetching agent ID in the background (don't wait for it)
      this.fetchAgentIdInBackground();

      // Persist to local storage
      this.saveSessionContext();

      // Notify listeners of state change
      this.notifyStateChange();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize WebRTC session: ${errorMessage}`);
    }
  }

  /**
   * Set up event listeners for WebRTC events to update session context
   */
  private setupWebRTCEventListeners(): void {
    if (!this.webrtcManager) {
      return;
    }

    // Listen for call ended event
    this.webrtcManager.onCallEnded(() => {
      this.terminateWebRTCSession();
    });
  }

  /**
   * Fetch agent ID in the background after call starts
   * This runs asynchronously and updates the session context when the agent ID becomes available
   */
  private async fetchAgentIdInBackground(): Promise<void> {
    if (!this.webrtcManager || !this.instanceId) {
      console.warn('[SessionManager] Cannot fetch agent ID - missing webrtcManager or instanceId');
      return;
    }

    console.log('[SessionManager] Starting background agent ID fetch...');
    
    try {
      const agentId = await (this.webrtcManager as any).fetchAgentIdFromContact(this.instanceId);
      
      if (agentId && this.sessionContext) {
        console.log('[SessionManager] Agent ID successfully fetched in background:', agentId);
        this.sessionContext.agentId = agentId;
        this.saveSessionContext();
        this.notifyStateChange();
      } else {
        console.warn('[SessionManager] Background agent ID fetch returned null');
      }
    } catch (error) {
      console.error('[SessionManager] Error in background agent ID fetch:', error);
    }
  }

  /**
   * Update agent ID in session context
   * This can be called when the agent ID becomes available after call connection
   * (e.g., from CCP integration or custom logic)
   */
  public updateAgentId(agentId: string): void {
    if (!this.sessionContext) {
      return;
    }

    this.sessionContext.agentId = agentId;

    this.sessionContext.lastActivityTime = new Date();
    this.saveSessionContext();
    this.notifyStateChange();
  }

  /**
   * Initialize chat session by delegating to ChatManager and updating context
   * This method orchestrates the chat session initialization with agent routing
   */
  public async initializeChatSession(
    _instanceId: string,
    _contactFlowId: string,
    _supportedContentTypes?: string[]
  ): Promise<void> {
    // Chat is handled by the Amazon Connect Chat Standard Widget.
    // This method is retained for interface compatibility only.
    throw new Error('Use the Amazon Connect Chat Standard Widget for chat.');
  }

/**
   * Initialize chat session and update context
   * @deprecated Use the new initializeChatSession(chatConfig) method instead
   * This method is kept for backward compatibility
   */
  public initializeChatSessionLegacy(
    chatContactId: string,
    participantDetails?: ParticipantDetails
  ): void {
    if (!this.sessionContext) {
      // Create new session context if it doesn't exist
      this.sessionContext = {
        participantDetails: participantDetails || { displayName: 'Customer' },
        startTime: new Date(),
        lastActivityTime: new Date(),
      };
    }

    // Update with chat session information
    this.sessionContext.chatContactId = chatContactId;
    this.sessionContext.lastActivityTime = new Date();

    // Persist to local storage
    this.saveSessionContext();

    // Notify listeners of state change
    this.notifyStateChange();
  }

  /**
   * Terminate all active sessions and clear context
   * Clears sensitive data from memory
   */
  public async terminateAllSessions(): Promise<void> {
    // End WebRTC call if active
    if (this.webrtcManager && this.hasActiveWebRTC()) {
      try {
        await (this.webrtcManager as any).endCall();
        console.log('WebRTC call ended');
      } catch (error) {
        console.error('Error ending WebRTC call:', error);
      }
    }

    // End chat if active — no-op since chat is handled by the Standard Widget

    // Clear sensitive data from memory
    if (this.sessionContext) {
      MemoryCleanup.clearSensitiveFields(this.sessionContext, [
        'webrtcContactId',
        'webrtcContactArn',
        'chatContactId',
        'agentId',
      ]);
    }

    // Clear session context
    this.sessionContext = null;

    // Clear from local storage
    this.clearSessionContext();

    // Clear all sensitive data from secure storage
    SecureStorage.clearSensitiveData();

    // Notify listeners of state change
    this.notifyStateChange();
  }

  /**
   * Get current session context
   */
  public getSessionContext(): SessionContext | null {
    return this.sessionContext;
  }

  /**
   * Save session context to local storage with encryption
   */
  public saveSessionContext(): void {
    if (!this.sessionContext) {
      return;
    }

    try {
      const serialized = JSON.stringify({
        ...this.sessionContext,
        startTime: this.sessionContext.startTime.toISOString(),
        lastActivityTime: this.sessionContext.lastActivityTime.toISOString(),
      });

      // Use secure storage for encryption
      SecureStorage.setItem(SESSION_STORAGE_KEY, serialized).catch(error => {
        console.error('Failed to save session context:', error);
      });
    } catch (error) {
      console.error('Failed to save session context:', error);
    }
  }

  /**
   * Restore session context from local storage with decryption
   */
  public restoreSessionContext(): SessionContext | null {
    try {
      // Use secure storage for decryption
      SecureStorage.getItem(SESSION_STORAGE_KEY).then(serialized => {
        if (!serialized) {
          return null;
        }

        const parsed = JSON.parse(serialized);
        
        // Reconstruct Date objects
        this.sessionContext = {
          ...parsed,
          startTime: new Date(parsed.startTime),
          lastActivityTime: new Date(parsed.lastActivityTime),
        };

        return this.sessionContext;
      }).catch(error => {
        console.error('Failed to restore session context:', error);
        return null;
      });

      return null;
    } catch (error) {
      console.error('Failed to restore session context:', error);
      return null;
    }
  }

  /**
   * Clear session context from local storage
   */
  public clearSessionContext(): void {
    try {
      SecureStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear session context:', error);
    }
  }

  /**
   * Get agent ID from session context
   */
  public getAgentId(): string | null {
    return this.sessionContext?.agentId || null;
  }

  /**
   * Set agent ID in session context
   */
  public setAgentId(agentId: string): void {
    if (!this.sessionContext) {
      return;
    }

    this.sessionContext.agentId = agentId;
    this.sessionContext.lastActivityTime = new Date();
    this.saveSessionContext();
  }

  /**
   * Check if WebRTC session is active
   */
  public hasActiveWebRTC(): boolean {
    return !!(this.sessionContext?.webrtcContactId);
  }

  /**
   * Check if chat session is active
   */
  public hasActiveChat(): boolean {
    return !!(this.sessionContext?.chatContactId);
  }

  /**
   * Check if chat can be started (WebRTC session must be active)
   */
  public canStartChat(): boolean {
    return this.hasActiveWebRTC();
  }

  /**
   * Register callback for session state changes
   */
  public onSessionStateChanged(callback: (state: SessionState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Get current session state
   */
  public getSessionState(): SessionState {
    return {
      webrtcActive: this.hasActiveWebRTC(),
      chatActive: this.hasActiveChat(),
      agentConnected: !!(this.sessionContext?.agentId),
    };
  }

  /**
   * Notify all registered callbacks of state change
   */
  private notifyStateChange(): void {
    const state = this.getSessionState();
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });
  }

  /**
   * Terminate WebRTC session only
   */
  public terminateWebRTCSession(): void {
    if (!this.sessionContext) {
      return;
    }

    this.sessionContext.webrtcContactId = undefined;
    this.sessionContext.webrtcContactArn = undefined;
    // Clear agent ID when WebRTC session ends since it's tied to the call
    this.sessionContext.agentId = undefined;
    this.sessionContext.lastActivityTime = new Date();

    this.saveSessionContext();
    this.notifyStateChange();
  }

  /**
   * Terminate chat session only
   */
  public terminateChatSession(): void {
    if (!this.sessionContext) {
      return;
    }

    this.sessionContext.chatContactId = undefined;
    this.sessionContext.lastActivityTime = new Date();

    this.saveSessionContext();
    this.notifyStateChange();
  }
}
