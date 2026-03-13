/**
 * IAM Stack for Amazon Connect Web Application.
 * 
 * This stack manages IAM roles and policies for Cognito authenticated users.
 * It creates roles with least privilege permissions for Amazon Connect operations
 * and establishes trust relationships with the Cognito Identity Pool.
 * 
 * Validates: Requirements 3.3, 3.4, 5.1, 5.2, 5.3, 5.4, 5.6, 11.1, 11.2
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { EnvironmentConfig } from '../config/config-schema';

/**
 * Properties for the IAMStack.
 */
export interface IamStackProps extends cdk.StackProps {
  /** Complete environment configuration */
  config: EnvironmentConfig;
  
  /** Cognito Identity Pool ID for trust relationship */
  identityPoolId: string;
}

/**
 * IAM Stack that creates roles and policies for Cognito authenticated users.
 * 
 * This stack provides:
 * - Authenticated user IAM role with Amazon Connect permissions
 * - Unauthenticated user IAM role with minimal permissions
 * - Policies for Connect API and Connect Participant API operations
 * - Exports for cross-stack references
 */
export class IamStack extends cdk.Stack {
  /** IAM role for authenticated Cognito users */
  public readonly authenticatedRole: iam.Role;
  
  /** IAM role for unauthenticated users */
  public readonly unauthenticatedRole: iam.Role;
  
  /** Authenticated role ARN for cross-stack references */
  public readonly authenticatedRoleArn: string;
  
  /** Authenticated role name */
  public readonly authenticatedRoleName: string;
  
  /** Unauthenticated role ARN for cross-stack references */
  public readonly unauthenticatedRoleArn: string;

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const { config, identityPoolId } = props;

    // Generate unique role names with timestamp to avoid conflicts
    const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
    const baseRoleName = `${config.cognito.userPoolName.replace('-user-pool', '')}`;

    // Create authenticated user role with trust relationship to Cognito Identity Pool
    this.authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: `${baseRoleName}-auth-${timestamp}`,
      description: 'IAM role for authenticated Cognito users with Amazon Connect permissions',
      
      // Trust relationship with Cognito Identity Pool
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPoolId,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Add Amazon Connect API permissions
    // WebRTC: StartWebRTCContact + DescribeContact (agent ID polling) + StopContact
    // Chat is handled by the Amazon Connect Chat Standard Widget (no SDK permissions needed)
    const connectApiPolicy = new iam.Policy(this, 'ConnectApiPolicy', {
      policyName: 'ConnectApiAccess',
      statements: [
        new iam.PolicyStatement({
          sid: 'ConnectWebRTCAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'connect:StartWebRTCContact',
            'connect:DescribeContact',
            'connect:StopContact',
          ],
          resources: config.connect.instanceArn
            ? [
                `${config.connect.instanceArn}/contact-flow/*`,
                `${config.connect.instanceArn}/contact/*`,
              ]
            : ['*'],
        }),
      ],
    });

    this.authenticatedRole.attachInlinePolicy(connectApiPolicy);

    // Add Connect Participant permission for WebRTC disconnect only
    const connectParticipantPolicy = new iam.Policy(this, 'ConnectParticipantPolicy', {
      policyName: 'ConnectParticipantAccess',
      statements: [
        new iam.PolicyStatement({
          sid: 'ConnectParticipantDisconnect',
          effect: iam.Effect.ALLOW,
          actions: [
            'connectparticipant:DisconnectParticipant',
          ],
          resources: ['*'],
        }),
      ],
    });

    this.authenticatedRole.attachInlinePolicy(connectParticipantPolicy);

    // Create unauthenticated user role with minimal permissions
    // This role is created for completeness but has no permissions granted
    this.unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
      roleName: `${baseRoleName}-unauth-${timestamp}`,
      description: 'IAM role for unauthenticated users with minimal permissions',
      
      // Trust relationship with Cognito Identity Pool for unauthenticated access
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPoolId,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // No permissions granted to unauthenticated role - least privilege principle
    // Users must authenticate to access any resources

    // Attach IAM roles to Cognito Identity Pool
    // This is critical - without this attachment, users will get "Invalid identity pool configuration" errors
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPoolId,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
        unauthenticated: this.unauthenticatedRole.roleArn,
      },
    });

    // Store role ARNs and names for cross-stack references
    this.authenticatedRoleArn = this.authenticatedRole.roleArn;
    this.authenticatedRoleName = this.authenticatedRole.roleName;
    this.unauthenticatedRoleArn = this.unauthenticatedRole.roleArn;

    // Export authenticated role ARN
    new cdk.CfnOutput(this, 'AuthenticatedRoleArnOutput', {
      value: this.authenticatedRoleArn,
      description: 'IAM role ARN for authenticated Cognito users',
      exportName: `${this.stackName}-AuthenticatedRoleArn`,
    });

    // Export authenticated role name
    new cdk.CfnOutput(this, 'AuthenticatedRoleNameOutput', {
      value: this.authenticatedRoleName,
      description: 'IAM role name for authenticated Cognito users',
      exportName: `${this.stackName}-AuthenticatedRoleName`,
    });

    // Export unauthenticated role ARN
    new cdk.CfnOutput(this, 'UnauthenticatedRoleArnOutput', {
      value: this.unauthenticatedRoleArn,
      description: 'IAM role ARN for unauthenticated users',
      exportName: `${this.stackName}-UnauthenticatedRoleArn`,
    });

    // Apply tags to all resources
    cdk.Tags.of(this).add('Application', 'ConnectWebApp');
    
    // Apply custom tags from configuration
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
