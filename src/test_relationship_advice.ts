import { WAMessage } from '@whiskeysockets/baileys';
import { MessageAnalyzer, ContextManager, InterventionEngine, RelationshipAdviceService } from './services/relationshipAdvice';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test the relationship advice service
 */
async function testRelationshipAdvice() {
  console.log('🧪 Testing Relationship Advice Service');
  
  // Create mock message
  const mockMessage: WAMessage = {
    key: {
      remoteJid: 'test-group@g.us',
      fromMe: false,
      id: 'test-message-id',
      participant: 'participant1@s.whatsapp.net',
    },
    messageTimestamp: Date.now(),
    pushName: 'Test User',
    message: {
      conversation: 'I feel like my partner doesn\'t understand me. We\'ve been arguing a lot lately.',
    },
  };
  
  // Test MessageAnalyzer
  console.log('\n📊 Testing MessageAnalyzer');
  const messageAnalyzer = new MessageAnalyzer();
  const analysis = messageAnalyzer.analyzeMessage(mockMessage);
  console.log('Analysis result:', analysis);
  
  // Test ContextManager
  console.log('\n📚 Testing ContextManager');
  const contextManager = new ContextManager();
  contextManager.addMessageToContext(mockMessage, mockMessage.message?.conversation || '');
  const context = contextManager.getContext('test-group@g.us');
  console.log('Context:', context);
  const formattedContext = contextManager.getFormattedContextForAI('test-group@g.us');
  console.log('Formatted context for AI:', formattedContext);
  
  // Test InterventionEngine
  console.log('\n🔍 Testing InterventionEngine');
  const interventionEngine = new InterventionEngine(messageAnalyzer, contextManager);
  const decision = interventionEngine.decideIntervention(mockMessage, mockMessage.message?.conversation || '');
  console.log('Intervention decision:', decision);
  
  // Test RelationshipAdviceService
  console.log('\n🤖 Testing RelationshipAdviceService');
  const relationshipAdviceService = new RelationshipAdviceService();
  const result = await relationshipAdviceService.processMessage(mockMessage);
  console.log('Service result:', result);
  
  if (result.shouldRespond) {
    console.log('\n💬 Generated responses:');
    for (const response of result.responses) {
      console.log(`To ${response.recipient}:`);
      console.log(response.text);
      console.log('---');
    }
  } else {
    console.log('\n🤐 No response generated');
  }
  
  console.log('\n✅ Test completed');
}

// Run the test
testRelationshipAdvice().catch(error => {
  console.error('Error running test:', error);
}); 