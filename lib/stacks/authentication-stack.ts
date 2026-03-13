/**
 * Authentication Stack for Amazon Connect Web Application.
 * 
 * This stack manages Cognito User Pool and Identity Pool for user authentication.
 * It creates the authentication infrastructure required for the web application
 * with configurable password policies, MFA settings, and identity federation.
 * 
 * Validates: Requirements 3.3, 3.4, 4.1, 4.2, 4.3, 4.6, 11.1, 11.2
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { EnvironmentConfig } from '../config/config-schema';

/**
 * Properties for the AuthenticationStack.
 */
export interface AuthenticationStackProps extends cdk.StackProps {
  /** Complete environment configuration */
  config: EnvironmentConfig;
}

/**
 * Authentication Stack that creates Cognito User Pool and Identity Pool.
 * 
 * This stack provides:
 * - Cognito User Pool with configurable password policy
 * - User Pool Client for web application authentication
 * - Cognito Identity Pool for AWS credential federation
 * - Exports for cross-stack references
 */
export class AuthenticationStack extends cdk.Stack {
  /** The Cognito User Pool */
  public readonly userPool: cognito.UserPool;
  
  /** The Cognito User Pool Client */
  public readonly userPoolClient: cognito.UserPoolClient;
  
  /** The Cognito Identity Pool */
  public readonly identityPool: cognito.CfnIdentityPool;
  
  /** User Pool ID for cross-stack references */
  public readonly userPoolId: string;
  
  /** User Pool ARN for IAM policies */
  public readonly userPoolArn: string;
  
  /** Identity Pool ID for IAM role configuration */
  public readonly identityPoolId: string;
  
  /** User Pool Client ID for application configuration */
  public readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthenticationStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create Cognito User Pool with password policy from configuration
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: config.cognito.userPoolName,
      
      // Self-service sign-up disabled for security (users created by admin)
      selfSignUpEnabled: false,
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: true,
      },
      
      // Auto-verified attributes from configuration
      autoVerify: {
        email: config.cognito.autoVerifiedAttributes.includes('email'),
        phone: config.cognito.autoVerifiedAttributes.includes('phone_number'),
      },
      
      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      
      // Password policy from configuration
      passwordPolicy: {
        minLength: config.cognito.passwordPolicy.minLength,
        requireLowercase: config.cognito.passwordPolicy.requireLowercase,
        requireUppercase: config.cognito.passwordPolicy.requireUppercase,
        requireDigits: config.cognito.passwordPolicy.requireNumbers,
        requireSymbols: config.cognito.passwordPolicy.requireSymbols,
        tempPasswordValidity: cdk.Duration.days(
          config.cognito.passwordPolicy.tempPasswordValidity
        ),
      },
      
      // MFA disabled for sample code simplicity
      mfa: cognito.Mfa.OFF,
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Removal policy - sample code uses DESTROY for easy cleanup
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create User Pool Client for web application
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `${config.cognito.userPoolName}-web-client`,
      
      // Auth flows appropriate for web application
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },
      
      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
      },
      
      // Token validity periods
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Prevent user existence errors for security
      preventUserExistenceErrors: true,
      
      // Enable token revocation
      enableTokenRevocation: true,
    });

    // Create Cognito Identity Pool linked to User Pool
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `${config.cognito.userPoolName.replace('-user-pool', '')}-identity-pool`,
      
      // Allow unauthenticated access disabled for security
      allowUnauthenticatedIdentities: false,
      
      // Link to Cognito User Pool
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    // Store IDs and ARNs for cross-stack references
    this.userPoolId = this.userPool.userPoolId;
    this.userPoolArn = this.userPool.userPoolArn;
    this.identityPoolId = this.identityPool.ref;
    this.userPoolClientId = this.userPoolClient.userPoolClientId;

    // Export User Pool ID
    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: this.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${this.stackName}-UserPoolId`,
    });

    // Export User Pool ARN
    new cdk.CfnOutput(this, 'UserPoolArnOutput', {
      value: this.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `${this.stackName}-UserPoolArn`,
    });

    // Export Identity Pool ID
    new cdk.CfnOutput(this, 'IdentityPoolIdOutput', {
      value: this.identityPoolId,
      description: 'Cognito Identity Pool ID',
      exportName: `${this.stackName}-IdentityPoolId`,
    });

    // Export User Pool Client ID
    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      value: this.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    // Apply tags to all resources
    cdk.Tags.of(this).add('Application', 'ConnectWebApp');
    
    // Apply custom tags from configuration
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
