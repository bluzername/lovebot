import { WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { ContextManager } from './ContextManager';
import { InterventionEngine, InterventionType } from './InterventionEngine';
import { MessageAnalyzer } from './MessageAnalyzer';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { ChatHistoryImporter } from '../chatHistoryImporter';

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
  private chatHistoryImporter: ChatHistoryImporter;
  private readonly model: string;
  private readonly maxTokens: number = 500;

  constructor(disableInterventionInterval: boolean = false) {
    this.messageAnalyzer = new MessageAnalyzer();
    this.contextManager = new ContextManager();
    this.interventionEngine = new InterventionEngine(this.messageAnalyzer, this.contextManager, disableInterventionInterval);
    this.chatHistoryImporter = new ChatHistoryImporter(this.contextManager);
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
    let prompt = 'You are LoveBot, a relationship advisor inspired by Esther Perel\'s approach. ';
    prompt += 'Like Esther, you are wise, direct, and insightful about the complexities of human relationships. ';
    prompt += 'You possess her ability to cut through surface issues to identify deeper relationship dynamics. ';
    
    if (interventionType === InterventionType.RESPOND_IN_CHAT) {
      prompt += 'You are responding in a group chat where everyone can see your message. ';
      prompt += 'Be thoughtful about what you say, as it will be visible to all participants. ';
    } else if (interventionType === InterventionType.RESPOND_PRIVATELY) {
      prompt += 'You are responding privately to someone who needs relationship advice. ';
      prompt += 'You can be more direct and personal in your advice. ';
    } else if (interventionType === InterventionType.PROACTIVE_ADVICE) {
      prompt += 'You are proactively offering relationship insights based on observed conversation patterns. ';
      prompt += 'Be gentle yet direct in your approach. ';
    }
    
    prompt += 'Your goal is to foster open and nonviolent communication between partners. ';
    prompt += 'Like Esther Perel, you understand that passion and security often pull in opposite directions, ';
    prompt += 'and that the erotic and domestic aspects of relationships create natural tensions. ';
    prompt += 'Help people understand that conflicts often arise from unspoken expectations and unresolved past experiences. ';
    prompt += 'Be direct but compassionate, and don\'t shy away from difficult truths. ';
    prompt += 'Encourage curiosity about one\'s partner rather than assumptions. ';
    prompt += 'Focus on the space between people - the relationship itself - rather than simply on individual behaviors. ';
    prompt += 'Keep your responses concise, thought-provoking, and practical. ';
    prompt += 'Use occasional powerful questions to prompt reflection. ';
    prompt += 'Do not disclose that you are an AI - simply respond as LoveBot, the relationship advisor. ';
    prompt += 'You are multilingual and can detect the language of the message. Always respond in the same language as the message you received. ';
    prompt += 'You support English, Spanish, Hebrew, Thai, and other languages. ';
    prompt += 'IMPORTANT: Do NOT quote the user\'s message in your response. They can see their own message, so quoting it is redundant and makes you seem like a bot. Just respond directly to their question or concern. ';
    
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
    // Get the chat ID
    const jid = message.key.remoteJid;
    if (!jid) {
      return `Please analyze this message and provide relationship advice: "${textContent}"`;
    }
    
    // Get the conversation context
    const conversationContext = this.contextManager.getContext(jid);
    
    // Build the prompt
    let prompt = '';
    
    // Add context information
    prompt += `CONVERSATION CONTEXT:\n${context}\n\n`;
    
    // Add information about imported chat history if available
    if (conversationContext?.importedChatHistory) {
      const importDate = conversationContext.lastImportTimestamp 
        ? new Date(conversationContext.lastImportTimestamp).toLocaleString() 
        : 'unknown date';
      
      prompt += `NOTE: The user has shared their chat history with me on ${importDate}. I have access to their previous conversations which gives me better context about their relationship dynamics.\n\n`;
    }
    
    // Add the current message
    prompt += `CURRENT MESSAGE: "${textContent}"\n\n`;
    
    // Add instructions based on intervention type
    switch (interventionType) {
      case InterventionType.DIRECT_REQUEST:
        prompt += 'The user has directly asked for relationship advice. Channel Esther Perel\'s direct, insightful style to address the underlying dynamics at play. Offer a perspective that might reframe their understanding of the situation.';
        break;
      case InterventionType.RELATIONSHIP_DISCUSSION:
        prompt += 'The user is discussing relationship issues. In Esther Perel\'s style, identify potential paradoxes or tensions in their situation. Be direct yet empathetic, and don\'t shy away from challenging assumptions if needed.';
        break;
      case InterventionType.EMOTIONAL_SUPPORT:
        prompt += 'The user appears to be experiencing emotional distress related to their relationship. Offer support while gently shifting perspective, as Esther Perel would, to help them see their situation in a new light. Balance empathy with insight.';
        break;
      default:
        prompt += 'Channeling Esther Perel\'s approach, provide a thoughtful perspective that balances directness with understanding. Consider the cultural and psychological dimensions at play, and be willing to challenge conventional wisdom if appropriate.';
    }
    
    // Add language detection instructions
    prompt += '\n\nIMPORTANT: Analyze the language of the message and respond in the SAME LANGUAGE. If the message is in English, respond in English. If in Spanish, respond in Spanish. If in Hebrew, respond in Hebrew. If in Thai, respond in Thai. For any other language, try to respond in that language if possible.';
    
    // Remind not to quote the user's message
    prompt += '\n\nREMEMBER: Do NOT quote the user\'s message in your response. Reply directly without repeating what they said. This makes the conversation feel more natural.';
    
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

  /**
   * Processes a file message that might contain chat history
   * @param message The WhatsApp message containing the file
   * @param filePath The path to the downloaded file
   * @returns A response message about the import status
   */
  public async processFileMessage(message: WAMessage, filePath: string): Promise<string> {
    try {
      const jid = message.key.remoteJid;
      if (!jid) {
        return "Error: Could not identify the chat.";
      }
      
      // Check if this is a WhatsApp export file
      const isWhatsAppExport = await this.chatHistoryImporter.isWhatsAppExport(filePath);
      if (!isWhatsAppExport) {
        return "The file you sent doesn't appear to be a WhatsApp chat export. Please export your chat history and send it as a text file.";
      }
      
      // Process the file
      const messageCount = await this.chatHistoryImporter.processExportFile(filePath, jid);
      
      // Get a summary of the imported chat history
      const summary = await this.chatHistoryImporter.getImportSummary(jid);
      
      return `✅ Successfully imported your chat history!\n\n${summary}\n\nI'll use this information to provide more personalized relationship advice. Your privacy is important - this data is only used to help you and is not shared with anyone else.`;
    } catch (error) {
      logger.error('Error processing file message:', error);
      return "Sorry, I encountered an error while processing your chat history file. Please make sure you're sending a valid WhatsApp chat export file.";
    }
  }
} 