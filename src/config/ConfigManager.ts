/**
 * ConfigManager - Manages application configuration loading and validation
 * 
 * Responsibilities:
 * - Define configuration schema
 * - Load configuration from various sources
 * - Validate configuration on startup
 * - Provide type-safe configuration access
 */

import { AmazonConnectAppConfig } from '../AmazonConnectApp';

/**
 * Configuration source types
 */
export type ConfigSource = 'object' | 'json' | 'env';

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration Manager
 */
export class ConfigManager {
  private config: AmazonConnectAppConfig | null = null;

  /**
   * Load configuration from an object
   */
  public loadFromObject(config: Partial<AmazonConnectAppConfig>): AmazonConnectAppConfig {
    const validation = this.validateConfig(config);
    
    if (!validation.valid) {
      throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }
    
    this.config = config as AmazonConnectAppConfig;
    return this.config;
  }

  /**
   * Load configuration from JSON string
   */
  public loadFromJSON(jsonString: string): AmazonConnectAppConfig {
    try {
      const config = JSON.parse(jsonString);
      return this.loadFromObject(config);
    } catch (error) {
      throw new Error(`Failed to parse JSON configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load configuration from environment variables
   */
  public loadFromEnv(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): AmazonConnectAppConfig {
    const config: Partial<AmazonConnectAppConfig> = {
      region: env.AMAZON_CONNECT_REGION,
      instanceId: env.AMAZON_CONNECT_INSTANCE_ID,
      contactFlowId: env.AMAZON_CONNECT_CONTACT_FLOW_ID,
      chatContactFlowId: env.AMAZON_CONNECT_CHAT_CONTACT_FLOW_ID,
      participantDisplayName: env.AMAZON_CONNECT_PARTICIPANT_NAME,
      containerId: env.AMAZON_CONNECT_CONTAINER_ID,
      credentialMode: 'cognito-authenticated',
      cognitoUserPoolId: env.COGNITO_USER_POOL_ID,
      cognitoClientId: env.COGNITO_CLIENT_ID,
      cognitoIdentityPoolId: env.COGNITO_IDENTITY_POOL_ID,
    };
    
    // Parse optional numeric values
    if (env.AMAZON_CONNECT_MAX_FILE_SIZE) {
      const maxFileSize = parseInt(env.AMAZON_CONNECT_MAX_FILE_SIZE, 10);
      if (!isNaN(maxFileSize)) {
        config.maxFileSize = maxFileSize;
      }
    }
    
    // Parse optional boolean values
    if (env.AMAZON_CONNECT_ENABLE_VIDEO !== undefined) {
      config.enableVideo = env.AMAZON_CONNECT_ENABLE_VIDEO === 'true';
    }
    
    if (env.AMAZON_CONNECT_ENABLE_CHAT !== undefined) {
      config.enableChat = env.AMAZON_CONNECT_ENABLE_CHAT === 'true';
    }
    
    if (env.AMAZON_CONNECT_ENABLE_FILE_SHARING !== undefined) {
      config.enableFileSharing = env.AMAZON_CONNECT_ENABLE_FILE_SHARING === 'true';
    }
    
    return this.loadFromObject(config);
  }

  /**
   * Validate configuration
   */
  public validateConfig(config: Partial<AmazonConnectAppConfig>): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields validation
    if (!config.region) {
      errors.push('region is required');
    } else if (!this.isValidAWSRegion(config.region)) {
      warnings.push(`region "${config.region}" may not be a valid AWS region`);
    }
    
    if (!config.instanceId) {
      errors.push('instanceId is required');
    } else if (!this.isValidInstanceId(config.instanceId)) {
      warnings.push('instanceId format may be invalid');
    }
    
    if (!config.contactFlowId) {
      errors.push('contactFlowId is required');
    } else if (!this.isValidContactFlowId(config.contactFlowId)) {
      warnings.push('contactFlowId format may be invalid');
    }
    
    if (!config.participantDisplayName) {
      errors.push('participantDisplayName is required');
    } else if (config.participantDisplayName.length > 256) {
      errors.push('participantDisplayName must be 256 characters or less');
    }
    
    if (!config.containerId) {
      errors.push('containerId is required');
    }
    
    // Credential mode validation
    if (!config.credentialMode) {
      errors.push('credentialMode is required');
    } else {
      if (config.credentialMode !== 'cognito-authenticated') {
        errors.push('credentialMode must be "cognito-authenticated"');
      }
      
      // Validate required Cognito fields
      if (!config.cognitoUserPoolId) {
        errors.push('cognitoUserPoolId is required');
      }
      if (!config.cognitoClientId) {
        errors.push('cognitoClientId is required');
      }
      if (!config.cognitoIdentityPoolId) {
        errors.push('cognitoIdentityPoolId is required');
      } else if (!this.isValidCognitoIdentityPoolId(config.cognitoIdentityPoolId)) {
        warnings.push('cognitoIdentityPoolId format may be invalid');
      }
    }
    
    // Optional fields validation
    if (config.chatContactFlowId && !this.isValidContactFlowId(config.chatContactFlowId)) {
      warnings.push('chatContactFlowId format may be invalid');
    }
    
    if (config.maxFileSize !== undefined) {
      if (config.maxFileSize <= 0) {
        errors.push('maxFileSize must be greater than 0');
      } else if (config.maxFileSize > 100 * 1024 * 1024) {
        warnings.push('maxFileSize is very large (>100MB), this may cause performance issues');
      }
    }
    
    if (config.allowedFileTypes !== undefined) {
      if (!Array.isArray(config.allowedFileTypes)) {
        errors.push('allowedFileTypes must be an array');
      } else if (config.allowedFileTypes.length === 0) {
        errors.push('allowedFileTypes must contain at least one file type');
      } else {
        // Validate MIME types
        config.allowedFileTypes.forEach((type) => {
          if (!this.isValidMimeType(type)) {
            warnings.push(`"${type}" may not be a valid MIME type`);
          }
        });
      }
    }
    
    if (config.customAttributes !== undefined) {
      if (typeof config.customAttributes !== 'object' || config.customAttributes === null) {
        errors.push('customAttributes must be an object');
      } else {
        // Validate attribute keys and values
        Object.entries(config.customAttributes).forEach(([key, value]) => {
          if (typeof value !== 'string') {
            errors.push(`customAttributes["${key}"] must be a string`);
          }
          if (key.length > 128) {
            errors.push(`customAttributes key "${key}" exceeds 128 characters`);
          }
          if (typeof value === 'string' && value.length > 1024) {
            errors.push(`customAttributes["${key}"] value exceeds 1024 characters`);
          }
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get current configuration
   */
  public getConfig(): AmazonConnectAppConfig | null {
    return this.config;
  }

  /**
   * Check if configuration is loaded
   */
  public isConfigLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Clear current configuration
   */
  public clearConfig(): void {
    this.config = null;
  }

  /**
   * Merge configuration with defaults
   */
  public mergeWithDefaults(config: Partial<AmazonConnectAppConfig>): AmazonConnectAppConfig {
    const defaults: Partial<AmazonConnectAppConfig> = {
      enableVideo: true,
      enableChat: true,
      enableFileSharing: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedFileTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
      ],
      customAttributes: {},
    };
    
    return {
      ...defaults,
      ...config,
      chatContactFlowId: config.chatContactFlowId || config.contactFlowId,
    } as AmazonConnectAppConfig;
  }

  /**
   * Export configuration as JSON
   */
  public exportAsJSON(): string {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }
    
    return JSON.stringify(this.config, null, 2);
  }

  // Validation helper methods

  /**
   * Check if string is a valid AWS region
   */
  private isValidAWSRegion(region: string): boolean {
    const regionPattern = /^[a-z]{2}-[a-z]+-\d{1}$/;
    return regionPattern.test(region);
  }

  /**
   * Check if string is a valid Amazon Connect instance ID
   */
  private isValidInstanceId(instanceId: string): boolean {
    // Instance IDs are typically UUIDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(instanceId);
  }

  /**
   * Check if string is a valid contact flow ID
   */
  private isValidContactFlowId(contactFlowId: string): boolean {
    // Contact flow IDs are typically UUIDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(contactFlowId);
  }

  /**
   * Check if string is a valid MIME type
   */
  private isValidMimeType(mimeType: string): boolean {
    const mimeTypePattern = /^[a-z]+\/[a-z0-9\-+.]+$/i;
    return mimeTypePattern.test(mimeType);
  }

  /**
   * Check if string is a valid Cognito Identity Pool ID
   */
  private isValidCognitoIdentityPoolId(identityPoolId: string): boolean {
    // Format: region:uuid (e.g., "us-east-1:12345678-1234-1234-1234-123456789012")
    const identityPoolPattern = /^[a-z]{2}-[a-z]+-\d{1}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return identityPoolPattern.test(identityPoolId);
  }

  /**
   * Create a configuration builder for fluent API
   */
  public static builder(): ConfigBuilder {
    return new ConfigBuilder();
  }
}

/**
 * Configuration Builder for fluent API
 */
export class ConfigBuilder {
  private config: Partial<AmazonConnectAppConfig> = {};

  public setRegion(region: string): this {
    this.config.region = region;
    return this;
  }

  public setInstanceId(instanceId: string): this {
    this.config.instanceId = instanceId;
    return this;
  }

  public setContactFlowId(contactFlowId: string): this {
    this.config.contactFlowId = contactFlowId;
    return this;
  }

  public setChatContactFlowId(chatContactFlowId: string): this {
    this.config.chatContactFlowId = chatContactFlowId;
    return this;
  }

  public setParticipantDisplayName(displayName: string): this {
    this.config.participantDisplayName = displayName;
    return this;
  }

  public setContainerId(containerId: string): this {
    this.config.containerId = containerId;
    return this;
  }

  public setCredentialMode(mode: 'cognito-authenticated'): this {
    this.config.credentialMode = mode;
    return this;
  }

  public setCognitoIdentityPoolId(identityPoolId: string): this {
    this.config.cognitoIdentityPoolId = identityPoolId;
    return this;
  }

  public setCognitoUserPoolId(userPoolId: string): this {
    this.config.cognitoUserPoolId = userPoolId;
    return this;
  }

  public setCognitoClientId(clientId: string): this {
    this.config.cognitoClientId = clientId;
    return this;
  }

  public setMaxFileSize(maxFileSize: number): this {
    this.config.maxFileSize = maxFileSize;
    return this;
  }

  public setAllowedFileTypes(allowedFileTypes: string[]): this {
    this.config.allowedFileTypes = allowedFileTypes;
    return this;
  }

  public enableVideo(enable: boolean = true): this {
    this.config.enableVideo = enable;
    return this;
  }

  public enableChat(enable: boolean = true): this {
    this.config.enableChat = enable;
    return this;
  }

  public enableFileSharing(enable: boolean = true): this {
    this.config.enableFileSharing = enable;
    return this;
  }

  public setCustomAttributes(attributes: Record<string, string>): this {
    this.config.customAttributes = attributes;
    return this;
  }

  public addCustomAttribute(key: string, value: string): this {
    if (!this.config.customAttributes) {
      this.config.customAttributes = {};
    }
    this.config.customAttributes[key] = value;
    return this;
  }

  public build(): AmazonConnectAppConfig {
    const manager = new ConfigManager();
    return manager.loadFromObject(this.config);
  }

  public getPartialConfig(): Partial<AmazonConnectAppConfig> {
    return { ...this.config };
  }
}

