import { WAMessage, proto } from '@whiskeysockets/baileys';
import { generateAIResponse } from './openai';
import pino from 'pino';
import { WhatsAppClient } from '../controllers/whatsapp';

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

// Command prefix
const COMMAND_PREFIX = '/';

// Available commands
const COMMANDS = {
  HELP: 'help',
  AI: 'ai',
  ECHO: 'echo',
  STATUS: 'status'
};

export async function processMessage(sock: any, message: WAMessage) {
  try {
    const jid = message.key.remoteJid!;
    const textContent = message.message?.conversation || 
                       message.message?.extendedTextMessage?.text || '';
    
    if (!textContent) {
      logger.info(`Received message without text content from ${jid}`);
      return;
    }
    
    // Get sender information for better logging
    const senderJid = message.key.participant || message.key.remoteJid;
    const senderName = senderJid ? senderJid.split('@')[0] : 'Unknown';
    
    logger.info(`Processing message from ${senderName} (${jid}): ${textContent}`);
    
    // Check if message is a command
    if (textContent.startsWith(COMMAND_PREFIX)) {
      logger.info(`Command detected: ${textContent}`);
      
      // Extract command and args for logging
      const commandWithArgs = textContent.slice(COMMAND_PREFIX.length).trim();
      const [command, ...args] = commandWithArgs.split(' ');
      
      console.log(`🤖 Executing command: ${command} with args: [${args.join(', ')}]`);
      logger.info(`Command: ${command}, Args: [${args.join(', ')}]`);
      
      await handleCommand(sock, message, textContent);
    } else {
      // Only log non-command messages, don't send a help message
      logger.info(`Received regular message (not a command): ${textContent}`);
    }
  } catch (error) {
    logger.error('Error processing message:', error);
  }
}

async function handleCommand(sock: any, message: WAMessage, text: string) {
  const jid = message.key.remoteJid!;
  const commandText = text.trim().toLowerCase();

  logger.info(`Processing command: ${commandText}`);

  if (commandText === '/help') {
    await sendHelpMessage(sock, jid);
  } else if (commandText.startsWith('/ai ')) {
    const prompt = text.substring(4).trim();
    await handleAICommand(sock, jid, prompt);
  } else if (commandText.startsWith('/echo ')) {
    const echoText = text.substring(6).trim();
    await handleEchoCommand(sock, jid, echoText);
  } else if (commandText === '/groups') {
    await handleGroupsCommand(sock, jid);
  } else if (commandText === '/status') {
    await handleStatusCommand(sock, jid);
  } else {
    // Unknown command
    await sock.sendMessage(jid, { text: 'Unknown command. Type /help for available commands.' });
  }
}

async function sendHelpMessage(sock: any, jid: string) {
  try {
    const helpMessage = `🤖 *LoveBot Commands* 🤖\n\n` +
      `*/help* - Show this help message\n` +
      `*/ai [prompt]* - Generate AI response\n` +
      `*/echo [text]* - Echo back your message\n` +
      `*/groups* - List all groups you're a member of\n` +
      `*/status* - Check bot status\n\n` +
      `Send any message without a command to chat normally.`;
    
    await sock.sendMessage(jid, { text: helpMessage });
    logger.info(`Sent help message to ${jid}`);
  } catch (error) {
    logger.error('Error sending help message:', error);
    console.log(`❌ Error sending help message to ${jid.split('@')[0]}`);
  }
}

async function handleAICommand(sock: any, jid: string, prompt: string) {
  if (!prompt) {
    await sock.sendMessage(jid, { text: `Please provide a prompt. Example: ${COMMAND_PREFIX}${COMMANDS.AI} Tell me a joke` });
    console.log(`⚠️ AI command received without prompt from ${jid.split('@')[0]}`);
    logger.info(`AI command received without prompt from ${jid}`);
    return;
  }
  
  try {
    await sock.sendMessage(jid, { text: 'Generating response...' });
    console.log(`🧠 Generating AI response for ${jid.split('@')[0]} with prompt: ${prompt}`);
    logger.info(`Generating AI response for ${jid} with prompt: ${prompt}`);
    
    const response = await generateAIResponse(prompt);
    await sock.sendMessage(jid, { text: response });
    console.log(`📤 AI response sent to ${jid.split('@')[0]}`);
    logger.info(`AI response sent to ${jid}`);
  } catch (error) {
    logger.error(`Error generating AI response for ${jid}:`, error);
    await sock.sendMessage(jid, { text: 'Sorry, I encountered an error while generating a response.' });
    console.log(`❌ Error generating AI response for ${jid.split('@')[0]}`);
  }
}

async function handleEchoCommand(sock: any, jid: string, text: string) {
  if (!text) {
    await sock.sendMessage(jid, { text: `Please provide text to echo. Example: ${COMMAND_PREFIX}${COMMANDS.ECHO} Hello world` });
    console.log(`⚠️ Echo command received without text from ${jid.split('@')[0]}`);
    logger.info(`Echo command received without text from ${jid}`);
    return;
  }
  
  try {
    await sock.sendMessage(jid, { text });
    console.log(`📤 Echo message sent to ${jid.split('@')[0]}: ${text}`);
    logger.info(`Echo message sent to ${jid}: ${text}`);
  } catch (error) {
    logger.error(`Error sending echo message to ${jid}:`, error);
    console.log(`❌ Error sending echo message to ${jid.split('@')[0]}`);
  }
}

async function handleStatusCommand(sock: any, jid: string) {
  try {
    const statusText = `
*LoveBot Status*
- Running: Yes
- Commands: Working
- OpenAI: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}
- Model: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}
`;
    
    await sock.sendMessage(jid, { text: statusText });
    console.log(`📤 Status message sent to ${jid.split('@')[0]}`);
    logger.info(`Status message sent to ${jid}`);
  } catch (error) {
    logger.error(`Error sending status message to ${jid}:`, error);
    console.log(`❌ Error sending status message to ${jid.split('@')[0]}`);
  }
}

/**
 * Handle the /groups command to fetch and display all joined groups
 */
async function handleGroupsCommand(sock: any, jid: string) {
  try {
    logger.info('Handling /groups command');
    
    // Get the WhatsApp client instance - we don't have getInstance, so we'll use the sock parameter
    // which is already the WhatsApp client instance
    
    // Fetch joined groups using the sock parameter
    const groups = await sock.fetchJoinedGroups();
    
    if (groups.length === 0) {
      await sock.sendMessage(jid, { text: '📋 You are not a member of any groups.' });
      return;
    }
    
    // Format the response
    let response = '📋 *Groups you are a member of:*\n\n';
    groups.forEach((group: {id: string, name: string}, index: number) => {
      response += `${index + 1}. *${group.name}*\n   ID: \`${group.id}\`\n\n`;
    });
    
    // Send the response
    await sock.sendMessage(jid, { text: response });
    logger.info(`Sent groups list (${groups.length} groups) to ${jid}`);
  } catch (error) {
    logger.error('Error handling /groups command:', error);
    await sock.sendMessage(jid, { text: '❌ Error fetching groups. Please try again later.' });
  }
} 