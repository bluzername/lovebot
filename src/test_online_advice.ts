import { config } from 'dotenv';
import { WhatsAppClient } from './controllers/whatsapp';

// Load environment variables
config();

/**
 * Test the relationship advice service in online mode
 */
async function testOnlineAdvice() {
  console.log('🧪 Testing Relationship Advice Service in Online Mode');
  
  // Initialize WhatsApp client
  const client = new WhatsAppClient(false);
  
  // Initialize WhatsApp connection
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
  
  console.log('Client is ready!');
  console.log('You can now test the relationship advice service by sending messages to the bot.');
  console.log('Press Ctrl+C to exit.');
  
  // Keep the script running
  await new Promise(resolve => {
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await client.disconnect();
      resolve(null);
    });
  });
}

// Run the test
testOnlineAdvice().catch(error => {
  console.error('Error running test:', error);
  process.exit(1);
}); 