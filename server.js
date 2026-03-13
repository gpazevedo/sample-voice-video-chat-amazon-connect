/**
 * Simple server for Amazon Connect Web Application
 * Loads configuration from .env file and serves it to the browser
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// MIME types for static files
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Only add HSTS header if using HTTPS
  if (req.connection.encrypted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API endpoint to get configuration
  if ((req.url === '/api/config' || req.url === '/config.json') && req.method === 'GET') {
    const config = {
      region: process.env.AMAZON_CONNECT_REGION || process.env.AWS_REGION || 'us-east-1',
      instanceId: process.env.AMAZON_CONNECT_INSTANCE_ID,
      instanceAlias: process.env.AMAZON_CONNECT_INSTANCE_ALIAS,
      contactFlowId: process.env.AMAZON_CONNECT_WEBRTC_FLOW_ID,
      chatContactFlowId: process.env.AMAZON_CONNECT_CHAT_FLOW_ID,
      chatSnippetId: process.env.AMAZON_CONNECT_CHAT_SNIPPET_ID,
      chatDocumentId: process.env.AMAZON_CONNECT_CHAT_DOCUMENT_ID,
      credentialMode: 'cognito-authenticated',
      // participantDisplayName is now collected from user input in the web UI
      enableVideo: process.env.AMAZON_CONNECT_ENABLE_VIDEO === 'true',
      enableChat: process.env.AMAZON_CONNECT_ENABLE_CHAT === 'true',
      enableFileSharing: true, // Always enabled - controlled by Amazon Connect Chat Widget
      maxFileSize: 10485760 // 10MB - controlled by Amazon Connect Chat Widget
    };

    // Include User Pool and Identity Pool configuration for authenticated mode
    config.cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
    config.cognitoClientId = process.env.COGNITO_CLIENT_ID;
    config.cognitoIdentityPoolId = process.env.COGNITO_IDENTITY_POOL_ID;
    
    // Validate required fields for Cognito authenticated mode
    const missingFields = [];
    if (!config.cognitoUserPoolId) missingFields.push('COGNITO_USER_POOL_ID');
    if (!config.cognitoClientId) missingFields.push('COGNITO_CLIENT_ID');
    if (!config.cognitoIdentityPoolId) missingFields.push('COGNITO_IDENTITY_POOL_ID');
    
    if (missingFields.length > 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing required Cognito configuration',
        required: missingFields,
        hint: 'Run deploy-cognito-infrastructure.sh to set up Cognito resources and update .env'
      }));
      return;
    }

    // Validate common required fields
    if (!config.instanceId || !config.contactFlowId) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required configuration. Please check your .env file.',
        required: ['AMAZON_CONNECT_INSTANCE_ID', 'AMAZON_CONNECT_WEBRTC_FLOW_ID']
      }));
      return;
    }

    console.log('📋 Configuration loaded from .env:');
    console.log('   Region:', config.region);
    console.log('   Instance ID:', config.instanceId);
    console.log('   Instance Alias:', config.instanceAlias || '(not set)');
    console.log('   WebRTC Flow ID:', config.contactFlowId);
    console.log('   Chat Flow ID:', config.chatContactFlowId || '(not set)');
    console.log('   Chat Snippet ID:', config.chatSnippetId ? 'Set' : '(not set)');
    console.log('   Chat Document ID:', config.chatDocumentId || '(not set)');
    console.log('   Cognito User Pool ID:', config.cognitoUserPoolId);
    console.log('   Cognito Client ID:', config.cognitoClientId);
    console.log('   Cognito Identity Pool ID:', config.cognitoIdentityPoolId);
    console.log('   Note: Participant name will be collected from user input');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // Serve static files
  let filePath = req.url;
  
  // Handle root path
  if (filePath === '/') {
    filePath = '/index.html';
  }

  // Strip query strings and decode URI
  filePath = decodeURIComponent(filePath.split('?')[0]);

  // Resolve file path and prevent directory traversal
  const resolvedFilePath = path.resolve(__dirname, '.' + filePath);
  const distFilePath = path.resolve(__dirname, 'dist', path.basename(filePath));

  // Ensure resolved path is within the project directory
  if (!resolvedFilePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('403 - Forbidden');
    return;
  }

  // Check if file exists (fall back to dist/ for built assets)
  const resolvedPath = fs.existsSync(resolvedFilePath) ? resolvedFilePath : (fs.existsSync(distFilePath) ? distFilePath : resolvedFilePath);

  // nosemgrep: detect-non-literal-fs-filename — req.url is validated via path.resolve + startsWith check above
  fs.access(resolvedPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('❌ File not found:', filePath);
      res.writeHead(404);
      res.end('404 - File Not Found: ' + req.url);
      return;
    }

    // Get file extension and content type
    const extname = String(path.extname(resolvedPath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(resolvedPath, (error, content) => {
      if (error) {
        console.error('❌ Error reading file:', error);
        res.writeHead(500);
        res.end('Server Error: ' + error.code);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
});

// Start server
server.listen(PORT, () => {
  console.log('🚀 Amazon Connect Web Application Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📱 Customer Application: http://localhost:${PORT}/index.html`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📂 Loading configuration from .env file...');
  
  // Validate .env file exists
  if (!fs.existsSync('.env')) {
    console.warn('⚠️  WARNING: .env file not found!');
    console.warn('   Create a .env file with your configuration.');
    console.warn('   See DEPLOYMENT_GUIDE.md for details.');
  } else {
    console.log('✅ .env file found');
  }
  
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});
