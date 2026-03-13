#!/usr/bin/env node

/**
 * Update CSP Regions Script
 * 
 * This script updates the Content Security Policy in index.html to include
 * all Amazon Connect regions' WebSocket transport endpoints.
 * 
 * Usage: node scripts/update-csp-regions.js
 */

const fs = require('fs');
const path = require('path');

// All Amazon Connect regions and their WebSocket transport endpoints
// Only includes regions where Amazon Connect is actually available
const AMAZON_CONNECT_REGIONS = [
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

const INDEX_PATH = path.join(__dirname, '../index.html');

console.log('🔐 Updating Content Security Policy with all Amazon Connect regions...');

// Read index.html
if (!fs.existsSync(INDEX_PATH)) {
  console.error('❌ Error: index.html not found.');
  process.exit(1);
}

let html = fs.readFileSync(INDEX_PATH, 'utf8');

// Generate WebSocket transport endpoints for all regions
const wsTransportEndpoints = AMAZON_CONNECT_REGIONS
  .map(region => `wss://*.transport.connect.${region}.amazonaws.com`)
  .join(' ');

// Build the complete CSP
const cspContent = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.my.connect.aws",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://*.chime.aws https://*.my.connect.aws https://*.cloudfront.net wss://*.chime.aws ${wsTransportEndpoints}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:"
].join('; ') + ';';

// Update the CSP meta tag
const cspRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*">/;
const newCspTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;

if (cspRegex.test(html)) {
  html = html.replace(cspRegex, newCspTag);
  fs.writeFileSync(INDEX_PATH, html, 'utf8');
  
  console.log('✅ Updated Content Security Policy in index.html');
  console.log(`📋 Included WebSocket endpoints for ${AMAZON_CONNECT_REGIONS.length} regions:`);
  AMAZON_CONNECT_REGIONS.forEach(region => {
    console.log(`   - wss://*.transport.connect.${region}.amazonaws.com`);
  });
  console.log('');
  console.log('🔄 Run "npm run deploy-to-s3" to deploy the updated CSP');
} else {
  console.error('❌ Error: Could not find CSP meta tag in index.html');
  process.exit(1);
}