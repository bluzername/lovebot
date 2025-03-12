// Import crypto polyfill first to ensure it's available
import crypto from 'crypto';
// Ensure crypto is available globally
(global as any).crypto = crypto;

import express from 'express';
import { join } from 'path';
import { config } from 'dotenv';
import { createServer } from 'http';
import { WhatsAppClient } from './controllers/whatsapp';
import { setupRoutes } from './controllers/routes';
import fs from 'fs';

// Load environment variables
config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Determine the correct path for static files
const publicPath = fs.existsSync(join(__dirname, 'public')) 
  ? join(__dirname, 'public')  // For production (compiled)
  : join(__dirname, '../src/public');  // For development

console.log(`Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Also serve files from the root public directory
const rootPublicPath = join(__dirname, '../public');
if (fs.existsSync(rootPublicPath)) {
  console.log(`Also serving static files from: ${rootPublicPath}`);
  app.use(express.static(rootPublicPath));
}

// Set view engine
app.set('view engine', 'html');
app.engine('html', (filePath, options, callback) => {
  fs.readFile(filePath, (err: NodeJS.ErrnoException | null, content: Buffer) => {
    if (err) return callback(err);
    return callback(null, content.toString());
  });
});

// Create HTTP server
const server = createServer(app);

// Initialize WhatsApp client
const whatsappClient = new WhatsAppClient();

// Setup routes
setupRoutes(app, whatsappClient);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`QR Code page: http://localhost:${PORT}/qr`);
});

// Initialize WhatsApp connection
whatsappClient.initialize();

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await whatsappClient.disconnect();
  process.exit(0);
}); 