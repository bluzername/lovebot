import { WAMessage, proto } from '@whiskeysockets/baileys';
import pino from 'pino';

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
 * Extract text content from a WhatsApp message
 * @param message The WhatsApp message
 * @returns The text content of the message, or null if no text content is found
 */
export function getTextContent(message: WAMessage): string | null {
  try {
    const content = message.message;
    if (!content) {
      logger.debug('Message has no content');
      return null;
    }
    
    // Log the message type for debugging
    const messageTypes = Object.keys(content);
    logger.debug(`Message types: ${messageTypes.join(', ')}`);
    
    // Extract text from various message types
    if (content.conversation) {
      logger.debug(`Found conversation: ${content.conversation}`);
      return content.conversation;
    }
    
    if (content.extendedTextMessage?.text) {
      logger.debug(`Found extendedTextMessage: ${content.extendedTextMessage.text}`);
      return content.extendedTextMessage.text;
    }
    
    if (content.buttonsResponseMessage?.selectedButtonId) {
      logger.debug(`Found buttonsResponseMessage: ${content.buttonsResponseMessage.selectedButtonId}`);
      return content.buttonsResponseMessage.selectedButtonId;
    }
    
    if (content.listResponseMessage?.title) {
      logger.debug(`Found listResponseMessage: ${content.listResponseMessage.title}`);
      return content.listResponseMessage.title;
    }
    
    if (content.templateButtonReplyMessage?.selectedId) {
      logger.debug(`Found templateButtonReplyMessage: ${content.templateButtonReplyMessage.selectedId}`);
      return content.templateButtonReplyMessage.selectedId;
    }
    
    // Additional message types
    if (content.imageMessage?.caption) {
      logger.debug(`Found imageMessage with caption: ${content.imageMessage.caption}`);
      return content.imageMessage.caption;
    }
    
    if (content.videoMessage?.caption) {
      logger.debug(`Found videoMessage with caption: ${content.videoMessage.caption}`);
      return content.videoMessage.caption;
    }
    
    logger.debug('No text content found in message');
    return null;
  } catch (error) {
    logger.error('Error extracting text content:', error);
    return null;
  }
}

/**
 * Check if a message mentions a specific user
 * @param message The WhatsApp message
 * @param userId The user ID to check for mentions
 * @returns True if the message mentions the user, false otherwise
 */
export function isMentioned(message: WAMessage, userId: string): boolean {
  const content = message.message;
  if (!content) return false;
  
  const extendedText = content.extendedTextMessage;
  if (!extendedText || !extendedText.contextInfo) return false;
  
  const mentionedJid = extendedText.contextInfo.mentionedJid;
  if (!mentionedJid) return false;
  
  return mentionedJid.includes(userId);
}

/**
 * Get the quoted message from a reply
 * @param message The WhatsApp message
 * @returns The quoted message, or null if no quoted message is found
 */
export function getQuotedMessage(message: WAMessage): proto.IMessage | null {
  const content = message.message;
  if (!content) return null;
  
  const extendedText = content.extendedTextMessage;
  if (!extendedText || !extendedText.contextInfo) return null;
  
  return extendedText.contextInfo.quotedMessage || null;
} 