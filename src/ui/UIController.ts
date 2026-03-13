/**
 * UIController - Manages user interface state, user interactions, and component rendering
 * 
 * Responsibilities:
 * - Render call controls (mute, video, end call)
 * - Display call status
 * - Manage video tile rendering
 * - Render chat widget
 * - Display messages and typing indicators
 * - Handle file upload/download UI
 * - Display errors and notifications
 * - Manage responsive layout
 */

import { ChatMessage, AttachmentInfo, UploadInfo, ErrorInfo } from '../models';

/**
 * Call status information
 */
export interface CallStatus {
  state: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'FAILED';
  quality?: {
    audioPacketLoss: number;
    videoPacketLoss: number;
    roundTripTime: number;
  };
  duration: number;
}

/**
 * Notification types
 */
export type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

/**
 * Viewport size information
 */
export interface ViewportSize {
  width: number;
  height: number;
  deviceType: 'DESKTOP' | 'TABLET' | 'MOBILE';
}

/**
 * UI Controller configuration
 */
export interface UIControllerConfig {
  containerId: string;
  onMuteToggle?: () => void;
  onVideoToggle?: () => void;
  onEndCall?: () => void;
  onSendMessage?: (message: string) => void;
  onFileUpload?: (file: File) => void;
  onFileDownload?: (attachmentId: string, attachmentName: string) => void;
}

export class UIController {
  private container: HTMLElement | null = null;
  private config: UIControllerConfig;
  
  // UI element references
  private callControlsContainer: HTMLElement | null = null;
  private callStatusContainer: HTMLElement | null = null;
  private videoContainer: HTMLElement | null = null;
  private chatContainer: HTMLElement | null = null;
  private errorContainer: HTMLElement | null = null;
  private notificationContainer: HTMLElement | null = null;
  
  // State
  private videoTiles: Map<number, HTMLVideoElement> = new Map();
  private messages: ChatMessage[] = [];
  private currentViewport: ViewportSize | null = null;

  constructor(config: UIControllerConfig) {
    this.config = config;
  }

  /**
   * Initialize the UI Controller with a container element
   */
  public initialize(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }

