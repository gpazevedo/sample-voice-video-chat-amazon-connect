/**
 * WebRTCManager - Manages WebRTC session lifecycle and media streams
 * 
 * Responsibilities:
 * - Invoke Amazon Connect StartWebRTCContact API
 * - Initialize and manage Chime SDK MeetingSession
 * - Store session identifiers (contactId, contactArn, agentId)
 * - Manage media controls (mute/unmute, enable/disable video)
 * - Handle device management
 * - Monitor connection quality
 * - Provide session state queries
 */

import { ConnectClient, StartWebRTCContactCommand, DescribeContactCommand, StopContactCommand } from '@aws-sdk/client-connect';
import { ConnectParticipantClient, DisconnectParticipantCommand } from '@aws-sdk/client-connectparticipant';
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSession,
  MeetingSessionConfiguration,
} from 'amazon-chime-sdk-js';
import {
  CallConfig,
  CallSession,
  ConnectionQuality,
} from '../models';
import { CredentialManager } from './CredentialManager';

export class WebRTCManager {
  private connectClient: ConnectClient;
  private connectParticipantClient: ConnectParticipantClient;
  private region: string;
  private instanceId: string | null = null;
  private contactId: string | null = null;
  private contactArn: string | null = null;
  private agentId: string | null = null;
  private participantId: string | null = null;
  private participantToken: string | null = null;
  private isAudioMuted: boolean = false;
  private isVideoEnabled: boolean = false;
  private credentialManager: CredentialManager | null = null;
  
  // Chime SDK components
  private meetingSession: MeetingSession | null = null;
  private deviceController: DefaultDeviceController | null = null;
  private logger: ConsoleLogger;

  // Event callbacks
  private connectionEstablishedCallbacks: Array<() => void> = [];
  private connectionFailedCallbacks: Array<(error: Error) => void> = [];
  private connectionQualityCallbacks: Array<(quality: ConnectionQuality) => void> = [];
  private callEndedCallbacks: Array<() => void> = [];

  constructor(
    region: string = 'us-east-1',
    credentialManagerOrCredentials?: CredentialManager | { accessKeyId: string; secretAccessKey: string }
  ) {
    // Store region for later use in Chime SDK initialization
    this.region = region;
    
    // Check if we're using CredentialManager (production mode) or static credentials (development mode)
    if (credentialManagerOrCredentials && 'getCredentials' in credentialManagerOrCredentials) {
      // Production mode: use CredentialManager
      this.credentialManager = credentialManagerOrCredentials;
      
      // Create Connect client with async credential provider
      this.connectClient = new ConnectClient({
        region,
        credentials: async () => {
          const creds = await this.credentialManager!.getCredentials();
          return {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            sessionToken: creds.sessionToken,
          };
        }
      });
      
      // Create ConnectParticipant client with same credential provider
      this.connectParticipantClient = new ConnectParticipantClient({
        region,
        credentials: async () => {
          const creds = await this.credentialManager!.getCredentials();
          return {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            sessionToken: creds.sessionToken,
          };
        }
      });
      
      // Register credential refresh event handlers
      this.credentialManager.onCredentialsRefreshed((credentials) => {
        console.log('[WebRTCManager] Credentials refreshed successfully');
        console.log('[WebRTCManager] New credentials expire at:', credentials.expiration);
      });
      
      this.credentialManager.onRefreshFailed((error) => {
        console.error('[WebRTCManager] Credential refresh failed:', error.message);
        
        // Display user-friendly error message when refresh fails during active call
        if (this.isActive()) {
          this.displayCredentialRefreshError(error);
        }
      });
      
      console.log('[WebRTCManager] Initialized with CredentialManager (production mode)');
    } else if (credentialManagerOrCredentials && 'accessKeyId' in credentialManagerOrCredentials) {
      // Development mode: use static credentials
      this.connectClient = new ConnectClient({
        region,
        credentials: {
          accessKeyId: credentialManagerOrCredentials.accessKeyId,
          secretAccessKey: credentialManagerOrCredentials.secretAccessKey,
        }
      });
      
      this.connectParticipantClient = new ConnectParticipantClient({
        region,
        credentials: {
          accessKeyId: credentialManagerOrCredentials.accessKeyId,
          secretAccessKey: credentialManagerOrCredentials.secretAccessKey,
        }
      });
      
      console.warn('[WebRTCManager] ⚠️  Using development mode with long-term credentials');
      console.warn('[WebRTCManager] This is insecure and should only be used for local development');
    } else {
      // No credentials provided - clients will use default credential chain
      this.connectClient = new ConnectClient({ region });
      this.connectParticipantClient = new ConnectParticipantClient({ region });
      console.log('[WebRTCManager] Initialized with default credential chain');
    }
    
    this.logger = new ConsoleLogger('WebRTCManager', LogLevel.INFO);
  }

