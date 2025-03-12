import { WAMessage } from '@whiskeysockets/baileys';
import { RelationshipAdviceService } from './services/relationshipAdvice';
import dotenv from 'dotenv';
import pino from 'pino';

// Load environment variables
dotenv.config();

// Set log level to debug
process.env.LOG_LEVEL = 'debug';

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:standard',
    }
  }
});

/**
 * Test the relationship advice service directly
 */
async function testAdvice() {
  console.log('🧪 Testing Relationship Advice Service Directly');
  
  // Create a relationship advice service with intervention interval disabled for testing
  const service = new RelationshipAdviceService(true);
  
  // Create a mock message with a direct request to the bot
  const mockMessage: WAMessage = {
    key: {
      remoteJid: 'test-group@g.us',
      fromMe: false,
      id: `test-${Date.now()}`,
      participant: 'test-user@s.whatsapp.net',
    },
    messageTimestamp: Date.now(),
    pushName: 'Test User',
    message: {
      conversation: 'LoveBot, I feel like my partner doesn\'t understand me. We\'ve been arguing a lot lately.',
    },
  };
  
  // Process the message
  console.log('Processing message...');
  const result = await service.processMessage(mockMessage);
  
  // Log the result
  console.log('Result:', JSON.stringify(result, null, 2));
  
  if (result.shouldRespond) {
    console.log(`\n💬 Generated ${result.responses.length} responses:`);
    for (const response of result.responses) {
      console.log(`\nTo ${response.recipient}:`);
      console.log(response.text);
    }
  } else {
    console.log('\n🤐 No response generated');
  }
}

// Run the test
testAdvice().catch(error => {
  console.error('Error running test:', error);
}); 