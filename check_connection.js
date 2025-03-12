// Script to check WhatsApp connection status and test receiving messages
require('ts-node/register');
const { WhatsAppClient } = require('./src/controllers/whatsapp');
const pino = require('pino');

// Create a logger
const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

async function main() {
  try {
    // Create a WhatsApp client
    const client = new WhatsAppClient(false); // Not in local-only mode
    
    console.log('Initializing WhatsApp client...');
    await client.initialize();
    
    // Wait for the client to be ready
    console.log('Waiting for client to be ready...');
    let attempts = 0;
    while (!client.isReady() && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      console.log(`Waiting... (${attempts}/30)`);
    }
    
    if (!client.isReady()) {
      console.error('Client failed to initialize within the timeout period.');
      await client.disconnect();
      process.exit(1);
    }
    
    console.log('Client is ready! Waiting for messages...');
    console.log('Please send a test message from +972506973545 now.');
    
    // Keep the script running to receive messages
    await new Promise(resolve => setTimeout(resolve, 300000)); // Wait for 5 minutes
    
    // Disconnect and exit
    await client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 