    this.container = container;
    this.setupMainLayout();
    this.setupResizeObserver();
    this.detectViewportSize();
  }

  /**
   * Destroy the UI Controller and clean up resources
   */
  public destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    this.videoTiles.clear();
    this.messages = [];
    this.container = null;
    this.callControlsContainer = null;
    this.callStatusContainer = null;
    this.videoContainer = null;
    this.chatContainer = null;
    this.errorContainer = null;
    this.notificationContainer = null;
  }

  /**
   * Set up the main layout structure
   */
  private setupMainLayout(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="connect-app-container">
        <div class="connect-error-container" id="error-container" style="display: none;"></div>
        <div class="connect-notification-container" id="notification-container"></div>
        <div class="connect-main-content">
          <div class="connect-video-section">
            <div class="connect-call-status" id="call-status"></div>
            <div class="connect-video-container" id="video-container"></div>
            <div class="connect-call-controls" id="call-controls"></div>
          </div>
          <div class="connect-chat-section" id="chat-section" style="display: none;">
            <div class="connect-chat-container" id="chat-container"></div>
          </div>
        </div>
      </div>
    `;

    // Store references to key containers
    this.errorContainer = document.getElementById('error-container');
    this.notificationContainer = document.getElementById('notification-container');
    this.callStatusContainer = document.getElementById('call-status');
    this.videoContainer = document.getElementById('video-container');
    this.callControlsContainer = document.getElementById('call-controls');
    this.chatContainer = document.getElementById('chat-container');
  }

  /**
   * Set up resize observer for responsive layout
   */
  private setupResizeObserver(): void {
    if (!this.container) return;

    const resizeObserver = new ResizeObserver(() => {
      this.detectViewportSize();
    });

    resizeObserver.observe(this.container);
  }

  /**
   * Detect viewport size and adjust layout
   */
  private detectViewportSize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    let deviceType: 'DESKTOP' | 'TABLET' | 'MOBILE';
    if (width >= 1024) {
      deviceType = 'DESKTOP';
    } else if (width >= 768) {
      deviceType = 'TABLET';
    } else {
      deviceType = 'MOBILE';
    }

    this.currentViewport = { width, height, deviceType };
    this.adjustLayout(this.currentViewport);
  }

  /**
   * Adjust layout based on viewport size
   */
  public adjustLayout(viewport: ViewportSize): void {
    if (!this.container) return;

    // Remove existing device class
    this.container.classList.remove('device-desktop', 'device-tablet', 'device-mobile');

    // Add appropriate device class
    this.container.classList.add(`device-${viewport.deviceType.toLowerCase()}`);

    // Adjust chat section visibility and positioning
    const chatSection = document.getElementById('chat-section');
    if (chatSection) {
      if (viewport.deviceType === 'MOBILE') {
        chatSection.style.position = 'fixed';
        chatSection.style.bottom = '0';
        chatSection.style.left = '0';
        chatSection.style.right = '0';
        chatSection.style.maxHeight = '50vh';
      } else {
        chatSection.style.position = 'relative';
        chatSection.style.bottom = 'auto';
        chatSection.style.left = 'auto';
        chatSection.style.right = 'auto';
        chatSection.style.maxHeight = 'none';
      }
    }
  }

  /**
   * Render call controls (mute, video, end call buttons)
   */
  public renderCallControls(): void {
    if (!this.callControlsContainer) return;

    this.callControlsContainer.innerHTML = `
      <div class="call-controls-wrapper">
        <button id="mute-btn" class="control-btn" aria-label="Mute/Unmute">
          <span class="icon">🎤</span>
          <span class="label">Mute</span>
        </button>
        <button id="video-btn" class="control-btn" aria-label="Enable/Disable Video">
          <span class="icon">📹</span>
          <span class="label">Video</span>
        </button>
        <button id="end-call-btn" class="control-btn end-call" aria-label="End Call">
          <span class="icon">📞</span>
          <span class="label">End Call</span>
        </button>
      </div>
    `;

    // Attach event listeners
    const muteBtn = document.getElementById('mute-btn');
    const videoBtn = document.getElementById('video-btn');
    const endCallBtn = document.getElementById('end-call-btn');

    if (muteBtn && this.config.onMuteToggle) {
      muteBtn.addEventListener('click', () => {
        this.config.onMuteToggle?.();
        muteBtn.classList.toggle('active');
      });
    }

    if (videoBtn && this.config.onVideoToggle) {
      videoBtn.addEventListener('click', () => {
        this.config.onVideoToggle?.();
        videoBtn.classList.toggle('active');
      });
    }

    if (endCallBtn && this.config.onEndCall) {
      endCallBtn.addEventListener('click', () => {
        this.config.onEndCall?.();
      });
    }
  }

  /**
   * Update call status display
   */
  public updateCallStatus(status: CallStatus): void {
    if (!this.callStatusContainer) return;

    const stateText = this.getStatusText(status.state);
    const durationText = this.formatDuration(status.duration);

    this.callStatusContainer.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'call-status-wrapper';

    const stateSpan = document.createElement('span');
    stateSpan.className = 'status-state';
    stateSpan.textContent = stateText;
    wrapper.appendChild(stateSpan);

    if (status.state === 'CONNECTED') {
      const durationSpan = document.createElement('span');
      durationSpan.className = 'status-duration';
      durationSpan.textContent = durationText;
      wrapper.appendChild(durationSpan);
    }

    if (status.quality) {
      const qualityLevel = this.getQualityLevel(status.quality);
      const qualitySpan = document.createElement('span');
      qualitySpan.className = `quality-indicator quality-${qualityLevel}`;
      qualitySpan.textContent = qualityLevel.toUpperCase();
      wrapper.appendChild(qualitySpan);
    }

    this.callStatusContainer.appendChild(wrapper);
  }

  /**
   * Get status text for display
   */
  private getStatusText(state: CallStatus['state']): string {
    switch (state) {
      case 'CONNECTING':
        return 'Connecting...';
      case 'CONNECTED':
        return 'Connected';
      case 'DISCONNECTED':
        return 'Disconnected';
      case 'FAILED':
        return 'Connection Failed';
      default:
        return 'Unknown';
    }
  }

  /**
   * Format duration in seconds to MM:SS
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get quality level from connection quality metrics
   */
  private getQualityLevel(quality: NonNullable<CallStatus['quality']>): 'good' | 'fair' | 'poor' {
    const avgPacketLoss = (quality.audioPacketLoss + quality.videoPacketLoss) / 2;
    
    if (avgPacketLoss < 2 && quality.roundTripTime < 200) {
      return 'good';
    } else if (avgPacketLoss < 5 && quality.roundTripTime < 400) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  /**
   * Display a video tile
   */
  public displayVideoTile(tileId: number, videoElement: HTMLVideoElement): void {
    if (!this.videoContainer) return;

    // Store reference
    this.videoTiles.set(tileId, videoElement);

    // Create tile wrapper
    const tileWrapper = document.createElement('div');
    tileWrapper.id = `video-tile-${tileId}`;
    tileWrapper.className = 'video-tile';
    tileWrapper.appendChild(videoElement);

    // Add to container
    this.videoContainer.appendChild(tileWrapper);
  }

  /**
   * Remove a video tile
   */
  public removeVideoTile(tileId: number): void {
    if (!this.videoContainer) return;

    const tileWrapper = document.getElementById(`video-tile-${tileId}`);
    if (tileWrapper) {
      tileWrapper.remove();
    }

    this.videoTiles.delete(tileId);
  }

  /**
   * Display error message with enhanced support for credential errors
   * Supports different error types (initialization, refresh, permission, network)
   * with appropriate user-friendly messages and action buttons
   */
  public displayError(error: ErrorInfo): void {
    if (!this.errorContainer) return;

    // Determine error category for styling
    const errorCategory = this.categorizeError(error.code);
    
    // Get user-friendly error message and icon
    const { icon, title } = this.getErrorPresentation(error.code);
    
    this.errorContainer.style.display = 'block';
    this.errorContainer.textContent = '';

    const errorMsg = document.createElement('div');
    errorMsg.className = `error-message ${errorCategory} ${error.recoverable ? 'recoverable' : 'fatal'}`;

    const errorHeader = document.createElement('div');
    errorHeader.className = 'error-header';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'error-icon';
    iconSpan.textContent = icon;

    const titleSection = document.createElement('div');
    titleSection.className = 'error-title-section';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'error-title';
    titleSpan.textContent = title;

    const codeSpan = document.createElement('span');
    codeSpan.className = 'error-code';
    codeSpan.textContent = error.code;

    titleSection.appendChild(titleSpan);
    titleSection.appendChild(codeSpan);

    const errorCloseBtn = document.createElement('button');
    errorCloseBtn.className = 'error-close';
    errorCloseBtn.id = 'error-close-btn';
    errorCloseBtn.setAttribute('aria-label', 'Close error');
    errorCloseBtn.textContent = '×';

    errorHeader.appendChild(iconSpan);
    errorHeader.appendChild(titleSection);
    errorHeader.appendChild(errorCloseBtn);

    const errorBody = document.createElement('div');
    errorBody.className = 'error-body';

    const errorText = document.createElement('p');
    errorText.className = 'error-text';
    errorText.textContent = error.message;
    errorBody.appendChild(errorText);

    if (error.details) {
      const detailsP = document.createElement('p');
      detailsP.className = 'error-details';
      detailsP.textContent = error.details;
      errorBody.appendChild(detailsP);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'error-actions';

    if (error.recoverable && error.retryAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'error-action-btn';
      actionBtn.id = 'error-action-btn';
      actionBtn.textContent = error.actionLabel || 'Retry';
      actionsDiv.appendChild(actionBtn);
    }

    errorBody.appendChild(actionsDiv);
    errorMsg.appendChild(errorHeader);
    errorMsg.appendChild(errorBody);
    this.errorContainer.appendChild(errorMsg);

    // Attach event listeners
    const actionBtn = document.getElementById('error-action-btn');
    if (actionBtn && error.retryAction) {
      actionBtn.addEventListener('click', () => {
        error.retryAction?.();
        this.clearError();
      });
    }

    const closeBtn = document.getElementById('error-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.clearError();
      });
    }
    
    // Auto-dismiss recoverable errors after 10 seconds (unless they have retry actions)
    if (error.recoverable && !error.retryAction) {
      setTimeout(() => {
        this.clearError();
      }, 10000);
    }
  }

  /**
   * Categorize error for styling purposes
   */
  private categorizeError(errorCode: string): string {
    if (errorCode.includes('INITIALIZATION') || errorCode.includes('INVALID_CONFIGURATION')) {
      return 'error-initialization';
    } else if (errorCode.includes('REFRESH') || errorCode.includes('EXPIRED')) {
      return 'error-refresh';
    } else if (errorCode.includes('PERMISSION') || errorCode.includes('ACCESS_DENIED')) {
      return 'error-permission';
    } else if (errorCode.includes('NETWORK') || errorCode.includes('CONNECTIVITY')) {
      return 'error-network';
    } else {
      return 'error-general';
    }
  }

  /**
   * Get error presentation (icon and title) based on error code
   */
  private getErrorPresentation(errorCode: string): { icon: string; title: string } {
    if (errorCode.includes('INITIALIZATION') || errorCode.includes('INVALID_CONFIGURATION')) {
      return {
        icon: '🔧',
        title: 'Configuration Error'
      };
    } else if (errorCode.includes('REFRESH') || errorCode.includes('EXPIRED')) {
      return {
        icon: '🔄',
        title: 'Session Expired'
      };
    } else if (errorCode.includes('PERMISSION') || errorCode.includes('ACCESS_DENIED')) {
      return {
        icon: '🔒',
        title: 'Permission Denied'
      };
    } else if (errorCode.includes('NETWORK') || errorCode.includes('CONNECTIVITY')) {
      return {
        icon: '📡',
        title: 'Connection Issue'
      };
    } else {
      return {
        icon: '⚠️',
        title: 'Error'
      };
    }
  }

  /**
   * Clear error display
   */
  private clearError(): void {
    if (this.errorContainer) {
      this.errorContainer.style.display = 'none';
      this.errorContainer.innerHTML = '';
    }
  }

  /**
   * Display a notification toast
   */
  public displayNotification(message: string, type: NotificationType): void {
    if (!this.notificationContainer) return;

    const notificationId = `notification-${Date.now()}`;
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.className = `notification notification-${type.toLowerCase()}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'notification-icon';
    iconSpan.textContent = this.getNotificationIcon(type);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = message;

    const notifCloseBtn = document.createElement('button');
    notifCloseBtn.className = 'notification-close';
    notifCloseBtn.textContent = '×';

    notification.appendChild(iconSpan);
    notification.appendChild(messageSpan);
    notification.appendChild(notifCloseBtn);

    this.notificationContainer.appendChild(notification);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      this.dismissNotification(notificationId);
    }, 5000);

    // Add close button handler
    notifCloseBtn.addEventListener('click', () => {
      this.dismissNotification(notificationId);
    });
  }

  /**
   * Get notification icon based on type
   */
  private getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'INFO':
        return 'ℹ️';
      case 'WARNING':
        return '⚠️';
      case 'ERROR':
        return '❌';
      case 'SUCCESS':
        return '✅';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Dismiss a notification
   */
  private dismissNotification(notificationId: string): void {
    const notification = document.getElementById(notificationId);
    if (notification) {
      notification.classList.add('fade-out');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }
  }

  /**
   * Render chat widget
   */
  public renderChatWidget(): void {
    if (!this.chatContainer) return;

    const chatSection = document.getElementById('chat-section');
    if (chatSection) {
      chatSection.style.display = 'block';
    }

    this.chatContainer.innerHTML = `
      <div class="chat-widget">
        <div class="chat-header">
          <h3>Chat</h3>
          <button class="chat-close" id="chat-close-btn">×</button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-typing-indicator" id="chat-typing" style="display: none;">
          <span class="typing-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
          <span class="typing-text">Agent is typing</span>
        </div>
        <div class="chat-input-container">
          <textarea 
            id="chat-input" 
            class="chat-input" 
            placeholder="Type a message..."
            rows="2"
          ></textarea>
          <button id="chat-send-btn" class="chat-send-btn" aria-label="Send message">
            <span class="icon">📤</span>
          </button>
        </div>
      </div>
    `;

    // Attach event listeners
    const sendBtn = document.getElementById('chat-send-btn');
    const inputField = document.getElementById('chat-input') as HTMLTextAreaElement;
    const closeBtn = document.getElementById('chat-close-btn');

    if (sendBtn && inputField && this.config.onSendMessage) {
      const sendMessage = () => {
        const message = inputField.value.trim();
        if (message) {
          this.config.onSendMessage?.(message);
          inputField.value = '';
          inputField.style.height = 'auto'; // Reset height
        }
      };

      sendBtn.addEventListener('click', sendMessage);

      // Send on Enter (but allow Shift+Enter for new line)
      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Auto-resize textarea
      inputField.addEventListener('input', () => {
        inputField.style.height = 'auto';
        inputField.style.height = inputField.scrollHeight + 'px';
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (chatSection) {
          chatSection.style.display = 'none';
        }
      });
    }
  }

  /**
   * Display a message in the chat widget
   */
  public displayMessage(message: ChatMessage): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    // Store message
    this.messages.push(message);

    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${message.participantRole.toLowerCase()}`;
    messageElement.id = `message-${message.id}`;

    const timestamp = this.formatMessageTimestamp(message.timestamp);
    const senderName = message.participantRole === 'AGENT' ? message.displayName : 'You';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = senderName;

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'message-timestamp';
    timestampSpan.textContent = timestamp;

    headerDiv.appendChild(senderSpan);
    headerDiv.appendChild(timestampSpan);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    this.populateMessageContent(contentDiv, message);

    messageElement.appendChild(headerDiv);
    messageElement.appendChild(contentDiv);

    messagesContainer.appendChild(messageElement);
    this.scrollToLatestMessage();
  }

  /**
   * Populate message content element using safe DOM APIs
   */
  private populateMessageContent(container: HTMLElement, message: ChatMessage): void {
    if (message.type === 'ATTACHMENT' && message.attachments) {
      this.buildAttachmentElements(container, message.attachments);
      return;
    }

    if (message.contentType === 'text/markdown') {
      this.buildMarkdownContent(container, message.content);
      return;
    }

    // Default: plain text — safe via textContent
    container.textContent = message.content;
  }

  /**
   * Build attachment elements using safe DOM APIs
   */
  private buildAttachmentElements(container: HTMLElement, attachments: AttachmentInfo[]): void {
    for (const attachment of attachments) {
      const attachDiv = document.createElement('div');
      attachDiv.className = 'message-attachment';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'attachment-icon';
      iconSpan.textContent = '📎';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'attachment-name';
      nameSpan.textContent = attachment.attachmentName;

      const btn = document.createElement('button');
      btn.className = 'attachment-download';
      btn.dataset.attachmentId = attachment.attachmentId;
      btn.dataset.attachmentName = attachment.attachmentName;
      btn.textContent = 'Download';

      attachDiv.appendChild(iconSpan);
      attachDiv.appendChild(nameSpan);
      attachDiv.appendChild(btn);
      container.appendChild(attachDiv);
    }
  }

  /**
   * Build markdown content using safe DOM APIs
   * Parses markdown and creates DOM elements directly without innerHTML
   */
  private buildMarkdownContent(container: HTMLElement, content: string): void {
    const lines = content.split('\n');
    
    for (const line of lines) {
      const lineElement = this.parseMarkdownLine(line);
      container.appendChild(lineElement);
    }
  }

  /**
   * Parse a single markdown line and return DOM element
   */
  private parseMarkdownLine(line: string): HTMLElement {
    const span = document.createElement('span');
    
    // Parse markdown patterns and build DOM nodes
    const patterns = [
      { regex: /\*\*(.+?)\*\*/g, tag: 'strong' },
      { regex: /__(.+?)__/g, tag: 'strong' },
      { regex: /\*(.+?)\*/g, tag: 'em' },
      { regex: /_(.+?)_/g, tag: 'em' }
    ];
    
    // Find all matches
    const matches: Array<{ start: number; end: number; text: string; tag: string }> = [];
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex.source, 'g');
      let match;
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[1],
          tag: pattern.tag
        });
      }
    }
    
    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);
    
    // Build DOM with matches
    let currentPos = 0;
    for (const match of matches) {
      // Add text before match
      if (match.start > currentPos) {
        const textNode = document.createTextNode(line.substring(currentPos, match.start));
        span.appendChild(textNode);
      }
      
      // Add formatted element
      const element = document.createElement(match.tag);
      element.textContent = match.text;
      span.appendChild(element);
      
      currentPos = match.end;
    }
    
    // Add remaining text
    if (currentPos < line.length) {
      const textNode = document.createTextNode(line.substring(currentPos));
      span.appendChild(textNode);
    }
    
    // Add line break
    span.appendChild(document.createElement('br'));
    
    return span;
  }

  /**
   * Format message timestamp
   */
  private formatMessageTimestamp(timestamp: Date): string {
    const now = new Date();
    const messageDate = new Date(timestamp);
    
    const isToday = now.toDateString() === messageDate.toDateString();
    
    if (isToday) {
      return messageDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return messageDate.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  }

  /**
   * Display typing indicator
   */
  public displayTypingIndicator(isTyping: boolean): void {
    const typingIndicator = document.getElementById('chat-typing');
    if (typingIndicator) {
      typingIndicator.style.display = isTyping ? 'flex' : 'none';
    }
  }

  /**
   * Scroll to the latest message
   */
  public scrollToLatestMessage(): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Get message element by ID
   */
  public getMessageElement(messageId: string): HTMLElement | null {
    return document.getElementById(`message-${messageId}`);
  }

  /**
   * Get message input field
   */
  public getMessageInputField(): HTMLTextAreaElement | null {
    return document.getElementById('chat-input') as HTMLTextAreaElement;
  }

  /**
   * Display file upload progress
   */
  public displayFileUploadProgress(uploadInfo: UploadInfo): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    // Check if progress element already exists
    let progressElement = document.getElementById(`upload-${uploadInfo.uploadId}`);
    
    if (!progressElement) {
      // Create new progress element
      progressElement = document.createElement('div');
      progressElement.id = `upload-${uploadInfo.uploadId}`;
      progressElement.className = 'file-upload-progress';
      messagesContainer.appendChild(progressElement);
    }

    // Update progress display
    const statusText = this.getUploadStatusText(uploadInfo.status);
    const progressPercent = uploadInfo.progress;

    progressElement.textContent = '';

    const uploadInfoDiv = document.createElement('div');
    uploadInfoDiv.className = 'upload-info';

    const uploadIcon = document.createElement('span');
    uploadIcon.className = 'upload-icon';
    uploadIcon.textContent = '📤';

    const uploadDetails = document.createElement('div');
    uploadDetails.className = 'upload-details';

    const filenameDiv = document.createElement('div');
    filenameDiv.className = 'upload-filename';
    filenameDiv.textContent = uploadInfo.fileName;

    const statusDiv = document.createElement('div');
    statusDiv.className = 'upload-status';
    statusDiv.textContent = statusText;

    uploadDetails.appendChild(filenameDiv);
    uploadDetails.appendChild(statusDiv);
    uploadInfoDiv.appendChild(uploadIcon);
    uploadInfoDiv.appendChild(uploadDetails);

    const progressBar = document.createElement('div');
    progressBar.className = 'upload-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'upload-progress-fill';
    progressFill.style.width = `${progressPercent}%`;
    progressBar.appendChild(progressFill);

    const progressText = document.createElement('div');
    progressText.className = 'upload-progress-text';
    progressText.textContent = `${progressPercent}%`;

    progressElement.appendChild(uploadInfoDiv);
    progressElement.appendChild(progressBar);
    progressElement.appendChild(progressText);

    // Add status class
    progressElement.className = `file-upload-progress status-${uploadInfo.status.toLowerCase()}`;

    // Scroll to show progress
    this.scrollToLatestMessage();

    // Remove progress element after completion or failure
    if (uploadInfo.status === 'COMPLETED' || uploadInfo.status === 'FAILED') {
      setTimeout(() => {
        progressElement?.remove();
      }, 3000);
    }
  }

  /**
   * Get upload status text
   */
  private getUploadStatusText(status: UploadInfo['status']): string {
    switch (status) {
      case 'PENDING':
        return 'Preparing upload...';
      case 'UPLOADING':
        return 'Uploading...';
      case 'COMPLETED':
        return 'Upload complete';
      case 'FAILED':
        return 'Upload failed';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Display attachment with download link
   */
  public displayAttachment(attachment: AttachmentInfo): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    const attachmentElement = document.createElement('div');
    attachmentElement.className = 'attachment-message';

    const attachmentDiv = document.createElement('div');
    attachmentDiv.className = 'message-attachment';

    const attachIcon = document.createElement('span');
    attachIcon.className = 'attachment-icon';
    attachIcon.textContent = '📎';

    const attachName = document.createElement('span');
    attachName.className = 'attachment-name';
    attachName.textContent = attachment.attachmentName;

    const downloadButton = document.createElement('button');
    downloadButton.className = 'attachment-download';
    downloadButton.dataset.attachmentId = attachment.attachmentId;
    downloadButton.dataset.attachmentName = attachment.attachmentName;
    downloadButton.textContent = 'Download';

    attachmentDiv.appendChild(attachIcon);
    attachmentDiv.appendChild(attachName);
    attachmentDiv.appendChild(downloadButton);
    attachmentElement.appendChild(attachmentDiv);

    messagesContainer.appendChild(attachmentElement);

    // Attach download handler
    const downloadBtn = attachmentElement.querySelector('.attachment-download');
    if (downloadBtn && this.config.onFileDownload) {
      downloadBtn.addEventListener('click', () => {
        this.config.onFileDownload?.(attachment.attachmentId, attachment.attachmentName);
      });
    }

    this.scrollToLatestMessage();
  }

  /**
   * Add file upload button to chat input
   */
  public addFileUploadButton(): void {
    const inputContainer = document.querySelector('.chat-input-container');
    if (!inputContainer) return;

    // Check if button already exists
    if (document.getElementById('file-upload-btn')) {
      return;
    }

    // Create file input (hidden)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'file-upload-input';
    fileInput.style.display = 'none';
    fileInput.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';

    // Create upload button
    const uploadBtn = document.createElement('button');
    uploadBtn.id = 'file-upload-btn';
    uploadBtn.className = 'file-upload-btn';
    uploadBtn.setAttribute('aria-label', 'Upload file');
    uploadBtn.innerHTML = '<span class="icon">📎</span>';

    // Insert before send button
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
      inputContainer.insertBefore(fileInput, sendBtn);
      inputContainer.insertBefore(uploadBtn, sendBtn);
    }

    // Attach event listeners
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file && this.config.onFileUpload) {
        this.config.onFileUpload(file);
        // Reset input
        target.value = '';
      }
    });
  }
}
