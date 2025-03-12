import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  Browsers,
  WAMessage,
  WAMessageContent,
  BinaryNode,
  WASocket
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { join } from 'path';
import fs from 'fs';
import NodeCache from 'node-cache';
import { processMessage } from '../services/messageHandler';
import { generateQR } from '../utils/qrcode';
import { EventEmitter } from 'events';
import { RelationshipAdviceService } from '../services/relationshipAdvice';

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

// Create message store
const store = makeInMemoryStore({ logger });
store.readFromFile('./baileys_store.json');
setInterval(() => {
  store.writeToFile('./baileys_store.json');
}, 10000);

// Create cache for messages
const msgRetryCache = new NodeCache();

// Type for WhatsApp response with error
interface WhatsAppResponse extends BinaryNode {
  error?: {
    message: string;
  };
}

export class WhatsAppClient extends EventEmitter {
  private sock: WASocket | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private authPath: string = './auth_info_lovebot';
  private reconnectAttempts: number = 0;
  public localOnlyMode: boolean = false;
  private qrRefreshTimer: NodeJS.Timeout | null = null;
  private relationshipAdviceService: RelationshipAdviceService | null = null;

  constructor(localOnly: boolean = false) {
    super();
    this.localOnlyMode = localOnly;
    
    // Initialize relationship advice service with intervention interval disabled for testing
    this.relationshipAdviceService = new RelationshipAdviceService(true);
    logger.info('Relationship advice service initialized');
    
    console.log(`WhatsAppClient initialized in ${this.localOnlyMode ? 'LOCAL ONLY' : 'ONLINE'} mode`);
    
    // Ensure auth directory exists if not in local-only mode
    if (!this.localOnlyMode && !fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
    
    this.setupCLI();
  }

  public async initialize() {
    // If in local-only mode, skip WhatsApp connection
    if (this.localOnlyMode) {
      return this.startLocalMode();
    }

    try {
      logger.info('Initializing WhatsApp client...');
      
      // Clear the message store to avoid skipping messages
      this.clearMessageStore();
      logger.info('Message store cleared');
      
      // Get latest version of Baileys
      const { version } = await fetchLatestBaileysVersion();
      logger.info(`Using Baileys version ${version.join('.')}`);
      
      // Get auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
      
      // Create socket with unique browser identifier
      const browserName = process.env.BOT_NAME || 'LoveBot';
      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        msgRetryCounterCache: msgRetryCache,
        generateHighQualityLinkPreview: true,
        browser: Browsers.macOS(`${browserName}-Desktop`),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 30000,
        emitOwnEvents: false,  // Don't process our own messages
        fireInitQueries: true,
        shouldSyncHistoryMessage: () => false,  // Don't sync history to reduce traffic
        transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
        patchMessageBeforeSending: (message: any) => {
          const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
          if (requiresPatch) {
            message = {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {},
                  },
                  ...message,
                },
              },
            };
          }
          return message;
        }
      });
      
      // Bind store to socket
      store.bind(this.sock.ev);
      
      // Set up event handlers
      this.setupEventHandlers(saveCreds);
      
      // Set up CLI for testing
      this.setupCLI();
      
      logger.info('WhatsApp client initialized');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client:', error);
      throw error;
    }
  }

  private setupEventHandlers(saveCreds: () => Promise<void>) {
    if (!this.sock) return;
    
    // Handle connection updates
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        // Got QR code, emit event
        this.qrCode = qr;
        
        // Generate and save QR code image
        try {
          await generateQR(qr);
          logger.info('QR code generated and saved successfully');
        } catch (error) {
          logger.error('Failed to generate QR code:', error);
        }
        
        // Emit QR event
        this.emit('qr', qr);
        
        // Set up a timer to refresh the QR code
        if (this.qrRefreshTimer) {
          clearInterval(this.qrRefreshTimer);
        }
        
        this.qrRefreshTimer = setInterval(async () => {
          if (this.qrCode) {
            try {
              // Regenerate QR code to keep it fresh
              await generateQR(this.qrCode);
              logger.info('QR code refreshed');
              this.emit('qr', this.qrCode);
            } catch (error) {
              logger.error('Failed to refresh QR code:', error);
            }
          }
        }, 20000); // Refresh every 20 seconds
      }
      
      if (connection === 'close') {
        // Connection closed, check if we should reconnect
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        logger.info(`Connection closed due to ${lastDisconnect?.error}`);
        logger.info(`Reconnecting: ${shouldReconnect}`);
        
        // Clear QR refresh timer
        if (this.qrRefreshTimer) {
          clearInterval(this.qrRefreshTimer);
          this.qrRefreshTimer = null;
        }
        
        if (shouldReconnect) {
          // Attempt to reconnect with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
          this.reconnectAttempts++;
          
          logger.info(`Reconnecting in ${delay / 1000} seconds (attempt ${this.reconnectAttempts})...`);
          setTimeout(() => this.initialize(), delay);
        } else {
          logger.info('Logged out, clearing auth state...');
          // Clear auth state
          if (fs.existsSync(this.authPath)) {
            fs.rmSync(this.authPath, { recursive: true, force: true });
            fs.mkdirSync(this.authPath, { recursive: true });
          }
          this.emit('logout');
        }
      } else if (connection === 'open') {
        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;
        
        this.isConnected = true;
        this.emit('ready');
        logger.info('Connection opened successfully!');
      }
    });
    
    // Handle credential updates
    this.sock.ev.on('creds.update', saveCreds);
    
    // Handle messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`\n📨 Received messages.upsert event of type: ${type}`);
      console.log(`📨 Number of messages: ${messages.length}`);
      
      if (type !== 'notify') {
        console.log(`📨 Ignoring non-notify message type: ${type}`);
        return;
      }
      
      for (const message of messages) {
        try {
          console.log(`\n📨 Processing message from: ${message.key.remoteJid}`);
          await this.handleIncomingMessage(message);
        } catch (error) {
          logger.error('Error handling message:', error);
        }
      }
    });
    
    // Add a handler for message history
    this.sock.ev.on('messaging-history.set', ({ messages, chats, contacts, isLatest }) => {
      console.log(`\n📚 Received messaging-history.set event`);
      console.log(`📚 Number of messages: ${messages.length}`);
      console.log(`📚 Number of chats: ${chats.length}`);
      console.log(`📚 Is latest: ${isLatest}`);
    });

    // Handle group participant updates (for welcome message)
    this.sock.ev.on('group-participants.update', async (update) => {
      try {
        const { id, participants, action } = update;
        logger.info(`Group participants update in ${id}: ${action} - ${participants.join(', ')}`);
        
        // Check if our bot was added to the group
        if (action === 'add' && this.sock) {
          const botNumber = this.sock.user?.id.split(':')[0] + '@s.whatsapp.net';
          
          if (participants.includes(botNumber)) {
            // Bot was added to a group, send welcome message
            await this.sendWelcomeMessage(id);
          }
        }
      } catch (error) {
        logger.error('Error handling group participants update:', error);
      }
    });

    // Handle new chats (for private chat welcome message)
    this.sock.ev.on('chats.upsert', async (chats) => {
      try {
        for (const chat of chats) {
          // If this is a new private chat (not a group)
          if (chat.id && !chat.id.endsWith('@g.us') && chat.id.endsWith('@s.whatsapp.net')) {
            // Check if this is a new chat (no previous messages)
            if (chat.unreadCount === 1 && chat.messages?.length === 1) {
              // Send welcome message to private chat
              await this.sendWelcomeMessage(chat.id);
            }
          }
        }
      } catch (error) {
        logger.error('Error handling new chat:', error);
      }
    });
  }

  private async handleIncomingMessage(message: WAMessage) {
    try {
      // Log the entire message for debugging
      console.log('\n📋 DEBUG: Received message object:', JSON.stringify(message, null, 2));
      
      // Skip messages from self or status broadcasts
      const jid = message.key.remoteJid;
      if (!jid || jid === 'status@broadcast') {
        console.log('📋 DEBUG: Skipping message from status broadcast or null JID');
        return;
      }
      
      // Skip messages without content
      const content = message.message;
      if (!content) {
        console.log(`📋 DEBUG: Skipping message without content from ${jid}`);
        return;
      }
      
      // Skip messages that are from self
      if (message.key.fromMe) {
        console.log(`📋 DEBUG: Skipping message from self to ${jid}`);
        return;
      }
      
      // Extract message text with more comprehensive content handling
      let textContent = '';
      
      if (message.message?.conversation) {
        textContent = message.message.conversation;
        console.log('📋 DEBUG: Found conversation message');
      } else if (message.message?.extendedTextMessage?.text) {
        textContent = message.message.extendedTextMessage.text;
        console.log('📋 DEBUG: Found extended text message');
      } else if (message.message?.imageMessage?.caption) {
        textContent = message.message.imageMessage.caption;
        console.log('📋 DEBUG: Found image message with caption');
      } else if (message.message?.videoMessage?.caption) {
        textContent = message.message.videoMessage.caption;
        console.log('📋 DEBUG: Found video message with caption');
      } else if (message.message?.documentMessage?.caption) {
        textContent = message.message.documentMessage.caption;
        console.log('📋 DEBUG: Found document message with caption');
      } else if (message.message?.buttonsResponseMessage?.selectedButtonId) {
        textContent = message.message.buttonsResponseMessage.selectedButtonId;
        console.log('📋 DEBUG: Found buttons response message');
      } else if (message.message?.listResponseMessage?.title) {
        textContent = message.message.listResponseMessage.title;
        console.log('📋 DEBUG: Found list response message');
      } else {
        console.log('📋 DEBUG: Unknown message type:', Object.keys(message.message || {}));
      }
      
      // Get sender information
      const senderJid = message.key.participant || message.key.remoteJid;
      const senderName = senderJid ? senderJid.split('@')[0] : 'Unknown';
      
      // Display message in CLI with more details
      console.log(`\n📩 Received message from ${senderName} (${senderJid}) in chat ${jid}:`);
      console.log(`📝 Content: "${textContent}"`);
      console.log(`🆔 Message ID: ${message.key.id}`);
      
      // Process message
      logger.info(`Processing incoming message from ${jid}: "${textContent}"`);
      try {
        if (this.sock) {
          // Check if message is a command
          if (textContent.startsWith('/')) {
            console.log(`🤖 Processing command: ${textContent}`);
            await processMessage(this.sock, message);
          } else {
            // Process with relationship advice service if available
            if (this.relationshipAdviceService && !this.localOnlyMode) {
              console.log(`💌 Processing message for relationship advice`);
              const result = await this.relationshipAdviceService.processMessage(message);
              
              if (result.shouldRespond) {
                console.log(`💬 Generating relationship advice responses for ${result.responses.length} recipients`);
                
                // Send responses
                for (const response of result.responses) {
                  await this.sendMessage(response.recipient, response.text);
                  console.log(`📤 Sent relationship advice to ${response.recipient}`);
                }
              } else {
                console.log(`🤐 No relationship advice needed for this message`);
              }
            } else {
              // Fall back to regular message processing
              await processMessage(this.sock, message);
            }
          }
        } else {
          logger.error('Cannot process message: WhatsApp client not initialized');
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'MessageCounterError' ||
              error.message.includes('rate limit') ||
              error.message.includes('throttled')) {
            logger.warn(`Rate limiting detected: ${error.message}`);
            console.log(`⚠️ Rate limiting detected: ${error.message}`);
          } else {
            logger.error(`Error processing message: ${error.message}`);
            console.log(`❌ Error processing message: ${error.message}`);
          }
        } else {
          logger.error('Unknown error processing message:', error);
          console.log('❌ Unknown error processing message');
        }
      }
    } catch (error) {
      logger.error('Error handling incoming message:', error);
      console.log('❌ Error handling incoming message');
    }
  }

  private formatRecipient(recipient: string): string {
    // If it's already a JID (contains @), return it as is
    if (recipient.includes('@')) {
      return recipient;
    }
    
    // Otherwise, format as a phone number JID
    const cleaned = recipient.replace(/\D/g, '');
    return `${cleaned}@s.whatsapp.net`;
  }

  private async testConnection(recipient: string): Promise<boolean> {
    if (!this.sock) {
      logger.error('Cannot test connection: WhatsApp client not initialized');
      return false;
    }

    try {
      const formattedRecipient = this.formatRecipient(recipient);
      const result = await this.sock.onWhatsApp(formattedRecipient);
      
      if (!result || !result[0]) {
        logger.info(`Number ${recipient} is not registered on WhatsApp`);
        return false;
      }

      try {
        await this.sock.sendPresenceUpdate('available', formattedRecipient);
        return true;
      } catch (error) {
        if (error instanceof Error) {
          const errorMessage = error.message;
          logger.warn(`Connection test failed: ${errorMessage}`);
          
          if (errorMessage.includes('timeout')) {
            logger.warn('Connection test timed out');
          } else if (errorMessage.includes('forbidden')) {
            logger.warn('Connection test failed: Access forbidden');
          } else if (errorMessage.includes('conflict')) {
            logger.warn('Connection test failed: Session conflict');
          }
        } else {
          logger.error('Error during presence update:', error);
        }
        return false;
      }
    } catch (error) {
      logger.error('Error testing connection:', error);
      return false;
    }
  }

  public async sendMessage(recipient: string, text: string): Promise<void> {
    if (this.localOnlyMode) {
      logger.info(`[LOCAL] Would send message to ${recipient}: ${text}`);
      return;
    }

    if (!this.sock) {
      throw new Error('Cannot send message: WhatsApp client not initialized');
    }

    const formattedRecipient = this.formatRecipient(recipient);
    
    try {
      logger.info(`Sending message to ${formattedRecipient}: ${text}`);
      
      // Skip connection test for groups (JIDs ending with @g.us)
      const isGroup = formattedRecipient.endsWith('@g.us');
      
      if (!isGroup) {
        // Only test connection for individual recipients, not for groups
        const isConnected = await this.testConnection(formattedRecipient);
        if (!isConnected) {
          throw new Error(`Cannot connect to ${formattedRecipient}`);
        }
      }
      
      await this.sock.sendMessage(formattedRecipient, { text });
      logger.info(`Message sent to ${formattedRecipient}`);
    } catch (error) {
      logger.error('Error sending message:', error);
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch all groups the bot is a member of
   * @returns Array of group information with JID and name
   */
  public async fetchJoinedGroups(): Promise<Array<{id: string, name: string}>> {
    if (this.localOnlyMode) {
      logger.info('[LOCAL] Would fetch joined groups');
      return [
        { id: 'mock-group-1@g.us', name: 'Mock Group 1' },
        { id: 'mock-group-2@g.us', name: 'Mock Group 2' }
      ];
    }

    if (!this.sock) {
      throw new Error('Cannot fetch groups: WhatsApp client not initialized');
    }

    try {
      logger.info('Fetching joined groups...');
      
      // Get all chats
      const chats = await this.sock.groupFetchAllParticipating();
      const groups: Array<{id: string, name: string}> = [];
      
      // Extract group information
      for (const [id, info] of Object.entries(chats)) {
        if (id.endsWith('@g.us')) {
          groups.push({
            id,
            name: info.subject || 'Unknown Group'
          });
        }
      }
      
      logger.info(`Found ${groups.length} joined groups`);
      return groups;
    } catch (error) {
      logger.error('Error fetching joined groups:', error);
      throw error;
    }
  }

  public getQRCode() {
    return this.qrCode;
  }

  public isReady() {
    return this.isConnected;
  }

  public async disconnect(): Promise<void> {
    if (this.sock) {
      await this.sock.end(undefined);
      this.sock = null;
    }
  }

  private setupCLI() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'LoveBot> '
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
      const [command, ...args] = line.trim().split(' ');
      
      switch (command.toLowerCase()) {
        case 'send':
          if (this.localOnlyMode) {
            console.log('Cannot send messages in local-only mode');
            break;
          }
          if (args.length < 2) {
            console.log('Usage: send <number> <message>');
            break;
          }
          const [to, ...messageParts] = args;
          const message = messageParts.join(' ');
          console.log(`Sending message to ${to}: ${message}`);
          await this.sendMessage(to, message);
          break;
          
        case 'status':
          console.log(`Connection status: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
          break;
          
        case 'checkstatus':
          console.log('Checking WhatsApp connection status...');
          
          if (!this.sock || !this.isConnected) {
            console.log('Status: Disconnected');
            console.log('Not connected to WhatsApp');
            break;
          }
          
          try {
            console.log('Status: Connected');
            console.log('Reconnect attempts:', this.reconnectAttempts);
            console.log('Testing connection by fetching server properties...');
            
            // Try to fetch server properties to check if we're blocked
            const result = await this.sock.query({
              tag: 'iq',
              attrs: {
                to: '@s.whatsapp.net',
                type: 'get',
                xmlns: 'w:p',
              },
              content: [{ tag: 'props', attrs: {} }]
            }).catch((err: any) => {
              return { error: err };
            });
            
            // Type guard to check if result is an error object
            if (result && typeof result === 'object' && 'error' in result) {
              const errorObj = result as { error: { message: string } };
              const errorMessage = errorObj.error?.message || 'Unknown error';
              
              console.log('Connection test failed:', errorMessage);
              console.log('This might indicate rate limiting or blocking by WhatsApp');
              
              if (errorMessage.includes('timeout')) {
                console.log('Timeout error detected. This often indicates rate limiting.');
                console.log('Recommendation: Wait for 30-60 minutes before trying again');
              } else if (errorMessage.includes('forbidden')) {
                console.log('Forbidden error detected. This might indicate your account is blocked.');
                console.log('Recommendation: Try using a different phone number');
              } else if (errorMessage.includes('conflict')) {
                console.log('Conflict error detected. This indicates multiple sessions are active.');
                console.log('Recommendation: Use the resetauth command to start a fresh session');
              }
            } else {
              console.log('Connection test successful!');
              console.log('Server properties:', result);
            }
          } catch (error) {
            console.error('Error checking status:', error);
          }
          break;
          
        case 'debug':
          if (args[0]?.toLowerCase() === 'on') {
            logger.level = 'debug';
            console.log('Debug logging enabled');
          } else if (args[0]?.toLowerCase() === 'off') {
            logger.level = 'info';
            console.log('Debug logging disabled');
          } else {
            console.log('Usage: debug [on|off]');
          }
          break;
          
        case 'clearauth':
          console.log('Clearing auth state and reconnecting...');
          await this.disconnect();
          
          // Clear auth state
          if (fs.existsSync(this.authPath)) {
            fs.rmSync(this.authPath, { recursive: true, force: true });
            fs.mkdirSync(this.authPath, { recursive: true });
          }
          
          // Reinitialize
          setTimeout(() => this.initialize(), 1000);
          break;
          
        case 'resetauth':
          console.log('Completely resetting auth state and reconnecting with a new session...');
          await this.disconnect();
          
          // Clear auth state
          if (fs.existsSync(this.authPath)) {
            fs.rmSync(this.authPath, { recursive: true, force: true });
            fs.mkdirSync(this.authPath, { recursive: true });
          }
          
          // Clear store
          if (fs.existsSync('./baileys_store.json')) {
            fs.unlinkSync('./baileys_store.json');
          }
          
          // Clear message cache
          msgRetryCache.flushAll();
          
          // Reinitialize with a delay
          console.log('Waiting 5 seconds before reconnecting...');
          setTimeout(() => this.initialize(), 5000);
          break;
          
        case 'resetcache':
          console.log('Resetting message cache...');
          msgRetryCache.flushAll();
          console.log('Message cache reset successfully');
          break;
          
        case 'testconnection':
          if (args.length < 1) {
            console.log('Usage: testconnection <number>');
            break;
          }
          const testNumber = args[0];
          console.log(`Testing connection to ${testNumber}...`);
          
          try {
            // Format recipient
            const formattedRecipient = testNumber.includes('@g.us') 
              ? testNumber 
              : `${testNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            
            if (!this.sock) {
              console.log('Cannot test connection: WhatsApp client not initialized');
              break;
            }
            
            // Send a test message
            const result = await this.sock.sendMessage(formattedRecipient, { 
              text: 'Test connection message from LoveBot' 
            });
            
            console.log('Test message sent successfully!');
            console.log('Message ID:', result?.key?.id);
          } catch (error) {
            console.error('Failed to send test message:', error);
          }
          break;
          
        case 'testcommands':
          if (args.length < 1) {
            console.log('Usage: testcommands <number>');
            break;
          }
          const testCommandNumber = args[0];
          console.log(`Running command test suite to ${testCommandNumber}...`);
          
          // Test a series of commands
          const commands = [
            '/help',
            '/echo Hello World',
            '/ai Tell me a joke',
            'This is not a command',
            '/ help',
            '/HELP',
            '/unknown'
          ];
          
          for (const cmd of commands) {
            console.log(`Testing: ${cmd}`);
            try {
              await this.sendMessage(testCommandNumber, cmd);
              // Add a small delay between messages
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
              console.error(`Error sending test command "${cmd}":`, error);
            }
          }
          
          console.log('Test command suite completed');
          break;
          
        case 'bottest':
          if (args.length < 1) {
            console.log('Usage: bottest <number>');
            break;
          }
          const botNumber = args[0];
          console.log(`Running bot-to-bot communication test with ${botNumber}...`);
          
          try {
            // Send a test message
            console.log('Sending test message...');
            await this.sendMessage(botNumber, 'Bot-to-bot test message');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Send a command
            console.log('Sending help command...');
            await this.sendMessage(botNumber, '/help');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Send an echo command
            console.log('Sending echo command...');
            await this.sendMessage(botNumber, '/echo Bot-to-bot echo test');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('Bot-to-bot test completed');
          } catch (error) {
            console.error('Error during bot-to-bot test:', error);
          }
          break;
          
        case 'testlocal':
          if (this.localOnlyMode) {
            console.log('Running local command test suite...');
            
            const testMessages = [
              '/help',
              '/echo Hello World',
              '/ai Tell me a joke about programming',
              'This is not a command',
              '/status',
              '/unknown'
            ];
            
            for (const msg of testMessages) {
              console.log('\n=== Testing message ===');
              console.log('Input:', msg);
              console.log('Processing...');
              
              try {
                if (msg.startsWith('/')) {
                  const [command, ...args] = msg.slice(1).split(' ');
                  switch (command.toLowerCase()) {
                    case 'help':
                      console.log('[Response] Available commands:');
                      console.log('  /help - Show this help message');
                      console.log('  /echo <text> - Echo back the text');
                      console.log('  /ai <prompt> - Generate AI response');
                      console.log('  /status - Show bot status');
                      break;
                      
                    case 'echo':
                      console.log('[Response]', args.join(' '));
                      break;
                      
                    case 'ai':
                      console.log('[Response] Generating AI response...');
                      try {
                        const { generateAIResponse } = require('../services/openai');
                        const response = await generateAIResponse(args.join(' '));
                        console.log('[Response]', response);
                      } catch (error) {
                        console.error('Error generating AI response:', error);
                        console.log('[Response] Sorry, I encountered an error while generating a response.');
                      }
                      break;
                      
                    case 'status':
                      console.log('[Response] Bot Status:');
                      console.log('- Running in: Local-only mode');
                      console.log('- Connection: Simulated');
                      console.log('- Commands processed: Working');
                      console.log(`- OpenAI: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
                      console.log(`- Model: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}`);
                      break;
                      
                    default:
                      console.log('[Response] Unknown command. Type /help for available commands.');
                  }
                } else {
                  console.log('[Info] Not a command, would be processed as regular message');
                }
              } catch (error) {
                console.error('Error processing message:', error);
              }
              
              // Add a small delay between messages
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log('\nLocal test suite completed successfully!');
          } else {
            console.log('testlocal command is only available in local-only mode');
          }
          break;
          
        case 'groups':
          console.log('Fetching joined groups...');
          this.fetchJoinedGroups().then(groups => {
            console.log('Joined groups:', groups);
          }).catch(error => {
            console.error('Error fetching joined groups:', error);
          });
          break;
          
        case 'help':
          this.handleHelpCommand();
          break;
          
        case 'testadvice':
          await this.handleTestAdviceCommand(line);
          break;
          
        default:
          console.log('Unknown command. Type help for available commands.');
      }
      
      rl.prompt();
    });
  }

  private async handleHelpCommand() {
    console.log('Available commands:');
    console.log('  send [phone] [message] - Send a message');
    console.log('  status - Check connection status');
    console.log('  testlocal - Test local command processing');
    console.log('  checkstatus - Check if we\'re being rate limited or blocked');
    console.log('  debug [on|off] - Enable/disable debug logging');
    console.log('  clearauth - Clear auth state and reconnect');
    console.log('  resetauth - Completely reset auth state and reconnect with a new session');
    console.log('  resetcache - Reset message cache');
    console.log('  testconnection <number> - Test connection to a number');
    console.log('  testcommands <number> - Run a test suite of commands');
    console.log('  testadvice [--private] [message] - Test relationship advice with a message');
    console.log('  bottest <number> - Test bot-to-bot communication');
    console.log('  help - Show this help message');
    console.log('\nRelationship Advice:');
    console.log('  To get relationship advice, you can:');
    console.log('  In private chats (1:1):');
    console.log('  - Simply send any message directly to the bot - all messages are processed');
    console.log('  In group chats:');
    console.log('  1. Start your message with "&" (e.g., "& I\'m having trouble with my partner")');
    console.log('  2. Mention "LoveBot" in your message');
    console.log('  3. Simply discuss relationship topics (the bot will respond if relevant)');
    console.log('  The bot supports multiple languages including English, Spanish, Hebrew, and Thai');
  }

  /**
   * Handle the testadvice command
   * @param command The command string
   */
  private async handleTestAdviceCommand(command: string) {
    // Parse the command
    const parts = command.split(' ');
    if (parts.length < 2) {
      console.log('Usage: testadvice [--private] [message]');
      console.log('Options:');
      console.log('  --private: Test as a private chat (1:1) message');
      console.log('You can start your message with "&" to test the direct request symbol in group chats');
      return;
    }
    
    // Check if the --private flag is present
    let isPrivateChat = false;
    let messageStart = 1;
    
    if (parts[1] === '--private') {
      isPrivateChat = true;
      messageStart = 2;
      
      if (parts.length < 3) {
        console.log('Please provide a message to test');
        return;
      }
    }
    
    const message = parts.slice(messageStart).join(' ');
    console.log(`Testing relationship advice with message: "${message}"`);
    console.log(`Chat type: ${isPrivateChat ? 'Private (1:1)' : 'Group'}`);
    
    // Create a mock message
    const mockMessage: WAMessage = {
      key: {
        remoteJid: isPrivateChat ? 'test-user@s.whatsapp.net' : 'test-group@g.us',
        fromMe: false,
        id: `test-${Date.now()}`,
        participant: 'test-user@s.whatsapp.net',
      },
      messageTimestamp: Date.now(),
      pushName: 'Test User',
      message: {
        conversation: message,
      },
    };
    
    // Process the message
    const result = await this.relationshipAdviceService!.processMessage(mockMessage);
    
    if (result.shouldRespond) {
      console.log(`\n💬 Generated ${result.responses.length} responses:`);
      for (const response of result.responses) {
        console.log(`\nTo ${response.recipient}:`);
        console.log(response.text);
      }
    } else {
      console.log('\n🤐 No response generated');
    }
  }

  public async startLocalMode() {
    console.log('Starting in LOCAL ONLY mode - no WhatsApp connection will be established');
    console.log('Use the "testlocal" command to test command processing locally');
    this.isConnected = false;
    return Promise.resolve();
  }

  /**
   * Clears the message store to avoid skipping messages
   */
  private clearMessageStore() {
    // Clear the in-memory store
    store.messages = {};
    
    // Delete the store file if it exists
    if (fs.existsSync('./baileys_store.json')) {
      try {
        fs.unlinkSync('./baileys_store.json');
        logger.info('Deleted baileys_store.json');
      } catch (error) {
        logger.warn('Failed to delete baileys_store.json:', error);
      }
    }
  }

  /**
   * Sends a welcome message when the bot is added to a new chat
   * @param chatId The chat ID to send the welcome message to
   */
  private async sendWelcomeMessage(chatId: string) {
    try {
      if (this.localOnlyMode) {
        logger.info(`[LOCAL] Would send welcome message to ${chatId}`);
        return;
      }

      // Determine if this is a group or private chat
      const isGroup = chatId.endsWith('@g.us');
      
      // Get chat metadata to determine preferred language
      let preferredLanguage = 'en'; // Default to English
      let chatName = '';
      
      if (isGroup && this.sock) {
        try {
          const metadata = await this.sock.groupMetadata(chatId);
          chatName = metadata.subject || '';
          preferredLanguage = this.detectLanguage(chatName, metadata.participants.map(p => p.notify || p.name || ''));
        } catch (error) {
          logger.warn(`Could not fetch group metadata for ${chatId}:`, error);
        }
      } else {
        // For private chats, try to get the user's name
        try {
          const [user] = chatId.split('@');
          preferredLanguage = this.detectLanguage('', [user]);
        } catch (error) {
          logger.warn(`Could not determine language for private chat ${chatId}:`, error);
        }
      }
      
      // Create welcome message based on preferred language
      const welcomeMessage = this.getWelcomeMessage(preferredLanguage, isGroup);
      
      // Send the welcome message
      await this.sendMessage(chatId, welcomeMessage);
      logger.info(`Sent welcome message to ${chatId} in ${preferredLanguage}`);
    } catch (error) {
      logger.error(`Error sending welcome message to ${chatId}:`, error);
    }
  }

  /**
   * Detects the preferred language based on chat name and participant names
   * @param chatName The name of the chat
   * @param participantNames Array of participant names
   * @returns The detected language code
   */
  private detectLanguage(chatName: string, participantNames: string[]): string {
    // Hebrew characters range
    const hebrewPattern = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
    
    // Thai characters range
    const thaiPattern = /[\u0E00-\u0E7F]/;
    
    // Spanish common names and words
    const spanishPattern = /(?:hola|buenos|dias|grupo|amigos|familia|jose|juan|maria|carlos|rodriguez|garcia|martinez|lopez|gonzalez|perez|sanchez|ramirez|torres|flores|rivera|gomez|diaz|reyes|morales|cruz|ortiz|gutierrez|chavez|ramos|gonzales|ruiz|alvarez|mendoza|vasquez|castillo|jimenez|moreno|romero|herrera|medina|aguilar|guzman|munoz|rojas|vargas|contreras)/i;

    // Check chat name first
    if (chatName) {
      if (hebrewPattern.test(chatName)) return 'he';
      if (thaiPattern.test(chatName)) return 'th';
      if (spanishPattern.test(chatName.toLowerCase())) return 'es';
    }
    
    // Check participant names
    for (const name of participantNames) {
      if (hebrewPattern.test(name)) return 'he';
      if (thaiPattern.test(name)) return 'th';
      if (spanishPattern.test(name.toLowerCase())) return 'es';
    }
    
    // Default to English
    return 'en';
  }

  /**
   * Gets the welcome message in the specified language
   * @param language The language code
   * @param isGroup Whether this is a group chat
   * @returns The welcome message
   */
  private getWelcomeMessage(language: string, isGroup: boolean): string {
    const groupContext = isGroup ? 
      {
        en: 'this group',
        es: 'este grupo',
        he: 'קבוצה זו',
        th: 'กลุ่มนี้'
      } : 
      {
        en: 'our conversation',
        es: 'nuestra conversación',
        he: 'השיחה שלנו',
        th: 'การสนทนาของเรา'
      };

    const messages = {
      en: `👋 Hello! I'm LoveBot, your relationship advice assistant.

I can help with relationship questions and advice. Here's how to use me:

In ${groupContext.en}:
- Start your message with "&" (e.g., "& I'm having trouble with my partner")
- Mention "LoveBot" in your message
- Simply discuss relationship topics (I'll respond if relevant)

I support multiple languages including English, Spanish, Hebrew, and Thai.

Thank you for adding me! I'm here to help with your relationship questions. 💕`,

      es: `👋 ¡Hola! Soy LoveBot, tu asistente de consejos para relaciones.

Puedo ayudarte con preguntas y consejos sobre relaciones. Así es como puedes usarme:

En ${groupContext.es}:
- Comienza tu mensaje con "&" (ej., "& Estoy teniendo problemas con mi pareja")
- Menciona "LoveBot" en tu mensaje
- Simplemente habla sobre temas de relaciones (responderé si es relevante)

Soporto múltiples idiomas incluyendo inglés, español, hebreo y tailandés.

¡Gracias por agregarme! Estoy aquí para ayudarte con tus preguntas sobre relaciones. 💕`,

      he: `👋 שלום! אני LoveBot, עוזר הייעוץ לזוגיות שלך.

אני יכול לעזור עם שאלות וייעוץ בנושא מערכות יחסים. הנה איך להשתמש בי:

ב${groupContext.he}:
- התחל את ההודעה שלך עם "&" (לדוגמה, "& יש לי קשיים עם בן/בת הזוג שלי")
- הזכר את "LoveBot" בהודעה שלך
- פשוט דבר על נושאי מערכות יחסים (אני אגיב אם זה רלוונטי)

אני תומך במספר שפות כולל אנגלית, ספרדית, עברית ותאילנדית.

תודה שהוספת אותי! אני כאן כדי לעזור עם שאלות על מערכות יחסים שלך. 💕`,

      th: `👋 สวัสดี! ฉันคือ LoveBot ผู้ช่วยให้คำปรึกษาด้านความสัมพันธ์ของคุณ

ฉันสามารถช่วยตอบคำถามและให้คำแนะนำเกี่ยวกับความสัมพันธ์ นี่คือวิธีใช้งานฉัน:

ใน${groupContext.th}:
- เริ่มข้อความของคุณด้วย "&" (เช่น "& ฉันกำลังมีปัญหากับคู่ของฉัน")
- กล่าวถึง "LoveBot" ในข้อความของคุณ
- พูดคุยเกี่ยวกับหัวข้อความสัมพันธ์ (ฉันจะตอบกลับหากเกี่ยวข้อง)

ฉันรองรับหลายภาษารวมถึงอังกฤษ สเปน ฮีบรู และไทย

ขอบคุณที่เพิ่มฉัน! ฉันพร้อมช่วยเหลือคุณเกี่ยวกับคำถามด้านความสัมพันธ์ 💕`
    };

    return messages[language as keyof typeof messages] || messages.en;
  }
} 