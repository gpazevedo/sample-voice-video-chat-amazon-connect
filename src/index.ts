/**
 * Amazon Connect Web Application
 * Main entry point for the application
 */

// Export main application class
export { AmazonConnectApp, AmazonConnectAppConfig } from './AmazonConnectApp';

// Export configuration management
export { ConfigManager, ConfigBuilder, ConfigValidationResult, ConfigSource } from './config/ConfigManager';

// Export managers
export { WebRTCManager } from './managers/WebRTCManager';
export { ChatManager } from './managers/ChatManager';
export { SessionManager } from './managers/SessionManager';
export { CredentialManager, AWSCredentials, CognitoIdentityPoolConfig, CredentialError, CredentialErrorCode } from './managers/CredentialManager';
export { AuthenticationStateManager, AuthenticatedUser } from './managers/AuthenticationStateManager';

// Export models
export * from './models';

// Export UI controller
export { UIController, UIControllerConfig, CallStatus, NotificationType, ViewportSize } from './ui/UIController';
export { LoginComponent, LoginComponentConfig, AuthenticationResult } from './ui/LoginComponent';

// Export version
export const version = '1.0.0';
