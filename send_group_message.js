// Script to send a message to a group using the WhatsApp client directly
require('ts-node/register');
const { WhatsAppClient } = require('./src/controllers/whatsapp');
const pino = require('pino');

// Create a logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime
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
    
    // Send a message to the group
    const groupId = '120363393761085034@g.us';
    const message = 'This is a test message to the group from LoveBot';
    
    console.log(`Sending message to group ${groupId}: ${message}`);
    await client.sendMessage(groupId, message);
    
    console.log('Message sent successfully!');
    
    // Disconnect and exit
    await client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 