#!/usr/bin/env node

/**
 * Extract Chat Widget IDs Script
 * 
 * This script extracts AMAZON_CONNECT_CHAT_SNIPPET_ID and AMAZON_CONNECT_CHAT_DOCUMENT_ID
 * from a complete Amazon Connect chat widget script and updates the .env file.
 * 
 * Usage: node scripts/extract-chat-widget-ids.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_FILE_PATH = path.join(__dirname, '../.env');

async function extractChatWidgetIds() {
  console.log('🔍 Extract Amazon Connect Chat Widget IDs');
  console.log('');
  console.log('Please paste your complete Amazon Connect chat widget script below.');
  console.log('Type \x1b[1mEND\x1b[0m on a new line when finished:');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let chatWidgetScript = '';
  
  // Read multi-line input until "END" is entered
  for await (const line of rl) {
    if (line.trim().toUpperCase() === 'END') {
      break;
    }
    chatWidgetScript += line + '\n';
  }

  rl.close();

  if (!chatWidgetScript.trim()) {
    console.error('❌ No chat widget script provided');
    process.exit(1);
  }

  try {
    // Extract Document ID from script tag id or amazon_connect function call
    const documentIdMatch = chatWidgetScript.match(/id=['"]([^'"]+)['"]/) || 
                           chatWidgetScript.match(/amazon_connect[^']*['"]([a-f0-9-]{36})['"]/) ||
                           chatWidgetScript.match(/['"]([a-f0-9-]{36})['"](?=\s*\))/);
    
    // Extract Snippet ID from snippetId call
    const snippetIdMatch = chatWidgetScript.match(/amazon_connect\s*\(\s*['"]snippetId['"],\s*['"]([^'"]+)['"]/);

    if (!documentIdMatch || !snippetIdMatch) {
      console.error('❌ Could not extract chat widget IDs from the provided script');
      console.error('');
      console.error('Expected format:');
      console.error('- Document ID: UUID format (e.g., 0f5d8da9-b858-4ebb-8685-06816f742605)');
      console.error('- Snippet ID: Base64 encoded string in snippetId call');
      process.exit(1);
    }

    const documentId = documentIdMatch[1];
    const snippetId = snippetIdMatch[1];

    console.log('✅ Extracted Chat Widget IDs:');
    console.log(`   Document ID: ${documentId}`);
    console.log(`   Snippet ID: ${snippetId.substring(0, 50)}...`);
    console.log('');

    // Update .env file
    if (!fs.existsSync(ENV_FILE_PATH)) {
      console.error('❌ .env file not found. Please run "cp .env.example .env" first.');
      process.exit(1);
    }

    let envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');

    // Update or add the chat widget configuration
    const envUpdates = {
      'AMAZON_CONNECT_CHAT_SNIPPET_ID': snippetId,
      'AMAZON_CONNECT_CHAT_DOCUMENT_ID': documentId
    };

    const envRegexMap = {
      'AMAZON_CONNECT_CHAT_SNIPPET_ID': /^AMAZON_CONNECT_CHAT_SNIPPET_ID=.*$/m,
      'AMAZON_CONNECT_CHAT_DOCUMENT_ID': /^AMAZON_CONNECT_CHAT_DOCUMENT_ID=.*$/m
    };

    Object.entries(envUpdates).forEach(([key, value]) => {
      const regex = envRegexMap[key];
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add to end of file if not found
        if (!envContent.endsWith('\n')) envContent += '\n';
        envContent += `${key}=${value}\n`;
      }
    });

    fs.writeFileSync(ENV_FILE_PATH, envContent, 'utf8');

    console.log('✅ Updated .env file with chat widget IDs');

  } catch (error) {
    console.error('❌ Error processing chat widget script:', error.message);
    process.exit(1);
  }
}

extractChatWidgetIds();