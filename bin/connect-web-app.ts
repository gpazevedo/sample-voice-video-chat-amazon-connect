#!/usr/bin/env node
/**
 * CDK Application Entry Point for Amazon Connect Web Application.
 * 
 * This file initializes the CDK application and instantiates all stacks
 * in the correct dependency order. It loads configuration and applies
 * CDK Nag for security validation.
 * 
 * Usage:
 *   cdk synth
 *   cdk deploy --all
 * 
 * Validates: Requirements 2.1, 3.1, 3.3, 3.4, 10.1, 11.1, 11.2
 */

import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { ConfigurationManager } from '../lib/config/configuration-manager';
import { AuthenticationStack } from '../lib/stacks/authentication-stack';
import { IamStack } from '../lib/stacks/iam-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { DistributionStack } from '../lib/stacks/distribution-stack';
import { ConnectStack } from '../lib/stacks/connect-stack';
import { SecurityAspect } from '../lib/aspects/security-aspect';

/**
 * Main application initialization.
 */
async function main() {
  // Initialize CDK App
  const app = new cdk.App();

  // Load configuration (uses cdk-infrastructure-config.json for sample code)
  const configManager = new ConfigurationManager('./lib/config');
  const config = configManager.loadConfig('cdk-infrastructure-config');

  // Get global configuration from CDK context
  const globalContext = app.node.tryGetContext('global') || {};
  const appName = globalContext.appName || 'ConnectWebApp';
  const owner = globalContext.owner || 'platform-team@example.com';
  const costCenter = globalContext.costCenter || 'CC-12345';

  // Define stack environment (account and region)
  const stackEnv = {
    account: config.account,
    region: config.region,
  };

  // Stack naming convention: {AppName}-{StackName}
  const getStackName = (stackName: string) => `${appName}-${stackName}`;

  // 1. Instantiate AuthenticationStack (base stack, no dependencies)
  const authStack = new AuthenticationStack(app, getStackName('Authentication'), {
    env: stackEnv,
    config,
    description: `Authentication infrastructure for ${appName}`,
  });

  // 2. Instantiate IAMStack (depends on AuthenticationStack)
  const iamStack = new IamStack(app, getStackName('IAM'), {
    env: stackEnv,
    config,
    identityPoolId: authStack.identityPoolId,
    description: `IAM roles and policies for ${appName}`,
  });
  
  // Explicit dependency: IAM stack depends on Authentication stack
  iamStack.addDependency(authStack);

  // 3. Instantiate StorageStack (depends on IAMStack)
  const storageStack = new StorageStack(app, getStackName('Storage'), {
    env: stackEnv,
    config,
    authenticatedRoleArn: iamStack.authenticatedRoleArn,
    description: `Storage infrastructure for ${appName}`,
  });
  
  // Explicit dependency: Storage stack depends on IAM stack
  storageStack.addDependency(iamStack);

  // 4. Instantiate DistributionStack (depends on StorageStack)
  const distributionStack = new DistributionStack(app, getStackName('Distribution'), {
    env: stackEnv,
    config,
    hostingBucket: storageStack.hostingBucket,
    description: `CloudFront distribution for ${appName}`,
  });
  
  // Note: Dependency is implicit through hostingBucket reference
  // CDK automatically handles the cross-stack dependency

  // 5. Instantiate ConnectStack (depends on IAMStack and StorageStack)
  const connectStack = new ConnectStack(app, getStackName('Connect'), {
    env: stackEnv,
    config,
    authenticatedRoleArn: iamStack.authenticatedRoleArn,
    description: `Amazon Connect resources for ${appName}`,
  });
  
  // Explicit dependencies: Connect stack depends on IAM and Storage stacks
  connectStack.addDependency(iamStack);
  connectStack.addDependency(storageStack);

  // Apply global tags to all stacks
  const allStacks = [authStack, iamStack, storageStack, distributionStack, connectStack];
  
  allStacks.forEach(stack => {
    cdk.Tags.of(stack).add('Application', appName);
    cdk.Tags.of(stack).add('Owner', owner);
    cdk.Tags.of(stack).add('CostCenter', costCenter);
    cdk.Tags.of(stack).add('ManagedBy', 'CDK');
  });

  // Apply SecurityAspect for CDK Nag security validation
  // This will run AwsSolutionsChecks during synthesis and report security findings
  // The aspect is configured to fail the build on high-severity findings
  // 
  // To enable CDK Nag validation, set environment variable: CDK_NAG=true
  // Example: CDK_NAG=true cdk deploy
  const cdkNagEnabled = process.env.CDK_NAG === 'true';
  
  if (cdkNagEnabled) {
    console.log('✅ CDK Nag security validation enabled');
    Aspects.of(app).add(new SecurityAspect({
      verbose: true,
      failOnHighSeverity: true,
    }));
  }

  // Note: CDK Nag suppressions should be added in individual stacks
  // using NagSuppressions.addResourceSuppressions() or NagSuppressions.addStackSuppressions()
  // with documented justifications as required by the SecurityAspect

  // Synthesize the app
  app.synth();
}

// Execute main function and handle errors
main().catch(error => {
  console.error('Error initializing CDK application:', error);
  process.exit(1);
});
