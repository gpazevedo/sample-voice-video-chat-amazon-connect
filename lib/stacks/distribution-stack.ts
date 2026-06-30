/**
 * Distribution Stack for Amazon Connect Web Application.
 * 
 * This stack manages CloudFront distribution for content delivery with
 * security headers, caching optimization, and HTTPS enforcement.
 * 
 * Validates: Requirements 3.3, 3.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 11.1, 11.2, 16.2
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { EnvironmentConfig } from '../config/config-schema';
import { NagSuppressions } from 'cdk-nag';

/**
 * Properties for the DistributionStack.
 */
export interface DistributionStackProps extends cdk.StackProps {
  /** Complete environment configuration */
  config: EnvironmentConfig;
  
  /** S3 bucket for static web hosting */
  hostingBucket: s3.IBucket;
}

/**
 * Distribution Stack that creates CloudFront distribution for content delivery.
 * 
 * This stack provides:
 * - CloudFront distribution with S3 origin
 * - Origin Access Control (OAC) for secure S3 access
 * - Optimized caching behaviors for different content types
 * - HTTPS enforcement with TLS 1.2 minimum
 * - Security headers via CloudFront Function
 * - Custom error responses for SPA routing
 * - Compression for text-based content
 * - Exports for cross-stack references
 */
export class DistributionStack extends cdk.Stack {
  /** CloudFront distribution */
  public readonly distribution: cloudfront.Distribution;
  
  /** Distribution domain name */
  public readonly distributionDomainName: string;
  
  /** Distribution ID */
  public readonly distributionId: string;

  constructor(scope: Construct, id: string, props: DistributionStackProps) {
    super(scope, id, props);

    const { config, hostingBucket } = props;
    
    // Generate timestamp for unique resource naming
    const timestamp = Date.now().toString();

    // Create CloudFront Function for security headers
    const securityHeadersFunction = new cloudfront.Function(this, 'SecurityHeadersFunction', {
      functionName: `${config.storage.hostingBucketName}-security-headers-${timestamp}`,
      code: cloudfront.FunctionCode.fromInline(this.getSecurityHeadersCode()),
      comment: 'Adds security headers to all responses',
    });

    // Get certificate if provided for custom domain
    let certificate: acm.ICertificate | undefined;
    if (config.distribution.certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        config.distribution.certificateArn
      );
    }

    // Create Origin Access Control (OAC) for S3 bucket access
    const cfnOriginAccessControl = new cloudfront.CfnOriginAccessControl(this, 'OAC', {
      originAccessControlConfig: {
        name: `${config.storage.hostingBucketName}-oac-${timestamp}`,
        description: `OAC for ${config.storage.hostingBucketName}`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });

    // Create S3 origin using HttpOrigin to avoid automatic OAI creation
    // We'll attach OAC at the L1 level after distribution creation
    const s3Origin = new origins.HttpOrigin(hostingBucket.bucketRegionalDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      httpsPort: 443,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    });

    // Map price class string to CloudFront PriceClass
    const priceClass = this.getPriceClass(config.distribution.priceClass);

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `CloudFront distribution for sample code`,
      
      // Default behavior for root and HTML files
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true, // Enable compression for text-based content
        