  /**
   * Request microphone permission from the browser
   */
  private async requestMicrophonePermission(): Promise<void> {
    try {
      this.logger.info('Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop the stream immediately as we just needed permission
      stream.getTracks().forEach(track => track.stop());
      
      this.logger.info('Microphone permission granted');
    } catch (error) {
      this.logger.error(`Microphone permission denied: ${error}`);
      throw new Error('Microphone access is required for voice calls. Please allow microphone access and try again.');
    }
  }

  /**
   * Start a WebRTC call by invoking StartWebRTCContact API and initializing Chime SDK
   */
  public async startCall(config: CallConfig): Promise<CallSession> {
    try {
      // Request microphone permissions first
      await this.requestMicrophonePermission();
      
      // Store instanceId for later use in endCall
      this.instanceId = config.instanceId;
      
      const command = new StartWebRTCContactCommand({
        InstanceId: config.instanceId,
        ContactFlowId: config.contactFlowId,
        ParticipantDetails: {
          DisplayName: config.participantDetails.displayName,
        },
        Attributes: config.attributes,
        AllowedCapabilities: config.allowedCapabilities ? {
          Customer: {
            Video: config.allowedCapabilities.customer.video === 'SEND' ? 'SEND' : undefined,
          },
          Agent: {
            Video: config.allowedCapabilities.agent.video === 'SEND' ? 'SEND' : undefined,
          },
        } : undefined,
      });

      const response = await this.connectClient.send(command);

      if (!response.ContactId || !response.ParticipantId || !response.ParticipantToken) {
        throw new Error('Invalid response from StartWebRTCContact API');
      }

      // Store session identifiers
      this.contactId = response.ContactId;
      this.participantId = response.ParticipantId;
      this.participantToken = response.ParticipantToken;

      // Extract agent ID from response if available
      // Note: AgentId may be available in different places depending on the API response:
      // 1. In the response attributes
      // 2. In the connection data
      // 3. Set later via CCP integration or custom logic
      this.agentId = this.extractAgentIdFromResponse(response);

      // Extract connection data from response
      // Note: The actual structure depends on the API response
      const connectionData = (response as any).ConnectionData;
      
      if (!connectionData) {
        throw new Error('ConnectionData not found in API response');
      }

      // Validate ConnectionData structure
      if (!connectionData.Meeting) {
        throw new Error('ConnectionData.Meeting not found in API response');
      }
      
      if (!connectionData.Attendee) {
        throw new Error('ConnectionData.Attendee not found in API response');
      }
      
      // Log ConnectionData for debugging (especially important for us-west-2)
      console.log('[WebRTCManager] ConnectionData received:', {
        meetingId: connectionData.Meeting.MeetingId,
        mediaRegion: connectionData.Meeting.MediaRegion,
        signalingUrl: connectionData.Meeting.MediaPlacement?.SignalingUrl,
        audioHostUrl: connectionData.Meeting.MediaPlacement?.AudioHostUrl,
        attendeeId: connectionData.Attendee.AttendeeId,
        configuredRegion: this.region,
      });
      
      // Validate that MediaRegion matches configured region
      if (connectionData.Meeting.MediaRegion !== this.region) {
        console.warn(
          `[WebRTCManager] WARNING: ConnectionData MediaRegion (${connectionData.Meeting.MediaRegion}) ` +
          `does not match configured region (${this.region}). This may cause WebSocket connection failures.`
        );
      }

      // Note: ConnectionData structure depends on actual API response
      // This is a placeholder structure based on the design document
      const callSession: CallSession = {
        contactId: this.contactId,
        contactArn: response.ContactId, // Using ContactId as ARN placeholder
        participantId: this.participantId,
        participantToken: this.participantToken,
        connectionData: connectionData,
      };

      // Store contactArn
      this.contactArn = callSession.contactArn;

      // Initialize Chime SDK with connection data
      await this.initializeChimeSDK(connectionData);

      // Enable audio by default
      await this.unmuteAudio();

      // Enable video if requested
      if (config.allowedCapabilities?.customer.video === 'SEND') {
        await this.enableVideo();
      }

      // Notify connection established
      this.notifyConnectionEstablished();

      return callSession;
    } catch (error: any) {
      // Check for AccessDeniedException from AWS SDK
      if (error.name === 'AccessDeniedException' || error.code === 'AccessDeniedException') {
        // Log detailed error to console for debugging
        console.error('[WebRTCManager] Permission denied:', error);
        
        const permissionError = new Error('Permission denied: Insufficient permissions to start call');
        
        // Notify failure callbacks with permission error
        this.notifyConnectionFailed(permissionError);
        
        throw permissionError;
      }
      
      // Check for network errors
      if (error.name === 'NetworkingError' || 
          error.code === 'NetworkingError' ||
          error.message?.includes('network') ||
          error.message?.includes('timeout') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ETIMEDOUT')) {
        // Log detailed error to console for debugging
        console.error('[WebRTCManager] Network error:', error);
        
        const networkError = new Error('Network error: Unable to connect to Amazon Connect');
        
        // Notify failure callbacks with network error
        this.notifyConnectionFailed(networkError);
        
        throw networkError;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const callError = new Error(`Failed to start call: ${errorMessage}`);
      
      // Log detailed error to console for debugging
      console.error('[WebRTCManager] Failed to start call:', error);
      
      // Notify failure callbacks
      this.notifyConnectionFailed(callError);
      
      throw callError;
    }
  }

  /**
   * Initialize Chime SDK MeetingSession with connection data
   */
  private async initializeChimeSDK(connectionData: any): Promise<void> {
    try {
      // Validate that ConnectionData contains the correct region
      const meetingRegion = connectionData.Meeting?.MediaRegion;
      
      if (!meetingRegion) {
        this.logger.warn('ConnectionData does not contain MediaRegion - this may cause connection issues');
      } else if (meetingRegion !== this.region) {
        this.logger.warn(
          `ConnectionData MediaRegion (${meetingRegion}) does not match configured region (${this.region}). ` +
          `This may indicate a configuration issue.`
        );
      } else {
        this.logger.info(`ConnectionData MediaRegion matches configured region: ${this.region}`);
      }
      
      // Create meeting session configuration
      const configuration = new MeetingSessionConfiguration(
        connectionData.Meeting,
        connectionData.Attendee
      );

      // Create device controller
      this.deviceController = new DefaultDeviceController(this.logger);

      // Create meeting session
      this.meetingSession = new DefaultMeetingSession(
        configuration,
        this.logger,
        this.deviceController
      );

      // Set up audio/video observers
      this.setupObservers();

      // Initialize audio input BEFORE starting the session
      try {
        // Request microphone access first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the test stream
        
        // Now get and select the audio device
        const audioDevices = await this.deviceController.listAudioInputDevices();
        if (audioDevices.length > 0) {
          await this.meetingSession.audioVideo.startAudioInput(audioDevices[0]);
          this.logger.info(`Audio input initialized: ${audioDevices[0].label || audioDevices[0].deviceId}`);
        } else {
          throw new Error('No audio input devices available');
        }
      } catch (error) {
        this.logger.error(`Failed to initialize audio input: ${error}`);
        throw new Error('Microphone access denied or not available. Please check browser permissions.');
      }

      // Bind audio element
      const audioElement = document.getElementById('audio-element') as HTMLAudioElement;
      if (audioElement) {
        this.meetingSession.audioVideo.bindAudioElement(audioElement);
        this.logger.info('Audio element bound successfully');
      } else {
        this.logger.error('Audio element not found in DOM');
        throw new Error('Audio element not found');
      }

      // Start the session
      this.meetingSession.audioVideo.start();

      this.logger.info('Chime SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Chime SDK: ${error}`);
      throw error;
    }
  }

  /**
   * Set up Chime SDK observers for connection quality and events
   */
  private setupObservers(): void {
    if (!this.meetingSession) {
      console.error('[WebRTCManager] setupObservers called but meetingSession is null');
      return;
    }

    console.log('[WebRTCManager] Setting up Chime SDK observers...');

    // Audio video observer for connection events
    const observer = {
      audioVideoDidStart: () => {
        console.log('[WebRTCManager] audioVideoDidStart event fired - audio/video stream started');
        this.logger.info('Audio/Video started');
      },
      audioVideoDidStop: (sessionStatus: any) => {
        console.log('[WebRTCManager] audioVideoDidStop event fired!', sessionStatus);
        this.logger.info('Audio/Video stopped');
        
        // Clean up local state when session stops
        if (this.meetingSession) {
          this.meetingSession = null;
        }
        this.deviceController = null;
        
        // Notify callbacks that call has ended
        this.notifyCallEnded();
        
        // Clear session identifiers
        this.instanceId = null;
        this.contactId = null;
        this.contactArn = null;
        this.agentId = null;
        this.participantId = null;
        this.participantToken = null;
        this.isAudioMuted = false;
        this.isVideoEnabled = false;
      },
      videoTileDidUpdate: (tileState: any) => {
        console.log('[WebRTCManager] videoTileDidUpdate:', tileState);
        
        // Bind video tiles to video elements
        if (!tileState.boundAttendeeId) {
          return;
        }

        const videoElement = tileState.localTile
          ? document.getElementById('local-video') as HTMLVideoElement
          : document.getElementById('remote-video') as HTMLVideoElement;

        if (videoElement && this.meetingSession) {
          this.meetingSession.audioVideo.bindVideoElement(
            tileState.tileId,
            videoElement
          );
          console.log(`[WebRTCManager] Video tile ${tileState.tileId} bound to ${tileState.localTile ? 'local' : 'remote'} video element`);
        }
      },
      videoTileWasRemoved: (tileId: number) => {
        console.log('[WebRTCManager] videoTileWasRemoved:', tileId);
      },
    };

    this.meetingSession.audioVideo.addObserver(observer);
    console.log('[WebRTCManager] Chime SDK observers registered successfully');
  }

  /**
   * End the current call and cleanup resources
   */
  public async endCall(): Promise<void> {
    try {
      // Store contactId and instanceId before clearing state
      const contactIdToStop = this.contactId;
      const instanceIdToUse = this.instanceId;
      
      // Stop the contact in Amazon Connect to prevent routing to agent
      if (contactIdToStop && instanceIdToUse) {
        try {
          console.log('[WebRTCManager] Stopping contact in Amazon Connect...');
          const stopCommand = new StopContactCommand({
            ContactId: contactIdToStop,
            InstanceId: instanceIdToUse,
          });
          await this.connectClient.send(stopCommand);
          console.log('[WebRTCManager] Contact stopped in Amazon Connect');
        } catch (error) {
          console.error('[WebRTCManager] Error stopping contact:', error);
          // Continue with cleanup even if API call fails
        }
      }
      
      // Disconnect from Amazon Connect participant session
      if (this.participantToken) {
        try {
          console.log('[WebRTCManager] Disconnecting participant from Amazon Connect...');
          const command = new DisconnectParticipantCommand({
            ConnectionToken: this.participantToken,
          });
          await this.connectParticipantClient.send(command);
          console.log('[WebRTCManager] Participant disconnected from Amazon Connect');
        } catch (error) {
          console.error('[WebRTCManager] Error disconnecting participant:', error);
          // Continue with local cleanup even if API call fails
        }
      }

      // Stop Chime SDK session
      if (this.meetingSession) {
        this.meetingSession.audioVideo.stop();
        this.meetingSession = null;
      }

      // Clear device controller
      this.deviceController = null;

      // Clear session state
      this.instanceId = null;
      this.contactId = null;
      this.contactArn = null;
      this.agentId = null;
      this.participantId = null;
      this.participantToken = null;
      this.isAudioMuted = false;
      this.isVideoEnabled = false;

      // Notify call ended callbacks BEFORE clearing them
      this.notifyCallEnded();

      // Clear all callbacks to prevent memory leaks and duplicate registrations
      this.connectionEstablishedCallbacks = [];
      this.connectionFailedCallbacks = [];
      this.connectionQualityCallbacks = [];
      this.callEndedCallbacks = [];
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }

  /**
   * Mute audio
   */
  public muteAudio(): void {
    if (this.meetingSession) {
      this.meetingSession.audioVideo.realtimeMuteLocalAudio();
    }
    this.isAudioMuted = true;
  }

  /**
   * Unmute audio
   */
  public async unmuteAudio(): Promise<void> {
    if (this.meetingSession) {
      // Ensure we have an audio input device selected
      try {
        const audioDevices = await this.deviceController?.listAudioInputDevices() || [];
        if (audioDevices.length > 0) {
          // Make sure we have an audio input device selected
          await this.meetingSession.audioVideo.startAudioInput(audioDevices[0]);
        }
      } catch (error) {
        this.logger.warn(`Could not select audio input device: ${error}`);
      }
      
      const unmuted = this.meetingSession.audioVideo.realtimeUnmuteLocalAudio();
      if (unmuted) {
        this.isAudioMuted = false;
        this.logger.info('Audio unmuted successfully');
      } else {
        this.logger.warn('Failed to unmute audio');
      }
    } else {
      this.isAudioMuted = false;
    }
  }

  /**
   * Enable video
   */
  public async enableVideo(): Promise<void> {
    if (this.meetingSession && this.deviceController) {
      try {
        // Get available video devices
        const videoDevices = await this.deviceController.listVideoInputDevices();
        
        if (videoDevices.length === 0) {
          this.logger.warn('No video input devices found');
          return;
        }
        
        // Choose the first available video device (or default camera)
        const defaultDevice = videoDevices[0];
        await this.meetingSession.audioVideo.startVideoInput(defaultDevice);
        this.logger.info(`Selected video device: ${videoDevices[0].label || videoDevices[0].deviceId}`);
        
        // Now start the video tile
        this.meetingSession.audioVideo.startLocalVideoTile();
        this.isVideoEnabled = true;
      } catch (error) {
        this.logger.warn('Could not acquire video input from current device - video will be disabled');
        // Don't throw error, just log warning and continue without video
        this.isVideoEnabled = false;
      }
    } else {
      this.isVideoEnabled = true;
    }
  }

  /**
   * Disable video
   */
  public async disableVideo(): Promise<void> {
    if (this.meetingSession) {
      this.meetingSession.audioVideo.stopLocalVideoTile();
    }
    this.isVideoEnabled = false;
  }

  /**
   * List available audio input devices
   */
  public async listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Error listing audio input devices:', error);
      return [];
    }
  }

  /**
   * List available video input devices
   */
  public async listVideoInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error listing video input devices:', error);
      return [];
    }
  }

