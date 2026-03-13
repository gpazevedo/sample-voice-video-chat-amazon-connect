#!/usr/bin/env node

/**
 * Generate CDK configuration file (lib/config/cdk-infrastructure-config.json) from .env
 * This script reads environment variables and creates the CDK infrastructure configuration
 * with sensible defaults for sample code deployment.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read required values from .env
const awsAccountId = process.env.AWS_ACCOUNT_ID;
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const connectInstanceId = process.env.AMAZON_CONNECT_INSTANCE_ID;

// Validate required environment variables
if (!awsAccountId) {
  console.error('❌ Error: AWS_ACCOUNT_ID is required in .env file');
  console.error('   Add: AWS_ACCOUNT_ID=your-account-id');
  process.exit(1);
}

if (!connectInstanceId) {
  console.error('❌ Error: AMAZON_CONNECT_INSTANCE_ID is required in .env file');
  console.error('   Add: AMAZON_CONNECT_INSTANCE_ID=your-instance-id');
  process.exit(1);
}

// Build Connect instance ARN
const connectInstanceArn = `arn:aws:connect:${awsRegion}:${awsAccountId}:instance/${connectInstanceId}`;

// Generate CDK configuration with sensible defaults
const cdkConfig = {
  account: awsAccountId,
  region: awsRegion,
  cognito: {
    userPoolName: 'connect-web-app-user-pool',
    passwordPolicy: {
      minLength: 8,
      requireLowercase: true,
      requireUppercase: true,
      requireNumbers: true,
      requireSymbols: true,
      tempPasswordValidity: 7
    },
    mfaConfiguration: 'OFF',
    autoVerifiedAttributes: ['email']
  },
  storage: {
    hostingBucketName: 'connect-web-app-hosting',
    lifecyclePolicies: []
  },
  distribution: {
    priceClass: 'PriceClass_100',
    cacheBehaviors: []
  },
  connect: {
    instanceArn: connectInstanceArn,
    contactFlowsPath: './contact-flows'
  },
  tags: {
    ManagedBy: 'CDK',
    Application: 'ConnectWebApp'
  }
};

// Write to lib/config/cdk-infrastructure-config.json
const outputPath = path.join(__dirname, '..', 'lib', 'config', 'cdk-infrastructure-config.json');
fs.writeFileSync(outputPath, JSON.stringify(cdkConfig, null, 2) + '\n');

console.log('✅ Generated lib/config/cdk-infrastructure-config.json from .env');
console.log(`   Account: ${awsAccountId}`);
console.log(`   Region: ${awsRegion}`);
console.log(`   Connect Instance: ${connectInstanceId}`);
