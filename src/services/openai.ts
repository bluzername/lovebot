import OpenAI from 'openai';
import pino from 'pino';
import dotenv from 'dotenv';

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

// Debug log environment variables
logger.info('Environment variables loaded:');
logger.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`);
logger.info(`OPENAI_MODEL: ${process.env.OPENAI_MODEL}`);
logger.info(`OPENAI_API_KEY length: ${process.env.OPENAI_API_KEY?.length || 0}`);
logger.info(`OPENAI_API_KEY prefix: ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`);

// Initialize OpenAI client
const openai = new OpenAI({
  // apiKey: process.env.OPENAI_API_KEY,
  apiKey: "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",
});

/**
 * Generate a response using OpenAI's API
 * @param prompt The user's prompt
 * @returns The AI-generated response
 */
export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured');
      return 'OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable.';
    }

    // Log the API key (first few characters only for security)
    const apiKey = process.env.OPENAI_API_KEY;
    logger.info(`Using OpenAI API key: ${apiKey.substring(0, 8)}...`);
    
    // Log the model being used
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    logger.info(`Using OpenAI model: ${model}`);

    // Generate response
    const completion = await openai.chat.completions.create({
      model: model,
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