  /**
   * Select audio input device
   */
  public async selectAudioInput(deviceId: string): Promise<void> {
    if (this.meetingSession && this.deviceController) {
      try {
        const audioDevices = await this.deviceController.listAudioInputDevices();
        const device = audioDevices.find(d => d.deviceId === deviceId);
        if (device) {
          await this.meetingSession.audioVideo.startAudioInput(device);
          this.logger.info(`Selected audio input device: ${deviceId}`);
        } else {
          throw new Error(`Audio device with ID ${deviceId} not found`);
        }
      } catch (error) {
        this.logger.error('Failed to select audio input device');
        throw error;
      }
    }
  }

  /**
   * Select video input device
   */
  public async selectVideoInput(deviceId: string): Promise<void> {
    if (this.meetingSession && this.deviceController) {
      try {
        const videoDevices = await this.deviceController.listVideoInputDevices();
        const device = videoDevices.find(d => d.deviceId === deviceId);
        if (device) {
          await this.meetingSession.audioVideo.startVideoInput(device);
          this.logger.info(`Selected video input device: ${deviceId}`);
        } else {
          throw new Error(`Video device with ID ${deviceId} not found`);
        }
      } catch (error) {
        this.logger.error('Failed to select video input device');
        throw error;
      }
    }
  }

