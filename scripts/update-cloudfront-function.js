#!/usr/bin/env node

/**
 * Update CloudFront Function CSP Script
 * Updates the CloudFront Function to include all Amazon Connect regions
 */

const { execSync } = require('child_process');

const FUNCTION_NAME = 'connect-web-app-hosting-security-headers-1771971535109';

// All Amazon Connect regions (only regions where Amazon Connect is actually available)
const CONNECT_REGIONS = [
  'us-east-1', 'us-west-2', 'af-south-1', 'ap-northeast-1', 'ap-northeast-2',
  'ap-southeast-1', 'ap-southeast-2', 'ca-central-1', 'eu-central-1',
  'eu-west-2', 'us-gov-west-1'
];

const wsTransportEndpoints = CONNECT_REGIONS
  .map(region => `wss://*.transport.connect.${region}.amazonaws.com`)
  .join(' ');

const functionCode = `
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  headers['strict-transport-security'] = { value: 'max-age=63072000; includeSubdomains; preload' };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'DENY' };
  headers['content-security-policy'] = { 
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.my.connect.aws; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://*.chime.aws https://*.my.connect.aws https://*.cloudfront.net wss://*.chime.aws ${wsTransportEndpoints}; worker-src 'self' blob:; media-src 'self' blob:;" 
  };
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };

  return response;
}`.trim();

console.log('🔄 Updating CloudFront Function CSP...');

try {
  // Get current ETag
  const describeResult = execSync(`aws cloudfront describe-function --name ${FUNCTION_NAME} --region us-east-1 --output json`, { encoding: 'utf8' });
  const etag = JSON.parse(describeResult).ETag;
  
  // Write function code to temp file
  require('fs').writeFileSync('/tmp/cf-function.js', functionCode);
  
  // Update function
  execSync(`aws cloudfront update-function --name ${FUNCTION_NAME} --function-code fileb:///tmp/cf-function.js --function-config Comment="Updated CSP with all regions",Runtime=cloudfront-js-1.0 --if-match ${etag} --region us-east-1`, { stdio: 'inherit' });
  
  // Get new ETag for publish
  const newDescribeResult = execSync(`aws cloudfront describe-function --name ${FUNCTION_NAME} --region us-east-1 --output json`, { encoding: 'utf8' });
  const newEtag = JSON.parse(newDescribeResult).ETag;
  
  // Publish to LIVE
  execSync(`aws cloudfront publish-function --name ${FUNCTION_NAME} --if-match ${newEtag} --region us-east-1`, { stdio: 'inherit' });
  
  console.log('✅ CloudFront Function updated and published to LIVE');
  console.log('⏱️  Changes will take effect within a few minutes');
  
} catch (error) {
  console.error('❌ Error updating CloudFront Function:', error.message);
  process.exit(1);
}