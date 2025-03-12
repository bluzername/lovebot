import { config } from 'dotenv';
import { WhatsAppClient } from './controllers/whatsapp';
import { WhatsAppTest } from './test_whatsapp';
import { Server } from './server';
import fs from 'fs';
import path from 'path';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const localOnlyMode = args.includes('--local-only') || args.includes('-l');

console.log(`Starting in ${localOnlyMode ? 'LOCAL ONLY' : 'ONLINE'} mode`);

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