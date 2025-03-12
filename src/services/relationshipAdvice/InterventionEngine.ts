import { WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { MessageAnalyzer } from './MessageAnalyzer';
import { ContextManager } from './ContextManager';

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

// Define intervention types
export enum InterventionType {
  NONE = 'none',
  RESPOND_IN_CHAT = 'respond_in_chat',
  RESPOND_PRIVATELY = 'respond_privately',
  PROACTIVE_ADVICE = 'proactive_advice',
}

// Define intervention decision result
export interface InterventionDecision {
  shouldIntervene: boolean;
  type: InterventionType;
  recipients: string[];
  reason: string;
}

/**
 * Decides when and how to intervene in conversations
 */
export class InterventionEngine {
  private messageAnalyzer: MessageAnalyzer;
  private contextManager: ContextManager;
  private lastInterventionTimes: Map<string, number> = new Map();
  private readonly minInterventionInterval: number = 1800000; // 30 minutes in milliseconds
  private readonly proactiveThreshold: number = 3.0; // Score threshold for proactive intervention
  private disableInterventionInterval: boolean = false;

  constructor(messageAnalyzer: MessageAnalyzer, contextManager: ContextManager, disableInterventionInterval: boolean = false) {
    this.messageAnalyzer = messageAnalyzer;
    this.contextManager = contextManager;
    this.disableInterventionInterval = disableInterventionInterval;
  }

  /**
   * Decides whether and how to intervene based on a message
   * @param message The WhatsApp message
   * @param textContent The extracted text content
   * @returns The intervention decision
   */
  public decideIntervention(message: WAMessage, textContent: string): InterventionDecision {
    try {
      const jid = message.key.remoteJid;
      if (!jid) {
        return {
          shouldIntervene: false,
          type: InterventionType.NONE,
          recipients: [],
          reason: 'No JID available',
        };
      }

      // Check if we've intervened recently (skip if disableInterventionInterval is true)
      if (!this.disableInterventionInterval) {
        const lastIntervention = this.lastInterventionTimes.get(jid) || 0;
        const timeSinceLastIntervention = Date.now() - lastIntervention;
        
        // If we've intervened recently, don't intervene again unless it's a direct request
        if (timeSinceLastIntervention < this.minInterventionInterval) {
          // Analyze the message to see if it's a direct request
          const analysis = this.messageAnalyzer.analyzeMessage(message);
          
          if (!analysis.needsProcessing || analysis.reason !== 'Direct request to the bot') {
            return {
              shouldIntervene: false,
              type: InterventionType.NONE,
              recipients: [],
              reason: 'Intervened too recently',
            };
          }
          
          // If it's a direct request, we'll still intervene
          logger.info(`Intervening despite recent intervention because of direct request: ${textContent}`);
        }
      }

      // Analyze the message
      const analysis = this.messageAnalyzer.analyzeMessage(message);
      
      // If the message doesn't need processing, don't intervene
      if (!analysis.needsProcessing) {
        return {
          shouldIntervene: false,
          type: InterventionType.NONE,
          recipients: [],
          reason: analysis.reason,
        };
      }

      // Determine intervention type based on context and analysis
      const interventionType = this.determineInterventionType(jid, message, analysis.score);
      
      // Determine recipients
      const recipients = this.determineRecipients(jid, message);
      
      // Update last intervention time
      this.lastInterventionTimes.set(jid, Date.now());
      
      return {
        shouldIntervene: true,
        type: interventionType,
        recipients,
        reason: analysis.reason,
      };
    } catch (error) {
      logger.error('Error deciding intervention:', error);
      return {
        shouldIntervene: false,
        type: InterventionType.NONE,
        recipients: [],
        reason: 'Error during decision',
      };
    }
  }

  /**
   * Determines the type of intervention to make
   * @param jid The chat JID
   * @param message The WhatsApp message
   * @param score The relevance score
   * @returns The intervention type
   */
  private determineInterventionType(jid: string, message: WAMessage, score: number): InterventionType {
    // If it's a private chat, always respond in the chat
    if (!jid.endsWith('@g.us')) {
      return InterventionType.RESPOND_IN_CHAT;
    }
    
    // If the score is very high, consider proactive advice
    if (score >= this.proactiveThreshold) {
      return InterventionType.PROACTIVE_ADVICE;
    }
    
    // For group chats, determine based on message content and context
    const context = this.contextManager.getContext(jid);
    
    // If we don't have context yet, respond in chat
    if (!context || context.messages.length < 5) {
      return InterventionType.RESPOND_IN_CHAT;
    }
    
    // If the message directly mentions the bot, respond in chat
    const textContent = this.extractTextContent(message);
    if (textContent.toLowerCase().includes('lovebot') || textContent.toLowerCase().includes('love bot')) {
      return InterventionType.RESPOND_IN_CHAT;
    }
    
    // Default to responding in chat
    return InterventionType.RESPOND_IN_CHAT;
  }

  /**
   * Determines the recipients for the intervention
   * @param jid The chat JID
   * @param message The WhatsApp message
   * @returns The list of recipient JIDs
   */
  private determineRecipients(jid: string, message: WAMessage): string[] {
    // For private chats, just respond to the sender
    if (!jid.endsWith('@g.us')) {
      return [jid];
    }
    
    // For group chats, determine based on intervention type
    const interventionType = this.determineInterventionType(jid, message, 0);
    
    if (interventionType === InterventionType.RESPOND_IN_CHAT) {
      // Respond in the group chat
      return [jid];
    } else if (interventionType === InterventionType.RESPOND_PRIVATELY) {
      // Respond privately to the sender
      const sender = message.key.participant || message.key.remoteJid;
      if (sender) {
        return [sender];
      }
    } else if (interventionType === InterventionType.PROACTIVE_ADVICE) {
      // For proactive advice, we might want to message multiple participants
      const context = this.contextManager.getContext(jid);
      if (context && context.relationshipProfile) {
        // For now, just return all participants
        return context.relationshipProfile.participants;
      }
    }
    
    // Default to responding in the original chat
    return [jid];
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