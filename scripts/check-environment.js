#!/usr/bin/env node

/**
 * Environment Check Script
 * Validates that all required tools, versions, and configuration files are ready for deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('🔍 Checking environment setup...\n');

const checks = [
  {
    name: 'Node.js version',
    command: 'node --version',
    validate: (output) => {
      const version = parseInt(output.replace('v', '').split('.')[0]);
      return version >= 18;
    },
    requirement: 'Node.js 18+'
  },
  {
    name: 'npm version',
    command: 'npm --version',
    validate: () => true,
    requirement: 'npm installed'
  },
  {
    name: 'Local CDK version',
    command: 'npx aws-cdk --version',
    validate: (output) => {
      const version = output.match(/(\d+\.\d+\.\d+)/);
      if (!version) return false;
      const [major, minor] = version[1].split('.').map(Number);
      return major > 2 || (major === 2 && minor >= 1105);
    },
    requirement: 'CDK CLI 2.1105.0+'
  },
  {
    name: 'AWS CLI',
    command: 'aws --version',
    validate: () => true,
    requirement: 'AWS CLI installed'
  },
  {
    name: '.env file',
    command: null,
    validate: () => fs.existsSync('.env'),
    requirement: '.env file exists'
  }
];

// Environment variable checks
const envVars = [
  { name: 'AWS_ACCOUNT_ID', required: true },
  { name: 'AWS_REGION', required: true },
  { name: 'AMAZON_CONNECT_INSTANCE_ID', required: true },
  { name: 'AMAZON_CONNECT_INSTANCE_ALIAS', required: true },
  { name: 'AMAZON_CONNECT_QUEUE_ID', required: true },
  { name: 'AMAZON_CONNECT_CHAT_SNIPPET_ID', required: true },
  { name: 'AMAZON_CONNECT_CHAT_DOCUMENT_ID', required: true }
];

// Generated file checks
const fileChecks = [
  {
    name: 'CDK configuration',
    path: './lib/config/cdk-infrastructure-config.json',
    hint: 'Run: npm run generate-cdk-config'
  },
  {
    name: 'Contact flows directory',
    path: './contact-flows/generated',
    hint: 'Run: npm run update-contact-flows'
  }
];

let allPassed = true;

// Check tools and versions
for (const check of checks) {
  try {
    let output = '';
    if (check.command) {
      output = execSync(check.command, { encoding: 'utf8' }).trim();
    }
    
    const passed = check.validate(output);
    const status = passed ? '✅' : '❌';
    
    console.log(`${status} ${check.name}: ${output || (passed ? 'OK' : 'MISSING')}`);
    
    if (!passed) {
      console.log(`   Required: ${check.requirement}`);
      allPassed = false;
    }
  } catch (error) {
    console.log(`❌ ${check.name}: NOT FOUND`);
    console.log(`   Required: ${check.requirement}`);
    allPassed = false;
  }
}

console.log('');
console.log('🔍 Checking environment variables...\n');

// Check environment variables
for (const envVar of envVars) {
  const value = process.env[envVar.name];
  const hasValue = value && value !== '' && !value.startsWith('PLACEHOLDER_') && !value.includes('your-');
  const status = hasValue ? '✅' : '❌';
  
  console.log(`${status} ${envVar.name}: ${hasValue ? 'SET' : 'MISSING'}`);
  
  if (!hasValue) {
    allPassed = false;
  }
}

console.log('');
console.log('🔍 Checking generated files...\n');

// Check generated files
for (const fileCheck of fileChecks) {
  const exists = fs.existsSync(fileCheck.path);
  const status = exists ? '✅' : '❌';
  
  console.log(`${status} ${fileCheck.name}: ${exists ? 'EXISTS' : 'MISSING'}`);
  
  if (!exists) {
    console.log(`   Hint: ${fileCheck.hint}`);
    allPassed = false;
  }
}

console.log('');

if (allPassed) {
  console.log('🎉 Environment setup is complete! Ready to deploy.');
} else {
  console.log('⚠️  Please fix the issues above before deploying.');
  process.exit(1);
}