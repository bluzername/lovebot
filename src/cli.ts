import { config } from 'dotenv';
import { WhatsAppClient } from './controllers/whatsapp';
import { WhatsAppTest } from './test_whatsapp';
import { Server } from './server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Import crypto polyfill first to ensure it's available
// Ensure crypto is available globally
// global.crypto = crypto as any; // This line causes issues

// Import the ChatHistoryImporter and ContextManager for test-chat-import
import { ChatHistoryImporter } from './services/chatHistoryImporter';
import { ContextManager } from './services/relationshipAdvice/ContextManager';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const localOnlyMode = args.includes('--local-only') || args.includes('-l');

console.log(`Starting in ${localOnlyMode ? 'LOCAL ONLY' : 'ONLINE'} mode`);

// Check for test-chat-import argument
const testChatImportIndex = args.indexOf('--test-chat-import');
if (testChatImportIndex !== -1 && testChatImportIndex + 1 < args.length) {
  const importFilePath = args[testChatImportIndex + 1];
  console.log(`Testing chat import with file: ${importFilePath}`);
  
  // Create a test function
  const testChatImport = async (filePath: string) => {
    try {
      console.log(`Attempting to import chat history from: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }
      
      // Initialize context manager
      const contextManager = new ContextManager();
      
      // Initialize chat history importer
      const importer = new ChatHistoryImporter(contextManager);
      
      // Check if file is a WhatsApp export
      const isWhatsAppExport = await importer.isWhatsAppExport(filePath);
      console.log(`Is WhatsApp export: ${isWhatsAppExport}`);
      
      if (!isWhatsAppExport) {
        console.warn('Warning: File does not appear to be a WhatsApp export');
      }
      
      // Process the file
      const testChatId = 'test-import-chat';
      const messageCount = await importer.processExportFile(filePath, testChatId);
      
      // Get summary
      const summary = await importer.getImportSummary(testChatId);
      
      console.log(`Successfully imported ${messageCount} messages`);
      console.log(summary);
      
      console.log('Chat import test completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error testing chat import:', error);
      process.exit(1);
    }
  };
  
  // Run the test
  testChatImport(importFilePath);
} else {
  // Initialize WhatsApp client
  let whatsappClient: WhatsAppClient;

  if (localOnlyMode) {
    // Start in local-only mode (no WhatsApp connection)
    console.log('Starting in local-only mode. No WhatsApp connection will be established.');
    console.log('Use the "testlocal" command to test command processing locally.');
    
    // Initialize WhatsApp client in local-only mode
    whatsappClient = new WhatsAppClient(true);
  } else {
    // Initialize WhatsApp client with normal connection
    whatsappClient = new WhatsAppClient(false);
    
    // Ensure public directory exists
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Start web server for QR code access
    const server = new Server(whatsappClient);
    server.start();
    
    // Copy existing QR code to public directory if it exists
    const rootQrPath = path.join(process.cwd(), 'qr.png');
    const publicQrPath = path.join(publicDir, 'qr.png');
    if (fs.existsSync(rootQrPath)) {
      fs.copyFileSync(rootQrPath, publicQrPath);
      console.log(`Copied existing QR code to ${publicQrPath}`);
    }
  }

  // Initialize WhatsApp connection
  whatsappClient.initialize().catch(error => {
    console.error('Fatal error in application:', error);
    process.exit(1);
  });

  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    if (!whatsappClient.localOnlyMode) {
      await whatsappClient.disconnect();
    }
    process.exit(0);
  });
} 