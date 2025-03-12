// Enable error logging from the start
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});

console.log('0. Starting setup...');

const { default: makeWASocket, DisconnectReason, makeInMemoryStore, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const { createInterface } = require('readline');
const fs = require('fs');
const { join } = require('path');
const pino = require('pino');

// Type definitions
interface ConnectionUpdate {
    connection?: string;
    lastDisconnect?: { error?: Error | typeof Boom };
    qr?: string;
}

interface MessagesUpsertUpdate {
    messages: any[];  // Using any for now to avoid type issues
    type: string;
}

// Configure logger with more verbose output and write to file
const logger = pino({
    level: 'trace',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            levelFirst: true,
            translateTime: 'HH:MM:ss Z',
        }
    }
}, pino.destination('./whatsapp-debug.log'));

console.log('1. Logger configured');
logger.info('Starting WhatsApp Test Application...');

// Create readline interface for interactive mode
console.log('2. Creating readline interface...');
const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

// Create store to maintain message history
console.log('3. Setting up message store...');
const store = makeInMemoryStore({ logger });
logger.info('Initializing message store...');

try {
    console.log('4. Attempting to read store file...');
    store.readFromFile('./baileys_store.json');
    logger.info('Successfully loaded message store');
} catch (error) {
    console.log('4a. Error reading store file:', error);
    logger.warn('Could not load message store:', error);
}

// Export the WhatsAppTest class
export class WhatsAppTest {
    private sock: any = null;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private localOnlyMode: boolean = false;

    constructor(localOnly: boolean = false) {
        this.localOnlyMode = localOnly;
        console.log(`WhatsAppTest initialized in ${this.localOnlyMode ? 'LOCAL ONLY' : 'ONLINE'} mode`);
    }

