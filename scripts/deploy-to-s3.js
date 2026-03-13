#!/usr/bin/env node
/**
 * Deploy application files to S3 and invalidate CloudFront cache
 * This script reads bucket name and distribution ID from cdk-outputs.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function deployToS3() {
  console.log('📦 Deploying application to S3...');
  console.log('');

  // Check if cdk-outputs.json exists
  const outputsFile = path.join(__dirname, '..', 'cdk-outputs.json');
  if (!fs.existsSync(outputsFile)) {
    console.error('❌ cdk-outputs.json not found');
    console.error('   Run "npm run cdk:deploy" first to create infrastructure');
    process.exit(1);
  }

  // Read CDK outputs
  const outputs = JSON.parse(fs.readFileSync(outputsFile, 'utf-8'));

  // Find Storage and Distribution stack outputs
  const storageStackKey = Object.keys(outputs).find(key => key.includes('Storage'));
  const distributionStackKey = Object.keys(outputs).find(key => key.includes('Distribution'));

  if (!storageStackKey || !distributionStackKey) {
    console.error('❌ Storage or Distribution stack outputs not found');
    console.error('   Available stacks:', Object.keys(outputs).join(', '));
    process.exit(1);
  }

  const storageOutputs = outputs[storageStackKey];
  const distributionOutputs = outputs[distributionStackKey];

  // Extract bucket name and distribution ID
  const bucketName = storageOutputs.HostingBucketNameOutput;
  const distributionId = distributionOutputs.DistributionIdOutput;

  if (!bucketName || !distributionId) {
    console.error('❌ Missing required outputs:');
    if (!bucketName) console.error('   - HostingBucketNameOutput');
    if (!distributionId) console.error('   - DistributionIdOutput');
    process.exit(1);
  }

  console.log('📋 Deployment Configuration:');
  console.log(`   S3 Bucket: ${bucketName}`);
  console.log(`   CloudFront Distribution: ${distributionId}`);
  console.log('');

  try {
    // Step 1: Build the application with embedded config (production mode)
    console.log('🔨 Building application with embedded config...');
    execSync('npm run build:production', { stdio: 'inherit' });
    console.log('✅ Build complete (config embedded in index.html)');
    console.log('');

    // Step 2: Upload dist files to S3
    console.log('📤 Uploading dist/ to S3...');
    execSync(`aws s3 sync dist/ s3://${bucketName}/ --delete`, { stdio: 'inherit' });
    console.log('✅ Dist files uploaded');
    console.log('');

    // Step 3: Skip uploading config.json for security (config is embedded in index.html)
    console.log('🔒 Skipping config.json upload (config embedded in index.html for security)');
    console.log('');

    // Step 4: Upload index.html
    console.log('📤 Uploading index.html to S3...');
    execSync(`aws s3 cp index.html s3://${bucketName}/index.html`, { stdio: 'inherit' });
    console.log('✅ Index file uploaded');
    console.log('');

    // Step 5: Upload src/ui CSS files
    console.log('📤 Uploading src/ui/ CSS files to S3...');
    execSync(`aws s3 sync src/ui/ s3://${bucketName}/src/ui/ --exclude "*" --include "*.css"`, { stdio: 'inherit' });
    console.log('✅ CSS files uploaded');
    console.log('');

    // Step 6: Upload logo image
    console.log('📤 Uploading logo image to S3...');
    execSync(`aws s3 cp AmazonConnectLogo.png s3://${bucketName}/AmazonConnectLogo.png`, { stdio: 'inherit' });
    console.log('✅ Logo uploaded');
    console.log('');

    // Step 7: Invalidate CloudFront cache
    console.log('🔄 Invalidating CloudFront cache...');
    const invalidationResult = execSync(
      `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/*"`,
      { encoding: 'utf-8' }
    );
    const invalidation = JSON.parse(invalidationResult);
    console.log(`✅ Cache invalidation created: ${invalidation.Invalidation.Id}`);
    console.log('');

    // Success summary
    console.log('🎉 Deployment complete!');
    console.log('');
    console.log('📍 Your application is now available at:');
    const distributionDomain = distributionOutputs.DistributionDomainNameOutput;
    if (distributionDomain) {
      console.log(`   https://${distributionDomain}`);
    } else {
      console.log('   Check CloudFront console for distribution domain');
    }
    console.log('');
    console.log('⏱️  Note: CloudFront cache invalidation may take a few minutes to complete');

  } catch (error) {
    console.error('');
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deployToS3();
