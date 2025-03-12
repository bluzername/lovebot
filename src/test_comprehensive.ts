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
 * Test the relationship advice service with multiple messages
 */
async function testComprehensive() {
  console.log('🧪 Comprehensive Test of Relationship Advice Service');
  
  // Create a relationship advice service with intervention interval disabled for testing
  const service = new RelationshipAdviceService(true);
  
  // Test messages
  const testMessages = [
    {
      description: 'Direct request using symbol',
      text: '& I feel like my partner doesn\'t understand me. We\'ve been arguing a lot lately.',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Direct request to the bot',
      text: 'LoveBot, I feel like my partner doesn\'t understand me. We\'ve been arguing a lot lately.',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Relationship issue without direct request',
      text: 'I feel like my partner doesn\'t understand me. We\'ve been arguing a lot lately.',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Private chat message (non-relationship)',
      text: 'What\'s the weather like today?',
      expectedResponse: true,
      isPrivateChat: true
    },
    {
      description: 'Emotional message',
      text: 'I\'m feeling really sad and lonely in my relationship.',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Question about relationship',
      text: 'How do I know if my relationship is healthy?',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Non-relationship message in group chat',
      text: 'What\'s the weather like today?',
      expectedResponse: false,
      isPrivateChat: false
    },
    {
      description: 'Spanish relationship message',
      text: 'Mi relación con mi pareja está pasando por un momento difícil.',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Hebrew relationship message',
      text: 'היחסים שלי עם בן הזוג שלי עוברים תקופה קשה.',
      expectedResponse: true,
      isPrivateChat: false
    },
    {
      description: 'Thai relationship message',
      text: 'ความสัมพันธ์ของฉันกับคู่รักของฉันกำลังผ่านช่วงเวลาที่ยากลำบาก',
      expectedResponse: true,
      isPrivateChat: false
    }
  ];
  
  // Process each message
  for (const testCase of testMessages) {
    console.log(`\n🔍 Testing: ${testCase.description}`);
    console.log(`Message: "${testCase.text}"`);
    console.log(`Chat type: ${testCase.isPrivateChat ? 'Private (1:1)' : 'Group'}`);
    
    // Create a mock message
    const mockMessage: WAMessage = {
      key: {
        remoteJid: testCase.isPrivateChat ? 'test-user@s.whatsapp.net' : 'test-group@g.us',
        fromMe: false,
        id: `test-${Date.now()}`,
        participant: 'test-user@s.whatsapp.net',
      },
      messageTimestamp: Date.now(),
      pushName: 'Test User',
      message: {
        conversation: testCase.text,
      },
    };
    
    // Process the message
    console.log('Processing message...');
    const result = await service.processMessage(mockMessage);
    
    // Check if the result matches the expected response
    const passed = result.shouldRespond === testCase.expectedResponse;
    console.log(`Result: shouldRespond = ${result.shouldRespond}`);
    console.log(`Expected: shouldRespond = ${testCase.expectedResponse}`);
    console.log(`Test ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (result.shouldRespond) {
      console.log(`Generated ${result.responses.length} responses:`);
      for (const response of result.responses) {
        console.log(`\nTo ${response.recipient}:`);
        console.log(response.text);
      }
    } else {
      console.log('No response generated');
    }
    
    // Add a separator
    console.log('\n' + '-'.repeat(80));
  }
  
  console.log('\n✅ Comprehensive test completed');
}

// Run the test
testComprehensive().catch(error => {
  console.error('Error running test:', error);
}); 