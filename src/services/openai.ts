import pino from 'pino';
import dotenv from 'dotenv';
import { LLMClient } from './llm/LLMClient';

// Load environment variables
dotenv.config();

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
 * Generate a plain chat response using the configured LLM provider
 * (see src/config.ts for provider and model resolution).
 * @param prompt The user's prompt
 * @returns The AI-generated response
 */
export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    const client = LLMClient.getInstance();
    const model = LLMClient.getModel();
    logger.info(`Using ${LLMClient.getProvider()} model: ${model}`);

    // Generate response
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant in a WhatsApp chat. Provide concise and accurate responses.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    // Extract and return response
    const response = completion.choices[0]?.message?.content?.trim() || 'No response generated';
    return response;
  } catch (error: any) {
    // Enhanced error logging
    logger.error('Error generating AI response:');
    
    if (error.response) {
      // OpenAI API error
      logger.error(`Status: ${error.response.status}`);
      logger.error(`Data: ${JSON.stringify(error.response.data)}`);
    } else if (error.message) {
      // General error with message
      logger.error(`Message: ${error.message}`);
    } else {
      // Unknown error
      logger.error(`Unknown error: ${error}`);
    }
    
    return 'Sorry, I encountered an error while generating a response. Please check your API key and try again.';
  }
}
