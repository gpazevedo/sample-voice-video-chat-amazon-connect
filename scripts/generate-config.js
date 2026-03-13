#!/usr/bin/env node
/**
 * Generate public/config.json from .env file
 * This is used for static hosting deployments (S3/CloudFront)
 * 
 * Uses Cognito User Pool + Identity Pool for secure credential management
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Base configuration (always included)
const config = {
  region: process.env.AMAZON_CONNECT_REGION || process.env.AWS_REGION || 'us-east-1',
  instanceId: process.env.AMAZON_CONNECT_INSTANCE_ID,
  instanceAlias: process.env.AMAZON_CONNECT_INSTANCE_ALIAS,
  contactFlowId: process.env.AMAZON_CONNECT_WEBRTC_FLOW_ID,
  chatContactFlowId: process.env.AMAZON_CONNECT_CHAT_FLOW_ID,
  chatSnippetId: process.env.AMAZON_CONNECT_CHAT_SNIPPET_ID,
  chatDocumentId: process.env.AMAZON_CONNECT_CHAT_DOCUMENT_ID,
  enableVideo: process.env.AMAZON_CONNECT_ENABLE_VIDEO === 'true',
  enableChat: process.env.AMAZON_CONNECT_ENABLE_CHAT === 'true',
  enableFileSharing: true, // Always enabled - controlled by Amazon Connect Chat Widget
  maxFileSize: 10485760, // 10MB - controlled by Amazon Connect Chat Widget
  credentialMode: 'cognito-authenticated',
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || 'PLACEHOLDER_USER_POOL_ID',
  cognitoClientId: process.env.COGNITO_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID',
  cognitoIdentityPoolId: process.env.COGNITO_IDENTITY_POOL_ID || 'PLACEHOLDER_IDENTITY_POOL_ID'
};

// Check if Cognito IDs are placeholders (not yet deployed)
const hasCognitoPlaceholders = 
  config.cognitoUserPoolId.startsWith('PLACEHOLDER') ||
  config.cognitoClientId.startsWith('PLACEHOLDER') ||
  config.cognitoIdentityPoolId.startsWith('PLACEHOLDER');

if (hasCognitoPlaceholders) {
  console.log('⚠️  Cognito IDs not found in .env - using placeholders');
  console.log('   These will be replaced after CDK deployment');
  console.log('   Run: npm run cdk:deploy');
  console.log('   Then update .env with the Cognito IDs from stack outputs');
  console.log('');
}

// Validate required fields
if (!config.instanceId || !config.contactFlowId) {
  console.error('❌ Missing required configuration in .env file');
  console.error('   Required: AMAZON_CONNECT_INSTANCE_ID, AMAZON_CONNECT_WEBRTC_FLOW_ID');
  process.exit(1);
}

// Ensure public directory exists
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write to public/config.json
const outputPath = path.join(publicDir, 'config.json');
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log('✅ Generated public/config.json from .env');
console.log('   Region:', config.region);
console.log('   Instance ID:', config.instanceId);
console.log('   Instance Alias:', config.instanceAlias || '(not set)');
console.log('   WebRTC Flow ID:', config.contactFlowId);
console.log('   Chat Flow ID:', config.chatContactFlowId || '(not set)');
console.log('   Chat Snippet ID:', config.chatSnippetId ? `${config.chatSnippetId.substring(0, 20)}...${config.chatSnippetId.substring(config.chatSnippetId.length - 20)}` : '(not set)');
console.log('   Chat Document ID:', config.chatDocumentId || '(not set)');

if (!hasCognitoPlaceholders) {
  console.log('   Cognito User Pool ID:', config.cognitoUserPoolId);
  console.log('   Cognito Client ID:', config.cognitoClientId);
  console.log('   Cognito Identity Pool ID:', config.cognitoIdentityPoolId);
} else {
  console.log('   Cognito User Pool ID: (placeholder - deploy CDK first)');
  console.log('   Cognito Client ID: (placeholder - deploy CDK first)');
  console.log('   Cognito Identity Pool ID: (placeholder - deploy CDK first)');
}
