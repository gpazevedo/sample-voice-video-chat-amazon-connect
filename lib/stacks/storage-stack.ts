/**
 * Storage Stack for Amazon Connect Web Application.
 * 
 * This stack manages S3 buckets for static web hosting.
 * It creates buckets with versioning, encryption, and lifecycle policies
 * for cost optimization while maintaining security best practices.
 * 
 * Validates: Requirements 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 11.1, 11.2
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from '../config/config-schema';
import { NagSuppressions } from 'cdk-nag';

/**
 * Properties for the StorageStack.
 */
export interface StorageStackProps extends cdk.StackProps {
  /** Complete environment configuration */
  config: EnvironmentConfig;
  
  /** Authenticated role ARN for bucket policy */
  authenticatedRoleArn: string;
}

/**
 * Storage Stack that creates S3 buckets for static web hosting.
 * 
 * This stack provides:
 * - S3 bucket configured for static website hosting
 * - Versioning enabled for data protection
 * - Server-side encryption (SSE-S3)
 * - Bucket policies restricting access to authorized principals
 * - Lifecycle policies for cost optimization
 * - Exports for cross-stack references
 */
export class StorageStack extends cdk.Stack {
  /** S3 bucket for static web hosting */
  public readonly hostingBucket: s3.Bucket;
  
  /** Hosting bucket name for cross-stack references */
  public readonly hostingBucketName: string;
  
  /** Hosting bucket ARN for cross-stack references */
  public readonly hostingBucketArn: string;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { config, authenticatedRoleArn } = props;

    // Generate unique bucket name with timestamp to avoid conflicts
    const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
    const baseBucketName = config.storage.hostingBucketName;
    const uniqueBucketName = `${baseBucketName}-${timestamp}`;

    // Create S3 bucket for static web hosting
    this.hostingBucket = new s3.Bucket(this, 'HostingBucket', {
      bucketName: uniqueBucketName,
      
      // Enable versioning for data protection and recovery
      versioned: true,
      
      // Enable server-side encryption with S3-managed keys
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Block all public access - access will be granted through CloudFront only
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // Configure for static website hosting
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      
      // Removal policy - sample code uses DESTROY for easy cleanup
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      
      // Auto-delete objects for easier cleanup
      autoDeleteObjects: true,
      
      // Enable CORS for web application access
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'], // Will be restricted by CloudFront
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // Apply lifecycle policies for cost optimization
    config.storage.lifecyclePolicies.forEach((policyConfig) => {
      if (policyConfig.enabled) {
        const transitions: s3.Transition[] = policyConfig.transitions.map((t) => ({
          storageClass: this.getStorageClass(t.storageClass),
          transitionAfter: cdk.Duration.days(t.days),
        }));

        const expiration = policyConfig.expiration
          ? cdk.Duration.days(policyConfig.expiration.days)
          : undefined;

        this.hostingBucket.addLifecycleRule({
          id: policyConfig.id,
          enabled: policyConfig.enabled,
          transitions,
          expiration,
        });
      }
    });

    // Grant read access to authenticated role
    // This allows authenticated users to access uploaded files
    this.hostingBucket.grantRead(iam.Role.fromRoleArn(
      this,
      'AuthenticatedRole',
      authenticatedRoleArn
    ));

    // Add bucket policy to require SSL/TLS for all requests
    // This addresses AwsSolutions-S10 security finding
    this.hostingBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.hostingBucket.bucketArn,
        `${this.hostingBucket.bucketArn}/*`,
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false',
        },
      },
    }));

    // Add bucket policy to allow CloudFront OAC access
    // This addresses AwsSolutions-S5 security finding
    // Note: The specific distribution ARN will be added by CloudFront OAC automatically
    this.hostingBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudFrontServicePrincipal',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${this.hostingBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceAccount': this.account,
        },
      },
    }));

    // Store bucket properties for cross-stack references
    this.hostingBucketName = this.hostingBucket.bucketName;
    this.hostingBucketArn = this.hostingBucket.bucketArn;

    // CDK Nag suppression: S5 rule only recognizes OAI, not the newer OAC pattern.
    // This bucket uses OAC with BLOCK_ALL public access and a scoped bucket policy
    // allowing only cloudfront.amazonaws.com with SourceAccount condition.
    NagSuppressions.addResourceSuppressions(this.hostingBucket, [
      {
        id: 'AwsSolutions-S5',
        reason: 'Bucket uses CloudFront OAC (not OAI) with BLOCK_ALL public access and scoped service principal policy. CDK Nag S5 rule does not recognize OAC pattern.',
      },
    ], true);

    // Export hosting bucket name
    new cdk.CfnOutput(this, 'HostingBucketNameOutput', {
      value: this.hostingBucketName,
      description: 'S3 bucket name for static web hosting',
      exportName: `${this.stackName}-HostingBucketName`,
    });

    // Export hosting bucket ARN
    new cdk.CfnOutput(this, 'HostingBucketArnOutput', {
      value: this.hostingBucketArn,
      description: 'S3 bucket ARN for static web hosting',
      exportName: `${this.stackName}-HostingBucketArn`,
    });

    // Export hosting bucket domain name for CloudFront origin
    new cdk.CfnOutput(this, 'HostingBucketDomainNameOutput', {
      value: this.hostingBucket.bucketRegionalDomainName,
      description: 'S3 bucket regional domain name for CloudFront origin',
      exportName: `${this.stackName}-HostingBucketDomainName`,
    });

    // Apply tags to all resources
    cdk.Tags.of(this).add('Application', 'ConnectWebApp');
    
    // Apply custom tags from configuration
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }

  /**
   * Maps storage class string to S3 StorageClass enum.
   * 
   * @param storageClass - Storage class name from configuration
   * @returns S3 StorageClass enum value
   */
  private getStorageClass(storageClass: string): s3.StorageClass {
    const storageClassMap: Record<string, s3.StorageClass> = {
      'INTELLIGENT_TIERING': s3.StorageClass.INTELLIGENT_TIERING,
      'GLACIER': s3.StorageClass.GLACIER,
      'GLACIER_INSTANT_RETRIEVAL': s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
      'DEEP_ARCHIVE': s3.StorageClass.DEEP_ARCHIVE,
      'INFREQUENT_ACCESS': s3.StorageClass.INFREQUENT_ACCESS,
      'ONE_ZONE_INFREQUENT_ACCESS': s3.StorageClass.ONE_ZONE_INFREQUENT_ACCESS,
    };

    const mappedClass = storageClassMap[storageClass];
    if (!mappedClass) {
      throw new Error(
        `Invalid storage class: ${storageClass}. ` +
        `Valid options: ${Object.keys(storageClassMap).join(', ')}`
      );
    }

    return mappedClass;
  }
}
