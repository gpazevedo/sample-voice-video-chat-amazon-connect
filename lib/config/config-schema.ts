/**
 * Configuration schema interfaces for the Amazon Connect Web Application CDK infrastructure.
 * 
 * These interfaces define the structure of environment-specific configuration files
 * and ensure type safety when loading and using configuration values.
 */

/**
 * Main environment configuration interface.
 * Defines all configuration required for deploying the Connect Web App infrastructure.
 */
export interface EnvironmentConfig {
  /** AWS account ID where resources will be deployed */
  account: string;
  
  /** AWS region for resource deployment */
  region: string;
  
  /** Cognito authentication configuration */
  cognito: {
    /** Name for the Cognito User Pool */
    userPoolName: string;
    
    /** Password policy requirements */
    passwordPolicy: PasswordPolicyConfig;
    
    /** MFA configuration setting */
    mfaConfiguration: 'OFF' | 'OPTIONAL' | 'REQUIRED';
    
    /** Attributes that are auto-verified (e.g., ['email', 'phone_number']) */
    autoVerifiedAttributes: string[];
  };
  
  /** S3 storage configuration */
  storage: {
    /** Name for the hosting S3 bucket */
    hostingBucketName: string;
    
    /** S3 lifecycle policies for cost optimization */
    lifecyclePolicies: LifecyclePolicyConfig[];
  };
  
  /** CloudFront distribution configuration */
  distribution: {
    /** Optional ACM certificate ARN for custom domain */
    certificateArn?: string;
    
    /** Optional custom domain name */
    domainName?: string;
    
    /** CloudFront price class (e.g., 'PriceClass_All', 'PriceClass_100') */
    priceClass: string;
    
    /** Cache behavior configurations */
    cacheBehaviors: CacheBehaviorConfig[];
  };
  
  /** Amazon Connect configuration */
  connect: {
    /** Optional existing Connect instance ARN */
    instanceArn?: string;
    
    /** ID of the existing queue (BasicQueue) the contact flows route to */
    queueId: string;

    /** Path to contact flow definition files */
    contactFlowsPath: string;
  };
  
  /** Resource tags to apply to all resources */
  tags: Record<string, string>;
}

/**
 * Password policy configuration for Cognito User Pool.
 * Defines password complexity requirements.
 */
export interface PasswordPolicyConfig {
  /** Minimum password length */
  minLength: number;
  
  /** Require at least one lowercase letter */
  requireLowercase: boolean;
  
  /** Require at least one uppercase letter */
  requireUppercase: boolean;
  
  /** Require at least one number */
  requireNumbers: boolean;
  
  /** Require at least one special character */
  requireSymbols: boolean;
  
  /** Number of days temporary passwords are valid */
  tempPasswordValidity: number;
}

/**
 * S3 lifecycle policy configuration.
 * Defines rules for transitioning or expiring objects.
 */
export interface LifecyclePolicyConfig {
  /** Unique identifier for the lifecycle rule */
  id: string;
  
  /** Whether the rule is enabled */
  enabled: boolean;
  
  /** Storage class transitions */
  transitions: TransitionConfig[];
  
  /** Optional expiration configuration */
  expiration?: ExpirationConfig;
}

/**
 * S3 lifecycle transition configuration.
 * Defines when and how objects transition to different storage classes.
 */
export interface TransitionConfig {
  /** Target storage class (e.g., 'INTELLIGENT_TIERING', 'GLACIER') */
  storageClass: string;
  
  /** Number of days after object creation to transition */
  days: number;
}

/**
 * S3 lifecycle expiration configuration.
 * Defines when objects should be automatically deleted.
 */
export interface ExpirationConfig {
  /** Number of days after object creation to expire */
  days: number;
}

/**
 * CloudFront cache behavior configuration.
 * Defines caching rules for different path patterns.
 */
export interface CacheBehaviorConfig {
  /** Path pattern to match (e.g., '*.js', '*.css', '/api/*') */
  pathPattern: string;
  
  /** Time to live in seconds for cached objects */
  ttl: number;
  
  /** HTTP methods allowed for this path pattern */
  allowedMethods: string[];
  
  /** HTTP methods that should be cached */
  cachedMethods: string[];
}