    async start() {
        console.log('6. Starting WhatsApp connection process...');
        
        // If in local-only mode, skip WhatsApp connection and go straight to interactive mode
        if (this.localOnlyMode) {
            return this.startLocalMode();
        }
        
        try {
            console.log('7. Creating auth state directory...');
            // Ensure auth directory exists
            if (!fs.existsSync('auth_info_testbot')) {
                fs.mkdirSync('auth_info_testbot');
            }

            console.log('8. Loading auth state...');
            const { state, saveCreds } = await useMultiFileAuthState('auth_info_testbot');
            console.log('9. Auth state loaded successfully');

            console.log('10. Creating WhatsApp socket...');
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger,
                browser: ['TestBot', 'Chrome', '1.0.0'],
                connectTimeoutMs: 60_000,
                version: [2, 2323, 4],
                markOnlineOnConnect: false,  // Don't mark as online immediately
                retryRequestDelayMs: 10000,   // Retry delay of 10 seconds
                defaultQueryTimeoutMs: 30000,
                emitOwnEvents: false,  // Don't process our own messages
                fireInitQueries: true,
                shouldSyncHistoryMessage: () => false,  // Don't sync history to reduce traffic
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                // Use a unique device ID to prevent conflicts
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

            if (!this.sock) {
                throw new Error('Failed to create WhatsApp socket');
            }

            // Set a timeout for the initial connection
            const connectionTimeout = setTimeout(() => {
                if (!this.isConnected) {
                    console.log('Connection timeout - please scan the QR code to connect');
                }
            }, 30000);

            console.log('11. Socket created successfully:', !!this.sock);

            console.log('12. Binding store to socket...');
            store.bind(this.sock.ev);

            console.log('13. Setting up connection event handler...');
            // Handle connection events
            this.sock.ev.on('connection.update', async (update: ConnectionUpdate) => {
                console.log('14. Connection update received:', update);
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('15. QR Code received! Please scan this QR code with your WhatsApp:');
                    logger.info('QR Code received, displaying in terminal...');
                    qrcode.generate(qr, { small: true });
                }

                if (connection === 'close') {
                    console.log('16. Connection closed');
                    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection status code:', statusCode);
                    console.log('Should reconnect:', shouldReconnect);
                    logger.info('Connection closed due to:', lastDisconnect?.error);
                    
                    // Check if it's a conflict error
                    const isConflict = (lastDisconnect?.error as Error)?.message?.includes('conflict');
                    
                    if (shouldReconnect) {
                        console.log('17. Attempting reconnection...');
                        
                        // Implement exponential backoff for reconnections
                        const reconnectDelay = isConflict ? 
                            Math.min(30000, 5000 * Math.pow(2, this.reconnectAttempts)) : // Longer delay for conflicts
                            Math.min(15000, 1000 * Math.pow(2, this.reconnectAttempts));  // Shorter delay for other errors
                        
                        this.reconnectAttempts++;
                        
                        console.log(`Reconnecting in ${reconnectDelay / 1000} seconds (attempt ${this.reconnectAttempts})...`);
                        
                        // If we've had too many conflict errors, clear auth state before reconnecting
                        if (isConflict && this.reconnectAttempts > 3) {
                            console.log('Too many conflict errors, clearing auth state before reconnecting...');
                            
                            // Clear auth state
                            if (fs.existsSync('auth_info_testbot')) {
                                fs.rmSync('auth_info_testbot', { recursive: true, force: true });
                                fs.mkdirSync('auth_info_testbot', { recursive: true });
                            }
                            
                            // Reset reconnect attempts
                            this.reconnectAttempts = 0;
                        }
                        
                        // Add a delay before reconnecting
                        setTimeout(() => {
                            this.start().catch(console.error);
                        }, reconnectDelay);
                    } else {
                        console.log('Not reconnecting - user logged out');
                        process.exit(0);
                    }
                } else if (connection === 'open') {
                    clearTimeout(connectionTimeout);
                    console.log('18. Connection opened successfully!');
                    logger.info('Connection opened successfully!');
                    
                    // Reset reconnect attempts on successful connection
                    this.reconnectAttempts = 0;
                    
                    this.isConnected = true;
                    this.startInteractiveMode();
                }
            });

            console.log('19. Setting up credentials update handler...');
            // Handle credentials updates
            this.sock.ev.on('creds.update', async () => {
                console.log('20. Credentials updated, saving...');
                await saveCreds();
            });

            console.log('21. Setting up message handler...');
            // Handle messages
            this.sock.ev.on('messages.upsert', async ({ messages, type }: MessagesUpsertUpdate) => {
                console.log('22. New message received');
                if (type === 'notify') {
                    for (const message of messages) {
                        try {
                            const from = message.key.remoteJid;
                            const isGroup = from?.endsWith('@g.us') || false;
                            const content = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
                            logger.info(`New message from ${isGroup ? 'group' : 'user'} ${from}:\n${content}`);
                        } catch (error: any) {
                            // Check if it's a decryption error
                            if (error.name === 'MessageCounterError' || 
                                (error.message && error.message.includes('decrypt'))) {
                                logger.warn('Decryption error for message. This is likely due to multiple instances or a sync issue.');
                                logger.warn('Consider using the clearauth command to reset the session if this persists.');
                            } else {
                                logger.error('Error processing message:', error);
                            }
                        }
                    }
                }
            });

            console.log('23. Initial setup complete, waiting for events...');

        } catch (error) {
            console.error('ERROR in start():', error);
            logger.error('Fatal error in start():', error);
            throw error;
        }
    }

    async startLocalMode() {
        console.log('Starting in LOCAL ONLY mode - no WhatsApp connection will be established');
        this.isConnected = false; // We're not actually connected to WhatsApp
        
        // Start interactive mode directly
        return this.startInteractiveMode();
    }

    private async startInteractiveMode() {
        console.log('Starting interactive mode...');
        logger.info('=== WhatsApp Test Tool ===');
        logger.info('1. Press Ctrl+C to exit');
        logger.info('2. Commands:');
        logger.info('   send <number/group> <message> - Send a message');
        logger.info('   status - Show connection status');
        logger.info('   checkstatus - Check if we\'re being rate limited or blocked');
        logger.info('   help - Show this help message');
        logger.info('   debug [on|off] - Enable/disable debug logging');
        logger.info('   clearauth - Clear auth state and reconnect');
        logger.info('   resetauth - Completely reset auth state and reconnect with a new session');
        logger.info('   resetcache - Reset message retry cache');
        logger.info('   testcommands <number> - Run a test suite of commands');
        logger.info('   bottest <number> - Test bot-to-bot communication');
        logger.info('   testlocal - Test command processing locally');

        const askCommand = () => {
            rl.question('Enter command (send, status, help, exit): ', async (input: string) => {
                const [command, ...args] = input.trim().split(' ');
                
                try {
                    switch (command.toLowerCase()) {
                        case 'send':
                            if (this.localOnlyMode) {
                                console.log('Cannot send messages in local-only mode');
                                break;
                            }
                            if (args.length < 2) {
                                logger.info('Usage: send <number/group> <message>');
                                break;
                            }
                            const [recipient, ...messageParts] = args;
                            const message = messageParts.join(' ');
                            console.log(`Sending message to ${recipient}: ${message}`);
                            await this.sendMessage(recipient, message);
                            break;

                        case 'status':
                            logger.info(`Connection status: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
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
                                
                                if (result.error) {
                                    console.log('Connection test failed:', result.error.message);
                                    console.log('This might indicate rate limiting or blocking by WhatsApp');
                                    
                                    if (result.error.message.includes('timeout')) {
                                        console.log('Timeout error detected. This often indicates rate limiting.');
                                        console.log('Recommendation: Wait for 30-60 minutes before trying again');
                                    } else if (result.error.message.includes('forbidden')) {
                                        console.log('Forbidden error detected. This might indicate your account is blocked.');
                                        console.log('Recommendation: Try using a different phone number');
                                    } else if (result.error.message.includes('conflict')) {
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
                            if (this.sock) {
                                this.sock.end(undefined);
                                this.sock = null;
                                this.isConnected = false;
                            }
                            
                            // Clear auth state
                            if (fs.existsSync('auth_info_testbot')) {
                                fs.rmSync('auth_info_testbot', { recursive: true, force: true });
                                fs.mkdirSync('auth_info_testbot', { recursive: true });
                            }
                            
                            // Reinitialize
                            setTimeout(() => this.start(), 1000);
                            break;

                        case 'resetauth':
                            console.log('Completely resetting auth state and reconnecting with a new session...');
                            if (this.sock) {
                                this.sock.end(undefined);
                                this.sock = null;
                                this.isConnected = false;
                            }
                            
                            // Clear auth state
                            if (fs.existsSync('auth_info_testbot')) {
                                fs.rmSync('auth_info_testbot', { recursive: true, force: true });
                                fs.mkdirSync('auth_info_testbot', { recursive: true });
                            }
                            
                            // Clear store
                            if (fs.existsSync('./baileys_store.json')) {
                                fs.unlinkSync('./baileys_store.json');
                            }
                            
                            // Reinitialize with a delay
                            console.log('Waiting 5 seconds before reconnecting...');
                            setTimeout(() => this.start(), 5000);
                            break;

                        case 'resetcache':
                            console.log('This command would reset the message cache if implemented');
                            break;

                        case 'testcommands':
                            if (args.length < 1) {
                                logger.info('Usage: testcommands <number>');
                                break;
                            }
                            const testNumber = args[0];
                            console.log(`Running command test suite to ${testNumber}...`);
                            
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
                                await this.sendMessage(testNumber, cmd);
                                // Add a small delay between messages
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                            
                            console.log('Test command suite completed');
                            break;

                        case 'bottest':
                            if (args.length < 1) {
                                logger.info('Usage: bottest <number>');
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
                            console.log('Testing local command processing...');
                            console.log('Command received: testlocal with args:', args);
                            console.log('This command is processed locally without WhatsApp connection');
                            break;

                        case 'help':
                            console.log('Available commands:');
                            console.log('  send [phone] [message] - Send a message to a phone number');
                            console.log('  status - Check connection status');
                            console.log('  testlocal - Test local command processing');
                            console.log('  help - Show this help message');
                            console.log('  exit - Exit the application');
                            if (this.localOnlyMode) {
                                console.log('\nNOTE: You are in LOCAL ONLY mode. WhatsApp commands will not work.');
                            }
                            break;

                        case 'exit':
                            console.log('Exiting the application...');
                            process.exit(0);
                            break;

                        default:
                            logger.info('Unknown command. Type help for available commands.');
                    }
                } catch (error) {
                    console.error('Error processing command:', error);
                }

                askCommand();
            });
        };

        askCommand();
    }

    private async sendMessage(recipient: string, message: string) {
        if (!this.sock || !this.isConnected) {
            logger.error('Not connected to WhatsApp');
            return;
        }

        try {
            // Format recipient
            const formattedRecipient = recipient.includes('@g.us') 
                ? recipient 
                : `${recipient.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

            // Send message
            const result = await this.sock.sendMessage(formattedRecipient, {
                text: message
            });

            logger.info(`Message sent successfully to ${recipient}`);
            logger.info('Message ID:', result?.key?.id);

        } catch (error) {
            logger.error('Failed to send message:', error);
        }
    }
}

// Start the WhatsApp test client
console.log('24. Creating WhatsApp test client instance...');
const client = new WhatsAppTest();

console.log('25. Starting client...');
client.start().catch((error: Error) => {
    console.error('26. Fatal error in application:', error);
    logger.error('Fatal error in application:', error);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    logger.info('Shutting down...');
    store.writeToFile('./baileys_store.json');
    process.exit(0);
}); 