        // Short TTL for HTML files to allow quick updates
        cachePolicy: new cloudfront.CachePolicy(this, 'DefaultCachePolicy', {
          cachePolicyName: `${config.storage.hostingBucketName}-default-cache-${timestamp}`,
          comment: 'Cache policy for HTML files with short TTL',
          defaultTtl: cdk.Duration.minutes(5),
          minTtl: cdk.Duration.seconds(0),
          maxTtl: cdk.Duration.hours(1),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
        
        // Add security headers function
        functionAssociations: [{
          function: securityHeadersFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
        }],
      },
      
      // Default root object
      defaultRootObject: 'index.html',
      
      // Enable IPv6
      enableIpv6: true,
      
      // Disable logging for sample code (no logging bucket needed)
      enableLogging: false,
      
      // Price class for cost optimization
      priceClass,
      
      // Minimum TLS version
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      
      // Custom domain configuration (if provided)
      domainNames: config.distribution.domainName ? [config.distribution.domainName] : undefined,
      certificate,
      
      // Custom error responses for SPA routing
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // Add additional cache behaviors from configuration
    config.distribution.cacheBehaviors.forEach((behaviorConfig) => {
      this.distribution.addBehavior(
        behaviorConfig.pathPattern,
        s3Origin,
        {
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: this.getAllowedMethods(behaviorConfig.allowedMethods),
          cachedMethods: this.getCachedMethods(behaviorConfig.cachedMethods),
          compress: true,
          
          cachePolicy: new cloudfront.CachePolicy(this, `CachePolicy-${behaviorConfig.pathPattern.replace(/[^a-zA-Z0-9]/g, '-')}`, {
            cachePolicyName: `${config.storage.hostingBucketName}-${behaviorConfig.pathPattern.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`,
            comment: `Cache policy for ${behaviorConfig.pathPattern}`,
            defaultTtl: cdk.Duration.seconds(behaviorConfig.ttl),
            minTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.days(365),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
          
          // Add security headers function
          functionAssociations: [{
            function: securityHeadersFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
          }],
        }
      );
    });

    // Note: Attach OAC to the distribution at L1 level
    // Get the L1 CloudFormation distribution resource
    const cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
    
    // Override the origin configuration to use S3 origin type with OAC
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.S3OriginConfig', {
      OriginAccessIdentity: '',
    });
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', cfnOriginAccessControl.attrId);
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.CustomOriginConfig', undefined);
    
    // Store distribution properties
    this.distributionDomainName = this.distribution.distributionDomainName;
    this.distributionId = this.distribution.distributionId;

    // Export distribution domain name
    new cdk.CfnOutput(this, 'DistributionDomainNameOutput', {
      value: this.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `${this.stackName}-DistributionDomainName`,
    });

    // Export distribution ID
    new cdk.CfnOutput(this, 'DistributionIdOutput', {
      value: this.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${this.stackName}-DistributionId`,
    });

    // Export distribution ARN
    new cdk.CfnOutput(this, 'DistributionArnOutput', {
      value: `arn:aws:cloudfront::${this.account}:distribution/${this.distributionId}`,
      description: 'CloudFront distribution ARN',
      exportName: `${this.stackName}-DistributionArn`,
    });

    // Export security headers function name for manual updates
    new cdk.CfnOutput(this, 'SecurityHeadersFunctionNameOutput', {
      value: securityHeadersFunction.functionName,
      description: 'CloudFront security headers function name',
      exportName: `${this.stackName}-SecurityHeadersFunctionName`,
    });

    // Apply tags to all resources
    cdk.Tags.of(this).add('Application', 'ConnectWebApp');

    // CDK Nag suppression: default CloudFront domain enforces TLSv1 minimum
    // regardless of minimumProtocolVersion setting. Custom domain with ACM
    // certificate required to enforce TLSv1.2 — not applicable for this sample.
    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR4',
        reason: 'Sample project uses default CloudFront domain (*.cloudfront.net). TLS_V1_2_2021 policy is set but only enforced with custom domain + ACM certificate. Since this is a sample project, there is no custom domain required',
      },
    ], true);
    
    // Apply custom tags from configuration
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }

  /**
   * Returns CloudFront Function code for adding security headers.
   * 
   * Adds the following security headers:
   * - Strict-Transport-Security (HSTS)
   * - X-Content-Type-Options
   * - X-Frame-Options
   * - Content-Security-Policy
   * - Referrer-Policy
   * 
   * @returns CloudFront Function code as string
   */
  private getSecurityHeadersCode(): string {
    // All Amazon Connect regions and their WebSocket transport endpoints
    // Keep this list synchronized with scripts/update-csp-regions.js
    // Only includes regions where Amazon Connect is actually available
    const connectRegions = [
      'us-east-1',      // US East (N. Virginia)
      'us-west-2',      // US West (Oregon)
      'af-south-1',     // Africa (Cape Town)
      'ap-northeast-1', // Asia Pacific (Tokyo)
      'ap-northeast-2', // Asia Pacific (Seoul)
      'ap-southeast-1', // Asia Pacific (Singapore)
      'ap-southeast-2', // Asia Pacific (Sydney)
      'ca-central-1',   // Canada (Central)
      'eu-central-1',   // Europe (Frankfurt)
      'eu-west-2',      // Europe (London)
      'us-gov-west-1'   // AWS GovCloud (US-West)
    ];
    
    const wsTransportEndpoints = connectRegions
      .map(region => `wss://*.transport.connect.${region}.amazonaws.com`)
      .join(' ');
    
    return `
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  // Strict-Transport-Security (HSTS)
  headers['strict-transport-security'] = { value: 'max-age=63072000; includeSubdomains; preload' };
  
  // X-Content-Type-Options
  headers['x-content-type-options'] = { value: 'nosniff' };
  
  // X-Frame-Options
  headers['x-frame-options'] = { value: 'DENY' };
  
  // Content-Security-Policy
  headers['content-security-policy'] = { 
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.my.connect.aws; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://*.chime.aws https://*.my.connect.aws https://*.cloudfront.net wss://*.chime.aws ${wsTransportEndpoints}; worker-src 'self' blob:; media-src 'self' blob:;" 
  };
  
  // Referrer-Policy
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };

  return response;
}
    `.trim();
  }

  /**
   * Maps price class string to CloudFront PriceClass enum.
   * 
   * @param priceClass - Price class name from configuration
   * @returns CloudFront PriceClass enum value
   */
  private getPriceClass(priceClass: string): cloudfront.PriceClass {
    const priceClassMap: Record<string, cloudfront.PriceClass> = {
      'PriceClass_All': cloudfront.PriceClass.PRICE_CLASS_ALL,
      'PriceClass_200': cloudfront.PriceClass.PRICE_CLASS_200,
      'PriceClass_100': cloudfront.PriceClass.PRICE_CLASS_100,
    };

    const mappedClass = priceClassMap[priceClass];
    if (!mappedClass) {
      throw new Error(
        `Invalid price class: ${priceClass}. ` +
        `Valid options: ${Object.keys(priceClassMap).join(', ')}`
      );
    }

    return mappedClass;
  }

  /**
   * Maps allowed methods array to CloudFront AllowedMethods enum.
   * 
   * @param methods - Array of HTTP method strings
   * @returns CloudFront AllowedMethods enum value
   */
  private getAllowedMethods(methods: string[]): cloudfront.AllowedMethods {
    const methodsStr = methods.sort().join(',');
    
    if (methodsStr === 'GET,HEAD') {
      return cloudfront.AllowedMethods.ALLOW_GET_HEAD;
    } else if (methodsStr === 'GET,HEAD,OPTIONS') {
      return cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS;
    } else if (methodsStr === 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT') {
      return cloudfront.AllowedMethods.ALLOW_ALL;
    }
    
    // Default to GET and HEAD
    return cloudfront.AllowedMethods.ALLOW_GET_HEAD;
  }

  /**
   * Maps cached methods array to CloudFront CachedMethods enum.
   * 
   * @param methods - Array of HTTP method strings
   * @returns CloudFront CachedMethods enum value
   */
  private getCachedMethods(methods: string[]): cloudfront.CachedMethods {
    const methodsStr = methods.sort().join(',');
    
    if (methodsStr === 'GET,HEAD') {
      return cloudfront.CachedMethods.CACHE_GET_HEAD;
    } else if (methodsStr === 'GET,HEAD,OPTIONS') {
      return cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS;
    }
    
    // Default to GET and HEAD
    return cloudfront.CachedMethods.CACHE_GET_HEAD;
  }
}
