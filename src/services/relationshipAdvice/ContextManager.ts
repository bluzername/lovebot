import { WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

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

// Define types for our context management
interface MessageEntry {
  jid: string;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
  isFromBot: boolean;
}

interface ConversationContext {
  messages: MessageEntry[];
  lastUpdated: number;
  summary?: string;
  relationshipProfile?: RelationshipProfile;
  importedChatHistory?: string;
  lastImportTimestamp?: string;
}

interface RelationshipProfile {
  participants: string[];
  participantNames: Record<string, string>;
  relationshipType?: string;
  knownIssues?: string[];
  communicationStyle?: string;
  lastUpdated: number;
}

/**
 * Manages conversation context for AI processing
 */
export class ContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private readonly maxImmediateMessages: number = 20;
  private readonly contextStoragePath: string;
  private readonly contextUpdateInterval: number = 3600000; // 1 hour in milliseconds
  private lastSaveTime: number = 0;
  private readonly saveInterval: number = 300000; // 5 minutes in milliseconds

  constructor() {
    // Create storage directory if it doesn't exist
    this.contextStoragePath = path.join(process.cwd(), 'data', 'contexts');
    if (!fs.existsSync(this.contextStoragePath)) {
      fs.mkdirSync(this.contextStoragePath, { recursive: true });
    }
    
    // Load existing contexts
    this.loadContexts();
    
    // Set up periodic saving
    setInterval(() => this.saveContexts(), this.saveInterval);
  }

  /**
   * Adds a message to the conversation context
   * @param message The WhatsApp message to add
   * @param textContent The extracted text content
   */
  public addMessageToContext(message: WAMessage, textContent: string): void {
    try {
      const jid = message.key.remoteJid;
      if (!jid) return;
      
      // Get or create context for this chat
      let context = this.contexts.get(jid);
      if (!context) {
        context = {
          messages: [],
          lastUpdated: Date.now(),
        };
        this.contexts.set(jid, context);
      }
      
      // Get sender information
      const sender = message.key.participant || message.key.remoteJid || 'unknown';
      const senderName = message.pushName || sender.split('@')[0];
      
      // Create message entry
      const entry: MessageEntry = {
        jid,
        sender,
        senderName,
        text: textContent,
        timestamp: typeof message.messageTimestamp === 'number' ? message.messageTimestamp : Date.now(),
        isFromBot: message.key.fromMe || false,
      };
      
      // Add to context
      context.messages.push(entry);
      
      // Trim if exceeds max size
      if (context.messages.length > this.maxImmediateMessages) {
        context.messages = context.messages.slice(-this.maxImmediateMessages);
      }
      
      // Update timestamp
      context.lastUpdated = Date.now();
      
      // Check if we need to save contexts
      if (Date.now() - this.lastSaveTime > this.saveInterval) {
        this.saveContexts();
      }
      
      // Check if we need to update the relationship profile
      if (this.shouldUpdateRelationshipProfile(context)) {
        this.updateRelationshipProfile(jid, context);
      }
    } catch (error) {
      logger.error('Error adding message to context:', error);
    }
  }

  /**
   * Gets the conversation context for a chat
   * @param jid The chat JID
   * @returns The conversation context
   */
  public getContext(jid: string): ConversationContext | undefined {
    return this.contexts.get(jid);
  }

  /**
   * Gets the formatted context for AI processing
   * @param jid The chat JID
   * @returns The formatted context as a string
   */
  public getFormattedContextForAI(jid: string): string {
    const context = this.contexts.get(jid);
    if (!context || context.messages.length === 0) {
      return 'No conversation history available.';
    }
    
    let formattedContext = '';
    
    // Add relationship profile if available
    if (context.relationshipProfile) {
      formattedContext += 'Relationship Profile:\n';
      formattedContext += `- Participants: ${context.relationshipProfile.participants.map(p => context.relationshipProfile?.participantNames[p] || p).join(', ')}\n`;
      
      if (context.relationshipProfile.relationshipType) {
        formattedContext += `- Relationship Type: ${context.relationshipProfile.relationshipType}\n`;
      }
      
      if (context.relationshipProfile.knownIssues && context.relationshipProfile.knownIssues.length > 0) {
        formattedContext += `- Known Issues: ${context.relationshipProfile.knownIssues.join(', ')}\n`;
      }
      
      if (context.relationshipProfile.communicationStyle) {
        formattedContext += `- Communication Style: ${context.relationshipProfile.communicationStyle}\n`;
      }
      
      formattedContext += '\n';
    }
    
    // Add imported chat history summary if available
    if (context.importedChatHistory) {
      const lines = context.importedChatHistory.split('\n').filter(line => line.trim() !== '');
      formattedContext += `Imported Chat History: ${lines.length} messages from previous conversations\n\n`;
      
      // Add a sample of the imported chat history (last 10 messages)
      if (lines.length > 0) {
        formattedContext += 'Sample of Imported Chat History:\n';
        const sampleSize = Math.min(10, lines.length);
        const sampleLines = lines.slice(-sampleSize);
        for (const line of sampleLines) {
          formattedContext += `${line}\n`;
        }
        formattedContext += '\n';
      }
    }
    
    // Add conversation summary if available
    if (context.summary) {
      formattedContext += `Previous Conversation Summary: ${context.summary}\n\n`;
    }
    
    // Add recent messages
    formattedContext += 'Recent Conversation:\n';
    for (const message of context.messages) {
      const name = message.isFromBot ? 'LoveBot' : message.senderName;
      formattedContext += `${name}: ${message.text}\n`;
    }
    
    return formattedContext;
  }

  /**
   * Adds a bot response to the context
   * @param jid The chat JID
   * @param text The bot's response text
   */
  public addBotResponseToContext(jid: string, text: string): void {
    try {
      const context = this.contexts.get(jid);
      if (!context) return;
      
      // Create message entry
      const entry: MessageEntry = {
        jid,
        sender: 'bot',
        senderName: 'LoveBot',
        text,
        timestamp: Date.now(),
        isFromBot: true,
      };
      
      // Add to context
      context.messages.push(entry);
      
      // Trim if exceeds max size
      if (context.messages.length > this.maxImmediateMessages) {
        context.messages = context.messages.slice(-this.maxImmediateMessages);
      }
      
      // Update timestamp
      context.lastUpdated = Date.now();
    } catch (error) {
      logger.error('Error adding bot response to context:', error);
    }
  }

  /**
   * Determines if the relationship profile should be updated
   * @param context The conversation context
   * @returns Whether the profile should be updated
   */
  private shouldUpdateRelationshipProfile(context: ConversationContext): boolean {
    // If we don't have a profile yet, create one
    if (!context.relationshipProfile) {
      return true;
    }
    
    // If it's been a while since the last update, update it
    if (Date.now() - context.relationshipProfile.lastUpdated > this.contextUpdateInterval) {
      return true;
    }
    
    return false;
  }

  /**
   * Updates the relationship profile for a chat
   * @param jid The chat JID
   * @param context The conversation context
   */
  private updateRelationshipProfile(jid: string, context: ConversationContext): void {
    try {
      // Get all unique participants
      const participants = new Set<string>();
      const participantNames: Record<string, string> = {};
      
      for (const message of context.messages) {
        if (!message.isFromBot) {
          participants.add(message.sender);
          participantNames[message.sender] = message.senderName;
        }
      }
      
      // Create or update profile
      if (!context.relationshipProfile) {
        context.relationshipProfile = {
          participants: Array.from(participants),
          participantNames,
          lastUpdated: Date.now(),
        };
      } else {
        // Update existing profile
        context.relationshipProfile.participants = Array.from(participants);
        context.relationshipProfile.participantNames = {
          ...context.relationshipProfile.participantNames,
          ...participantNames,
        };
        context.relationshipProfile.lastUpdated = Date.now();
      }
      
      // Determine relationship type based on JID and participant count
      if (jid.endsWith('@g.us')) {
        if (participants.size === 2) {
          context.relationshipProfile.relationshipType = 'Couple in group chat with bot';
        } else if (participants.size > 2) {
          context.relationshipProfile.relationshipType = 'Group chat with multiple participants';
        }
      } else {
        context.relationshipProfile.relationshipType = 'One-on-one advice chat';
      }
    } catch (error) {
      logger.error('Error updating relationship profile:', error);
    }
  }

  /**
   * Loads contexts from disk
   */
  private loadContexts(): void {
    try {
      const files = fs.readdirSync(this.contextStoragePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.contextStoragePath, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const context = JSON.parse(data) as ConversationContext;
          
          // Get JID from filename
          const jid = file.replace('.json', '');
          
          this.contexts.set(jid, context);
          logger.info(`Loaded context for ${jid}`);
        }
      }
      
      logger.info(`Loaded ${this.contexts.size} conversation contexts`);
    } catch (error) {
      logger.error('Error loading contexts:', error);
    }
  }

  /**
   * Saves contexts to disk
   */
  private saveContexts(): void {
    try {
      for (const [jid, context] of this.contexts.entries()) {
        // Only save if there are messages
        if (context.messages.length > 0) {
          const filePath = path.join(this.contextStoragePath, `${jid.replace(/[/\\?%*:|"<>]/g, '_')}.json`);
          fs.writeFileSync(filePath, JSON.stringify(context, null, 2));
        }
      }
      
      this.lastSaveTime = Date.now();
      logger.info(`Saved ${this.contexts.size} conversation contexts`);
    } catch (error) {
      logger.error('Error saving contexts:', error);
    }
  }

  /**
   * Updates the context with additional data
   * @param jid The chat JID
   * @param data The data to update
   */
  public async updateContext(jid: string, data: Partial<ConversationContext>): Promise<void> {
    try {
      // Get or create context for this chat
      let context = this.contexts.get(jid);
      if (!context) {
        context = {
          messages: [],
          lastUpdated: Date.now(),
        };
        this.contexts.set(jid, context);
      }
      
      // Update context with new data
      Object.assign(context, data);
      
      // Update timestamp
      context.lastUpdated = Date.now();
      
      // Save contexts
      this.saveContexts();
      
      logger.info(`Updated context for ${jid} with new data`);
    } catch (error) {
      logger.error('Error updating context:', error);
    }
  }
} 