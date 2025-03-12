import { WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { ContextManager } from './ContextManager';
import { InterventionEngine, InterventionType } from './InterventionEngine';
import { MessageAnalyzer } from './MessageAnalyzer';
import OpenAI from 'openai';
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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Provides relationship advice using AI
 */
export class RelationshipAdviceService {
  private messageAnalyzer: MessageAnalyzer;
  private contextManager: ContextManager;
  private interventionEngine: InterventionEngine;
  private readonly model: string;
  private readonly maxTokens: number = 500;

  constructor(disableInterventionInterval: boolean = false) {
    this.messageAnalyzer = new MessageAnalyzer();
    this.contextManager = new ContextManager();
    this.interventionEngine = new InterventionEngine(this.messageAnalyzer, this.contextManager, disableInterventionInterval);
    this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    
    logger.info(`Initialized RelationshipAdviceService with model: ${this.model}`);
  }

  /**
   * Processes a message and generates advice if needed
   * @param message The WhatsApp message to process
   * @returns An object with the intervention decision and response
   */
  public async processMessage(message: WAMessage): Promise<{
    shouldRespond: boolean;
    responses: Array<{ recipient: string; text: string }>;
  }> {
    try {
      // Extract text content
      const textContent = this.extractTextContent(message);
      if (!textContent) {
        return { shouldRespond: false, responses: [] };
      }
      
      // Add message to context
      this.contextManager.addMessageToContext(message, textContent);
      
      // Decide whether to intervene
      const decision = this.interventionEngine.decideIntervention(message, textContent);
      
      // If we shouldn't intervene, return early
      if (!decision.shouldIntervene) {
        logger.info(`Not intervening: ${decision.reason}`);
        return { shouldRespond: false, responses: [] };
      }
      
      // Generate responses for each recipient
      const responses: Array<{ recipient: string; text: string }> = [];
      
      for (const recipient of decision.recipients) {
        // Generate response
        const response = await this.generateAdvice(message, textContent, recipient, decision.type);
        
        // Add to responses
        responses.push({
          recipient,
          text: response,
        });
        
        // Add bot response to context
        this.contextManager.addBotResponseToContext(recipient, response);
      }
      
      return {
        shouldRespond: true,
        responses,
      };
    } catch (error) {
      logger.error('Error processing message for advice:', error);
      return { shouldRespond: false, responses: [] };
    }
  }

  /**
   * Generates advice using OpenAI
   * @param message The WhatsApp message
   * @param textContent The extracted text content
   * @param recipient The recipient JID
   * @param interventionType The type of intervention
   * @returns The generated advice
   */
  private async generateAdvice(
    message: WAMessage,
    textContent: string,
    recipient: string,
    interventionType: InterventionType
  ): Promise<string> {
    try {
      // Get context for the chat
      const context = this.contextManager.getFormattedContextForAI(recipient);
      
      // Create system prompt based on intervention type
      const systemPrompt = this.createSystemPrompt(interventionType);
      
      // Create user prompt
      const userPrompt = this.createUserPrompt(message, textContent, context, interventionType);
      
      // Log the prompts for debugging
      logger.debug(`System prompt: ${systemPrompt}`);
      logger.debug(`User prompt: ${userPrompt}`);
      
      // Generate response
      const completion = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
      });
      
      // Extract and return response
      const response = completion.choices[0]?.message?.content?.trim() || 'I\'m sorry, I couldn\'t generate advice at this time.';
      
      return response;
    } catch (error: any) {
      logger.error('Error generating advice:', error);
      
      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Data: ${JSON.stringify(error.response.data)}`);
      } else if (error.message) {
        logger.error(`Message: ${error.message}`);
      }
      
      return 'I\'m sorry, I encountered an error while generating advice. Please try again later.';
    }
  }

  /**
   * Creates the system prompt for the AI
   * @param interventionType The type of intervention
   * @returns The system prompt
   */
  private createSystemPrompt(interventionType: InterventionType): string {
    let prompt = 'You are LoveBot, a compassionate and insightful relationship advisor on WhatsApp. ';
    
    if (interventionType === InterventionType.RESPOND_IN_CHAT) {
      prompt += 'You are responding in a group chat where everyone can see your message. ';
      prompt += 'Be thoughtful about what you say, as it will be visible to all participants. ';
    } else if (interventionType === InterventionType.RESPOND_PRIVATELY) {
      prompt += 'You are responding privately to someone who needs relationship advice. ';
      prompt += 'You can be more direct and personal in your advice. ';
    } else if (interventionType === InterventionType.PROACTIVE_ADVICE) {
      prompt += 'You are proactively offering relationship advice based on observed conversation patterns. ';
      prompt += 'Be gentle and non-judgmental in your approach. ';
    }
    
    prompt += 'Your goal is to provide helpful, empathetic, and constructive relationship advice. ';
    prompt += 'Focus on improving communication, understanding, and emotional connection. ';
    prompt += 'Avoid being judgmental or taking sides. Instead, help people understand each other\'s perspectives. ';
    prompt += 'Keep your responses concise and practical. ';
    prompt += 'Do not disclose that you are an AI - simply respond as LoveBot, the relationship advisor. ';
    prompt += 'You are multilingual and can detect the language of the message. Always respond in the same language as the message you received. ';
    prompt += 'You support English, Spanish, Hebrew, Thai, and other languages. ';
    
    return prompt;
  }

  /**
   * Creates the user prompt for the AI
   * @param message The WhatsApp message
   * @param textContent The extracted text content
   * @param context The conversation context
   * @param interventionType The type of intervention
   * @returns The user prompt
   */
  private createUserPrompt(
    message: WAMessage,
    textContent: string,
    context: string,
    interventionType: InterventionType
  ): string {
    let prompt = '';
    
    // Add context
    prompt += 'CONVERSATION CONTEXT:\n';
    prompt += context;
    prompt += '\n\n';
    
    // Add current message
    prompt += 'CURRENT MESSAGE:\n';
    const sender = message.pushName || (message.key.participant || message.key.remoteJid || 'Unknown').split('@')[0];
    prompt += `${sender}: ${textContent}\n\n`;
    
    // Add instructions based on intervention type
    prompt += 'INSTRUCTIONS:\n';
    
    if (interventionType === InterventionType.RESPOND_IN_CHAT) {
      prompt += 'Please respond to this message in the group chat. ';
      prompt += 'Everyone will see your response, so be mindful of privacy and feelings. ';
    } else if (interventionType === InterventionType.RESPOND_PRIVATELY) {
      prompt += 'Please respond privately to this person with relationship advice. ';
      prompt += 'You can be more direct and personal in your advice. ';
    } else if (interventionType === InterventionType.PROACTIVE_ADVICE) {
      prompt += 'Please provide proactive relationship advice based on the conversation patterns you observe. ';
      prompt += 'Be gentle and non-judgmental in your approach. ';
    }
    
    prompt += 'Keep your response concise and practical. ';
    prompt += 'Focus on improving communication, understanding, and emotional connection. ';
    prompt += 'Avoid being judgmental or taking sides. ';
    prompt += 'Do not disclose that you are an AI - simply respond as LoveBot, the relationship advisor. ';
    prompt += 'Detect the language of the message and respond in the same language. ';
    
    // Add language detection hint
    prompt += '\nLANGUAGE DETECTION:\n';
    prompt += 'Analyze the language of the message and respond in the same language. ';
    prompt += 'If the message is in English, respond in English. ';
    prompt += 'If the message is in Spanish, respond in Spanish. ';
    prompt += 'If the message is in Hebrew, respond in Hebrew. ';
    prompt += 'If the message is in Thai, respond in Thai. ';
    prompt += 'For any other language, respond in that language if you can, or in English if you cannot.';
    
    return prompt;
  }

  /**
   * Extracts text content from a WhatsApp message
   * @param message The WhatsApp message
   * @returns The extracted text content
   */
  private extractTextContent(message: WAMessage): string {
    let textContent = '';
    
    if (message.message?.conversation) {
      textContent = message.message.conversation;
    } else if (message.message?.extendedTextMessage?.text) {
      textContent = message.message.extendedTextMessage.text;
    } else if (message.message?.imageMessage?.caption) {
      textContent = message.message.imageMessage.caption;
    } else if (message.message?.videoMessage?.caption) {
      textContent = message.message.videoMessage.caption;
    } else if (message.message?.documentMessage?.caption) {
      textContent = message.message.documentMessage.caption;
    } else if (message.message?.buttonsResponseMessage?.selectedButtonId) {
      textContent = message.message.buttonsResponseMessage.selectedButtonId;
    } else if (message.message?.listResponseMessage?.title) {
      textContent = message.message.listResponseMessage.title;
    }
    
    return textContent;
  }
} 