  /**
   * Get current contact ID
   */
  public getContactId(): string | null {
    return this.contactId;
  }

  /**
   * Get current contact ARN
   */
  public getContactArn(): string | null {
    return this.contactArn;
  }

  /**
   * Get current agent ID
   */
  public getAgentId(): string | null {
    return this.agentId;
  }

  /**
   * Set agent ID (extracted from connection data)
   */
  public setAgentId(agentId: string | null): void {
    this.agentId = agentId;
  }

  /**
   * Fetch agent ID from contact details using DescribeContact API
   * This continuously polls until the agent answers or the call ends
   * Checks every 2 seconds indefinitely until agent connects
   */
  public async fetchAgentIdFromContact(instanceId: string): Promise<string | null> {
    console.log('[WebRTCManager] Starting continuous agent ID polling...');
    console.log('[WebRTCManager] Current contactId:', this.contactId);
    
    if (!this.contactId) {
      console.warn('[WebRTCManager] Cannot fetch agent ID: No active contact');
      return null;
    }

    const retryDelay = 2000; // 2 seconds
    let attempt = 0;

    // Poll continuously until agent ID is found or call ends
    while (this.contactId) { // Continue as long as there's an active contact
      attempt++;
      
      try {
        const command = new DescribeContactCommand({
          InstanceId: instanceId,
          ContactId: this.contactId,
        });

        const response = await this.connectClient.send(command);
        
        // Only log full response every 10 attempts to reduce noise
        if (attempt % 10 === 1 || response.Contact?.AgentInfo?.Id) {
          console.log(`[WebRTCManager] DescribeContact check (attempt ${attempt}):`, 
            response.Contact?.AgentInfo?.Id ? 'Agent connected!' : 'Still waiting for agent...');
        }
        
        // Extract agent ID from the contact's agent info
        if (response.Contact?.AgentInfo?.Id) {
          this.agentId = response.Contact.AgentInfo.Id;
          console.log('[WebRTCManager] ✅ Agent ID fetched from contact:', this.agentId);
          return this.agentId;
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
      } catch (error) {
        console.error(`[WebRTCManager] Error fetching agent ID from contact (attempt ${attempt}):`, error);
        
        // If contact is no longer active, stop polling
        if (!this.contactId) {
          console.log('[WebRTCManager] Contact ended, stopping agent ID polling');
          return null;
        }
        
        // Wait before retrying after error
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    console.log('[WebRTCManager] Agent ID polling stopped (call ended)');
    return null;
  }

  /**
   * Extract agent ID from API response
   * The agent ID may be available in different locations depending on the API response structure
   */
  private extractAgentIdFromResponse(response: any): string | null {
    // Try to extract from various possible locations in the response
    
    // Option 1: From response attributes
    if (response.Attributes && response.Attributes.AgentId) {
      return response.Attributes.AgentId;
    }
    
    // Option 2: From connection data
    if (response.ConnectionData && response.ConnectionData.AgentId) {
      return response.ConnectionData.AgentId;
    }
    
    // Option 3: From attendee info (Chime SDK)
    if (response.ConnectionData && response.ConnectionData.Attendee) {
      const attendeeId = response.ConnectionData.Attendee.AttendeeId;
      // The attendee ID might contain the agent ID
      // This depends on how Amazon Connect structures the attendee ID
      if (attendeeId && attendeeId.includes('agent')) {
        // Extract agent ID from attendee ID if it follows a pattern
        // Example: "agent-12345" -> "12345"
        const match = attendeeId.match(/agent[_-]?(.+)/i);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
    
    // If not found, return null
    // The agent ID can be set later via setAgentId() when it becomes available
    // (e.g., from CCP integration or after the agent answers the call)
    return null;
  }

  /**
   * Check if call is active
   */
  public isActive(): boolean {
    return this.contactId !== null;
  }

  /**
   * Register callback for connection established event
   */
  public onConnectionEstablished(callback: () => void): void {
    this.connectionEstablishedCallbacks.push(callback);
  }

  /**
   * Register callback for connection failed event
   */
  public onConnectionFailed(callback: (error: Error) => void): void {
    this.connectionFailedCallbacks.push(callback);
  }

  /**
   * Register callback for connection quality changed event
   */
  public onConnectionQualityChanged(callback: (quality: ConnectionQuality) => void): void {
    this.connectionQualityCallbacks.push(callback);
  }

  /**
   * Register callback for call ended event
   */
  public onCallEnded(callback: () => void): void {
    this.callEndedCallbacks.push(callback);
  }

  /**
   * Notify connection established callbacks
   */
  private notifyConnectionEstablished(): void {
    this.connectionEstablishedCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in connection established callback:', error);
      }
    });
  }

  /**
   * Notify connection failed callbacks
   */
  private notifyConnectionFailed(error: Error): void {
    this.connectionFailedCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in connection failed callback:', err);
      }
    });
  }

  /**
   * Notify connection quality changed callbacks
   * Note: Currently unused but will be needed for connection quality monitoring
   */
  // private notifyConnectionQualityChanged(quality: ConnectionQuality): void {
  //   this.connectionQualityCallbacks.forEach(callback => {
  //     try {
  //       callback(quality);
  //     } catch (error) {
  //       console.error('Error in connection quality callback:', error);
  //     }
  //   });
  // }

  /**
   * Notify call ended callbacks
   */
  private notifyCallEnded(): void {
    this.callEndedCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in call ended callback:', error);
      }
    });
  }

  /**
   * Get current audio mute state
   */
  public isAudioMutedState(): boolean {
    return this.isAudioMuted;
  }

  /**
   * Get current video enabled state
   */
  public isVideoEnabledState(): boolean {
    return this.isVideoEnabled;
  }

  /**
   * Display user-friendly error message when credential refresh fails during active call
   * @param error The error that occurred during credential refresh
   */
  private displayCredentialRefreshError(error: Error): void {
    const errorMessage = `
      Unable to refresh credentials. Your session may be interrupted.
      Please reload the page to continue.
      
      Error: ${error.message}
    `;
    
    console.error('[WebRTCManager] Credential refresh error during active call:', errorMessage);
    
    // In a real application, this would display a UI notification to the user
    // For now, we'll just log to console and could trigger a callback
    // that the UI layer can listen to for displaying error messages
    
    // Optionally notify via connection failed callback
    this.notifyConnectionFailed(new Error('Credential refresh failed: ' + error.message));
  }
}
