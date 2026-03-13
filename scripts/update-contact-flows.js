#!/usr/bin/env node
/**
 * Generate contact flow files with actual values from .env
 * This script reads template files from contact-flows/ and generates
 * deployment-ready files in contact-flows/generated/ with placeholders replaced
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

function generateContactFlows() {
  const region = process.env.AWS_REGION;
  const accountId = process.env.AWS_ACCOUNT_ID;
  const instanceId = process.env.AMAZON_CONNECT_INSTANCE_ID;
  const queueId = process.env.AMAZON_CONNECT_QUEUE_ID;

  if (!region || !accountId || !instanceId || !queueId) {
    console.error('❌ Missing required environment variables:');
    if (!region) console.error('   - AWS_REGION');
    if (!accountId) console.error('   - AWS_ACCOUNT_ID');
    if (!instanceId) console.error('   - AMAZON_CONNECT_INSTANCE_ID');
    if (!queueId) console.error('   - AMAZON_CONNECT_QUEUE_ID');
    process.exit(1);
  }

  // Build the queue ARN
  const queueArn = `arn:aws:connect:${region}:${accountId}:instance/${instanceId}/queue/${queueId}`;

  console.log('📝 Generating contact flows with queue ARN:');
  console.log(`   ${queueArn}`);
  console.log('');

  // Create generated directory if it doesn't exist
  const contactFlowsDir = path.join(__dirname, '..', 'contact-flows');
  const generatedDir = path.join(contactFlowsDir, 'generated');
  
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
    console.log('📁 Created contact-flows/generated/ directory');
  }

  // Process template files
  const files = fs.readdirSync(contactFlowsDir).filter(f => f.endsWith('.json'));

  let generatedCount = 0;

  files.forEach(file => {
    // Validate filename to prevent path traversal
    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      console.warn(`⚠️  Skipping suspicious filename: ${file}`);
      return;
    }

    const templatePath = path.join(contactFlowsDir, file);
    const generatedPath = path.join(generatedDir, file);
    
    let content = fs.readFileSync(templatePath, 'utf-8');

    // Check if file contains placeholder
    if (content.includes('{{QUEUE_ARN}}')) {
      // Replace placeholder with actual queue ARN
      content = content.replace(/\{\{QUEUE_ARN\}\}/g, queueArn);
      fs.writeFileSync(generatedPath, content);
      console.log(`✅ Generated ${file}`);
      generatedCount++;
    } else {
      // Copy file as-is if no placeholders
      fs.copyFileSync(templatePath, generatedPath);
      console.log(`📋 Copied ${file} (no placeholders)`);
      generatedCount++;
    }
  });

  console.log('');
  if (generatedCount > 0) {
    console.log(`✅ Generated ${generatedCount} contact flow(s) in contact-flows/generated/`);
    console.log('   These files are ready for CDK deployment');
  } else {
    console.log('ℹ️  No contact flows to generate');
  }
}

generateContactFlows();
