import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import pino from 'pino';
import { ContextManager } from './relationshipAdvice/ContextManager';

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
 * Interface for a parsed chat message
 */
interface ParsedChatMessage {
  timestamp: Date;
  sender: string;
  content: string;
  isMedia: boolean;
}

/**
 * Service to import and process WhatsApp chat history exports
 */
export class ChatHistoryImporter {
  private contextManager: ContextManager;
  
  constructor(contextManager: ContextManager) {
    this.contextManager = contextManager;
  }
  
  /**
   * Process a WhatsApp chat export file
   * @param filePath Path to the chat export file
   * @param chatId The chat ID to associate this history with
   * @returns Promise that resolves with the number of messages processed
   */
  public async processExportFile(filePath: string, chatId: string): Promise<number> {
    logger.info(`Processing chat export file for ${chatId}: ${filePath}`);
    
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Check file extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.txt') {
        throw new Error(`Unsupported file format: ${ext}. Only .txt files are supported.`);
      }
      
      // Parse the file
      const messages = await this.parseExportFile(filePath);
      logger.info(`Parsed ${messages.length} messages from export file`);
      
      // Add messages to context
      await this.addMessagesToContext(messages, chatId);
      
      return messages.length;
    } catch (error) {
      logger.error('Error processing chat export file:', error);
      throw error;
    }
  }
  
  /**
   * Parse a WhatsApp chat export file
   * @param filePath Path to the chat export file
   * @returns Promise that resolves with an array of parsed messages
   */
  private async parseExportFile(filePath: string): Promise<ParsedChatMessage[]> {
    const messages: ParsedChatMessage[] = [];
    
    // Create read stream and readline interface
    const fileStream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    // Regular expressions for parsing
    // Format: [MM/DD/YY, HH:MM:SS AM/PM] Sender: Message
    // or: [DD/MM/YY, HH:MM:SS AM/PM] Sender: Message
    // or: [DD/MM/YYYY, HH:MM:SS] Sender: Message
    const messageRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s*([^:]+):\s*(.+)$/i;
    const mediaRegex = /^<Media omitted>$|^<attached: .+>$|^<file attached>$/i;
    
    let currentMessage: ParsedChatMessage | null = null;
    
    // Process each line
    for await (const line of rl) {
      // Try to match the line with the message format
      const match = line.match(messageRegex);
      
      if (match) {
        // If we have a current message, add it to the list
        if (currentMessage) {
          messages.push(currentMessage);
        }
        
        // Parse the date and time
        const dateStr = match[1];
        const timeStr = match[2];
        
        // Try to parse the date
        let timestamp: Date;
        try {
          // Try different date formats
          const dateParts = dateStr.split('/');
          let day: number, month: number, year: number;
          
          if (dateParts.length === 3) {
            // Check if first part is month or day
            if (parseInt(dateParts[0]) > 12) {
              // DD/MM/YY or DD/MM/YYYY format
              day = parseInt(dateParts[0]);
              month = parseInt(dateParts[1]) - 1; // Months are 0-indexed in JS
              year = parseInt(dateParts[2]);
            } else {
              // MM/DD/YY or MM/DD/YYYY format
              month = parseInt(dateParts[0]) - 1;
              day = parseInt(dateParts[1]);
              year = parseInt(dateParts[2]);
            }
            
            // Adjust year if it's a 2-digit year
            if (year < 100) {
              year += 2000;
            }
            
            // Parse time
            let hours = 0, minutes = 0, seconds = 0;
            const timeParts = timeStr.trim().split(':');
            hours = parseInt(timeParts[0]);
            minutes = parseInt(timeParts[1]);
            
            if (timeParts.length > 2) {
              // Handle seconds if present
              seconds = parseInt(timeParts[2].replace(/[^\d]/g, ''));
            }
            
            // Handle AM/PM
            if (timeStr.toLowerCase().includes('pm') && hours < 12) {
              hours += 12;
            } else if (timeStr.toLowerCase().includes('am') && hours === 12) {
              hours = 0;
            }
            
            timestamp = new Date(year, month, day, hours, minutes, seconds);
          } else {
            // Fallback to current date if format is unrecognized
            timestamp = new Date();
          }
        } catch (error) {
          logger.warn(`Could not parse date: ${dateStr} ${timeStr}. Using current date.`);
          timestamp = new Date();
        }
        
        // Create a new message
        const sender = match[3].trim();
        const content = match[4].trim();
        const isMedia = mediaRegex.test(content);
        
        currentMessage = {
          timestamp,
          sender,
          content,
          isMedia
        };
      } else if (currentMessage) {
        // This line is a continuation of the previous message
        currentMessage.content += '\n' + line;
      }
    }
    
    // Add the last message if there is one
    if (currentMessage) {
      messages.push(currentMessage);
    }
    
    // Close the file stream
    fileStream.close();
    
    return messages;
  }
  
  /**
   * Add parsed messages to the context manager
   * @param messages Array of parsed messages
   * @param chatId The chat ID to associate these messages with
   */
  private async addMessagesToContext(messages: ParsedChatMessage[], chatId: string): Promise<void> {
    // Filter out media messages
    const textMessages = messages.filter(msg => !msg.isMedia);
    
    // Sort messages by timestamp
    textMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Create a conversation history string
    let conversationHistory = '';
    
    for (const msg of textMessages) {
      const formattedDate = msg.timestamp.toISOString().split('T')[0];
      const formattedTime = msg.timestamp.toTimeString().split(' ')[0];
      conversationHistory += `[${formattedDate} ${formattedTime}] ${msg.sender}: ${msg.content}\n`;
    }
    
    // Add to context
    await this.contextManager.updateContext(chatId, {
      importedChatHistory: conversationHistory,
      lastImportTimestamp: new Date().toISOString()
    });
    
    logger.info(`Added ${textMessages.length} messages to context for ${chatId}`);
  }
  
  /**
   * Check if a file is likely a WhatsApp chat export
   * @param filePath Path to the file
   * @returns Promise that resolves with a boolean indicating if the file is a chat export
   */
  public async isWhatsAppExport(filePath: string): Promise<boolean> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      // Check file extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.txt') {
        return false;
      }
      
      // Create read stream and readline interface
      const fileStream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      // Regular expression for WhatsApp export format
      const whatsAppFormatRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s*([^:]+):\s*(.+)$/i;
      
      // Check the first few lines
      let lineCount = 0;
      let matchCount = 0;
      
      for await (const line of rl) {
        lineCount++;
        
        if (whatsAppFormatRegex.test(line)) {
          matchCount++;
        }
        
        // Check only the first 10 lines
        if (lineCount >= 10) {
          break;
        }
      }
      
      // Close the file stream
      fileStream.close();
      
      // If at least 3 of the first 10 lines match the format, it's likely a WhatsApp export
      return matchCount >= 3;
    } catch (error) {
      logger.error('Error checking if file is a WhatsApp export:', error);
      return false;
    }
  }
  
  /**
   * Get a summary of the imported chat history
   * @param chatId The chat ID to get the summary for
   * @returns Promise that resolves with a summary of the imported chat history
   */
  public async getImportSummary(chatId: string): Promise<string> {
    try {
      const context = await this.contextManager.getContext(chatId);
      
      if (!context || !context.importedChatHistory) {
        return "No chat history has been imported for this conversation.";
      }
      
      // Count messages
      const lines = context.importedChatHistory.split('\n').filter(line => line.trim() !== '');
      
      // Get date range
      const firstLine = lines[0];
      const lastLine = lines[lines.length - 1];
      
      let firstDate = 'unknown date';
      let lastDate = 'unknown date';
      
      const dateRegex = /\[(\d{4}-\d{2}-\d{2})/;
      
      const firstMatch = firstLine.match(dateRegex);
      if (firstMatch) {
        firstDate = firstMatch[1];
      }
      
      const lastMatch = lastLine.match(dateRegex);
      if (lastMatch) {
        lastDate = lastMatch[1];
      }
      
      // Get unique participants
      const participantRegex = /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] ([^:]+):/;
      const participants = new Set<string>();
      
      for (const line of lines) {
        const match = line.match(participantRegex);
        if (match) {
          participants.add(match[1].trim());
        }
      }
      
      // Format the import date
      const importDate = context.lastImportTimestamp 
        ? new Date(context.lastImportTimestamp).toLocaleString() 
        : 'unknown time';
      
      return `Imported chat history summary:
- ${lines.length} messages
- Date range: ${firstDate} to ${lastDate}
- Participants: ${Array.from(participants).join(', ')}
- Last import: ${importDate}`;
    } catch (error) {
      logger.error('Error getting import summary:', error);
      return "Error retrieving chat history summary.";
    }
  }
} 