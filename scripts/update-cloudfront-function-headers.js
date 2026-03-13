#!/usr/bin/env node

/**
 * Updates CloudFront Function headers without full redeployment
 * Usage: node scripts/update-cloudfront-function-headers.js
 */

const { CloudFrontClient, GetFunctionCommand, UpdateFunctionCommand } = require('@aws-sdk/client-cloudfront');

async function updateFunctionHeaders() {
  const client = new CloudFrontClient({ region: 'us-east-1' }); // CloudFront is global
  
  // Get function name from CDK outputs or environment
  const functionName = process.env.CLOUDFRONT_FUNCTION_NAME;
  if (!functionName) {
    console.error('CLOUDFRONT_FUNCTION_NAME environment variable required');
    process.exit(1);
  }

  try {
    // Get current function
    const getResponse = await client.send(new GetFunctionCommand({ Name: functionName }));
    
    // Updated CSP with all Amazon Connect regions
    const connectRegions = [
      'us-east-1', 'us-west-2', 'af-south-1', 'ap-northeast-1', 
      'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2', 
      'ca-central-1', 'eu-central-1', 'eu-west-2', 'us-gov-west-1'
    ];
    
    const wsEndpoints = connectRegions
      .map(region => `wss://*.transport.connect.${region}.amazonaws.com`)
      .join(' ');

    const updatedCode = `
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  headers['strict-transport-security'] = { value: 'max-age=63072000; includeSubdomains; preload' };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'DENY' };
  headers['content-security-policy'] = { 
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.my.connect.aws; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://*.chime.aws https://*.my.connect.aws https://*.cloudfront.net wss://*.chime.aws ${wsEndpoints}; worker-src 'self' blob:; media-src 'self' blob:;" 
  };
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };

  return response;
}`.trim();

    // Update function
    await client.send(new UpdateFunctionCommand({
      Name: functionName,
      FunctionCode: Buffer.from(updatedCode),
      FunctionConfig: getResponse.FunctionConfig,
      IfMatch: getResponse.ETag
    }));

    console.log(`✅ Updated CloudFront Function: ${functionName}`);
    
  } catch (error) {
    console.error('❌ Failed to update function:', error.message);
    process.exit(1);
  }
}

updateFunctionHeaders();