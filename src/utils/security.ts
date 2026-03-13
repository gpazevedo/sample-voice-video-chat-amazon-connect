/**
 * Security utilities for Amazon Connect Web Application
 * Provides API response validation, input sanitization, and injection attack prevention
 */

/**
 * Validation result for API responses
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * API response validator
 * Validates response structure and content to prevent injection attacks
 */
export class APIResponseValidator {
  /**
   * Validate StartWebRTCContact API response
   */
  static validateStartWebRTCContactResponse(response: any): ValidationResult {
    const errors: string[] = [];

    // Check required top-level fields
    if (!response || typeof response !== 'object') {
      errors.push('Response must be an object');
      return { valid: false, errors };
    }

    if (typeof response.ContactId !== 'string' || !response.ContactId) {
      errors.push('ContactId must be a non-empty string');
    }

    if (typeof response.ParticipantId !== 'string' || !response.ParticipantId) {
      errors.push('ParticipantId must be a non-empty string');
    }

    if (typeof response.ParticipantToken !== 'string' || !response.ParticipantToken) {
      errors.push('ParticipantToken must be a non-empty string');
    }

    // Validate ConnectionData structure
    if (!response.ConnectionData || typeof response.ConnectionData !== 'object') {
      errors.push('ConnectionData must be an object');
    } else {
      const connData = response.ConnectionData;

      // Validate Meeting structure
      if (!connData.Meeting || typeof connData.Meeting !== 'object') {
        errors.push('ConnectionData.Meeting must be an object');
      } else {
        const meeting = connData.Meeting;
        if (typeof meeting.MeetingId !== 'string' || !meeting.MeetingId) {
          errors.push('Meeting.MeetingId must be a non-empty string');
        }
        if (typeof meeting.MediaRegion !== 'string' || !meeting.MediaRegion) {
          errors.push('Meeting.MediaRegion must be a non-empty string');
        }
        if (!meeting.MediaPlacement || typeof meeting.MediaPlacement !== 'object') {
          errors.push('Meeting.MediaPlacement must be an object');
        }
      }

      // Validate Attendee structure
      if (!connData.Attendee || typeof connData.Attendee !== 'object') {
        errors.push('ConnectionData.Attendee must be an object');
      } else {
        const attendee = connData.Attendee;
        if (typeof attendee.AttendeeId !== 'string' || !attendee.AttendeeId) {
          errors.push('Attendee.AttendeeId must be a non-empty string');
        }
        if (typeof attendee.JoinToken !== 'string' || !attendee.JoinToken) {
          errors.push('Attendee.JoinToken must be a non-empty string');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate StartChatContact API response
   */
  static validateStartChatContactResponse(response: any): ValidationResult {
    const errors: string[] = [];

    if (!response || typeof response !== 'object') {
      errors.push('Response must be an object');
      return { valid: false, errors };
    }

    if (typeof response.ContactId !== 'string' || !response.ContactId) {
      errors.push('ContactId must be a non-empty string');
    }

    if (typeof response.ParticipantId !== 'string' || !response.ParticipantId) {
      errors.push('ParticipantId must be a non-empty string');
    }

    if (typeof response.ParticipantToken !== 'string' || !response.ParticipantToken) {
      errors.push('ParticipantToken must be a non-empty string');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate CreateParticipantConnection API response
   */
  static validateCreateParticipantConnectionResponse(response: any): ValidationResult {
    const errors: string[] = [];

    if (!response || typeof response !== 'object') {
      errors.push('Response must be an object');
      return { valid: false, errors };
    }

    if (typeof response.ConnectionToken !== 'string' || !response.ConnectionToken) {
      errors.push('ConnectionToken must be a non-empty string');
    }

    if (!response.Websocket || typeof response.Websocket !== 'object') {
      errors.push('Websocket must be an object');
    } else {
      if (typeof response.Websocket.Url !== 'string' || !response.Websocket.Url) {
        errors.push('Websocket.Url must be a non-empty string');
      }
      // Validate WebSocket URL format
      if (response.Websocket.Url && !this.isValidWebSocketUrl(response.Websocket.Url)) {
        errors.push('Websocket.Url must be a valid WebSocket URL');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate chat message from WebSocket
   */
  static validateChatMessage(message: any): ValidationResult {
    const errors: string[] = [];

    if (!message || typeof message !== 'object') {
      errors.push('Message must be an object');
      return { valid: false, errors };
    }

    if (typeof message.Id !== 'string' || !message.Id) {
      errors.push('Message.Id must be a non-empty string');
    }

    if (typeof message.Type !== 'string' || !message.Type) {
      errors.push('Message.Type must be a non-empty string');
    }

    if (typeof message.ContentType !== 'string' || !message.ContentType) {
      errors.push('Message.ContentType must be a non-empty string');
    }

    // Validate ParticipantRole
    const validRoles = ['AGENT', 'CUSTOMER', 'SYSTEM'];
    if (message.ParticipantRole && !validRoles.includes(message.ParticipantRole)) {
      errors.push(`Message.ParticipantRole must be one of: ${validRoles.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate attachment upload response
   */
  static validateAttachmentUploadResponse(response: any): ValidationResult {
    const errors: string[] = [];

    if (!response || typeof response !== 'object') {
      errors.push('Response must be an object');
      return { valid: false, errors };
    }

    if (typeof response.AttachmentId !== 'string' || !response.AttachmentId) {
      errors.push('AttachmentId must be a non-empty string');
    }

    if (typeof response.UploadMetadata !== 'object' || !response.UploadMetadata) {
      errors.push('UploadMetadata must be an object');
    } else {
      if (typeof response.UploadMetadata.Url !== 'string' || !response.UploadMetadata.Url) {
        errors.push('UploadMetadata.Url must be a non-empty string');
      }
      // Validate URL format
      if (response.UploadMetadata.Url && !this.isValidHttpsUrl(response.UploadMetadata.Url)) {
        errors.push('UploadMetadata.Url must be a valid HTTPS URL');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate attachment download response
   */
  static validateAttachmentDownloadResponse(response: any): ValidationResult {
    const errors: string[] = [];

    if (!response || typeof response !== 'object') {
      errors.push('Response must be an object');
      return { valid: false, errors };
    }

    if (typeof response.Url !== 'string' || !response.Url) {
      errors.push('Url must be a non-empty string');
    }

    // Validate URL format
    if (response.Url && !this.isValidHttpsUrl(response.Url)) {
      errors.push('Url must be a valid HTTPS URL');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate WebSocket URL format
   */
  private static isValidWebSocketUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
    } catch {
      return false;
    }
  }

  /**
   * Validate HTTPS URL format
   */
  private static isValidHttpsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

/**
 * Input sanitizer to prevent injection attacks
 */
export class InputSanitizer {
  /**
   * Sanitize user input for API calls
   * Removes potentially dangerous characters and patterns
   */
  static sanitizeString(input: string, maxLength: number = 1024): string {
    if (typeof input !== 'string') {
      return '';
    }

    // Trim whitespace
    let sanitized = input.trim();

    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters except newline and tab
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
  }

  /**
   * Sanitize display name for participant details
   */
  static sanitizeDisplayName(displayName: string): string {
    const sanitized = this.sanitizeString(displayName, 256);
    
    // Additional validation for display names
    if (!sanitized || sanitized.length === 0) {
      return 'Customer';
    }

    return sanitized;
  }

  /**
   * Sanitize chat message content
   */
  static sanitizeChatMessage(message: string): string {
    return this.sanitizeString(message, 4096);
  }

  /**
   * Sanitize file name
   */
  static sanitizeFileName(fileName: string): string {
    let sanitized = this.sanitizeString(fileName, 255);

    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');
    sanitized = sanitized.replace(/[/\\]/g, '_');

    // Remove potentially dangerous characters
    sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

    return sanitized;
  }

  /**
   * Sanitize attribute values for API calls
   */
  static sanitizeAttributeValue(value: string): string {
    return this.sanitizeString(value, 512);
  }

  /**
   * Validate and sanitize contact flow ID
   */
  static sanitizeContactFlowId(contactFlowId: string): string {
    const sanitized = this.sanitizeString(contactFlowId, 500);
    
    // Contact flow IDs should be UUIDs or ARNs
    // Basic validation to prevent injection
    if (!/^[a-zA-Z0-9:/_-]+$/.test(sanitized)) {
      throw new Error('Invalid contact flow ID format');
    }

    return sanitized;
  }

  /**
   * Validate and sanitize instance ID
   */
  static sanitizeInstanceId(instanceId: string): string {
    const sanitized = this.sanitizeString(instanceId, 500);
    
    // Instance IDs should be UUIDs or ARNs
    // Basic validation to prevent injection
    if (!/^[a-zA-Z0-9:/_-]+$/.test(sanitized)) {
      throw new Error('Invalid instance ID format');
    }

    return sanitized;
  }

  /**
   * Sanitize object by sanitizing all string values
   */
  static sanitizeObject<T extends Record<string, any>>(obj: T): T {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as T;
  }
}

/**
 * Content Security Policy helper
 */
export class ContentSecurityPolicy {
  /**
   * Check if a URL is from an allowed domain
   */
  static isAllowedDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const parsed = new URL(url);
      return allowedDomains.some(domain => 
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Validate that URLs are from AWS domains
   */
  static isAWSDomain(url: string): boolean {
    const awsDomains = [
      'amazonaws.com',
      'aws.amazon.com',
      'chime.aws',
    ];
    return this.isAllowedDomain(url, awsDomains);
  }
}

/**
 * Sensitive data encryption for local storage
 * Uses Web Crypto API for encryption
 */
export class SensitiveDataProtection {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12;
  private static encryptionKey: CryptoKey | null = null;

  /**
   * Initialize encryption key
   * Should be called once during application initialization
   */
  static async initialize(): Promise<void> {
    // Try to restore key from session storage (not persisted across browser sessions)
    const storedKey = sessionStorage.getItem('_ek');
    
    if (storedKey) {
      try {
        const keyData = this.base64ToArrayBuffer(storedKey);
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: this.ALGORITHM, length: this.KEY_LENGTH },
          false,
          ['encrypt', 'decrypt']
        );
        return;
      } catch {
        // If restoration fails, generate new key
      }
    }

    // Generate new encryption key
    this.encryptionKey = await crypto.subtle.generateKey(
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );

    // Store key in session storage (cleared when browser closes)
    const exportedKey = await crypto.subtle.exportKey('raw', this.encryptionKey);
    sessionStorage.setItem('_ek', this.arrayBufferToBase64(exportedKey));
  }

  /**
   * Encrypt sensitive data before storing in local storage
   */
  static async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    // Encrypt data
    const encodedData = new TextEncoder().encode(data);
    const encryptedData = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      this.encryptionKey,
      encodedData
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);

    // Return as base64
    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypt sensitive data from local storage
   */
  static async decrypt(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Decode from base64
    const combined = this.base64ToArrayBuffer(encryptedData);
    const combinedArray = new Uint8Array(combined);

    // Extract IV and encrypted data
    const iv = combinedArray.slice(0, this.IV_LENGTH);
    const data = combinedArray.slice(this.IV_LENGTH);

    // Decrypt data
    const decryptedData = await crypto.subtle.decrypt(
      { name: this.ALGORITHM, iv },
      this.encryptionKey,
      data
    );

    // Decode to string
    return new TextDecoder().decode(decryptedData);
  }

  /**
   * Clear encryption key from memory
   * Should be called on session end
   */
  static clearKey(): void {
    this.encryptionKey = null;
    try {
      sessionStorage.removeItem('_ek');
    } catch {
      // Ignore errors
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * Secure storage wrapper for sensitive data
 */
export class SecureStorage {
  private static readonly SENSITIVE_KEYS = [
    'amazon-connect-session-context',
    'amazon-connect-session-backup',
  ];

  /**
   * Store sensitive data with encryption (if available)
   */
  static async setItem(key: string, value: string): Promise<void> {
    if (this.isSensitiveKey(key)) {
      try {
        // Try to encrypt if Web Crypto API is available
        if (typeof crypto !== 'undefined' && crypto.subtle) {
          const encrypted = await SensitiveDataProtection.encrypt(value);
          localStorage.setItem(key, encrypted);
          localStorage.setItem(`${key}_encrypted`, 'true');
          return;
        }
      } catch (error) {
        // Fall back to unencrypted storage if encryption fails
        console.warn('Encryption not available, storing data unencrypted:', error);
      }
    }
    
    // Store unencrypted
    localStorage.setItem(key, value);
  }

  /**
   * Retrieve sensitive data with decryption (if encrypted)
   */
  static async getItem(key: string): Promise<string | null> {
    const value = localStorage.getItem(key);
    if (!value) {
      return null;
    }

    if (this.isSensitiveKey(key)) {
      const isEncrypted = localStorage.getItem(`${key}_encrypted`) === 'true';
      if (isEncrypted) {
        try {
          return await SensitiveDataProtection.decrypt(value);
        } catch (error) {
          console.error('Failed to decrypt sensitive data:', error);
          // Clear corrupted data
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_encrypted`);
          return null;
        }
      }
    }

    return value;
  }

  /**
   * Remove item from storage
   */
  static removeItem(key: string): void {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_encrypted`);
  }

  /**
   * Clear all sensitive data from storage
   */
  static clearSensitiveData(): void {
    for (const key of this.SENSITIVE_KEYS) {
      try {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_encrypted`);
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Check if a key contains sensitive data
   */
  private static isSensitiveKey(key: string): boolean {
    return this.SENSITIVE_KEYS.includes(key);
  }
}

/**
 * Memory cleanup utilities for sensitive data
 */
export class MemoryCleanup {
  private static sensitiveDataRefs: Set<any> = new Set();

  /**
   * Register sensitive data for cleanup
   */
  static register(data: any): void {
    this.sensitiveDataRefs.add(data);
  }

  /**
   * Clear all registered sensitive data from memory
   */
  static clearAll(): void {
    for (const ref of this.sensitiveDataRefs) {
      this.clearObject(ref);
    }
    this.sensitiveDataRefs.clear();
  }

  /**
   * Clear sensitive object properties
   */
  private static clearObject(obj: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Clear all string properties (tokens, credentials, etc.)
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value === 'string') {
          // Overwrite with empty string
          obj[key] = '';
        } else if (typeof value === 'object' && value !== null) {
          // Recursively clear nested objects
          this.clearObject(value);
        }
      }
    }
  }

  /**
   * Clear specific sensitive fields from an object
   */
  static clearSensitiveFields(obj: any, fields: string[]): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(obj, field)) {
        if (typeof obj[field] === 'string') {
          obj[field] = '';
        } else if (typeof obj[field] === 'object' && obj[field] !== null) {
          this.clearObject(obj[field]);
        }
      }
    }
  }
}

