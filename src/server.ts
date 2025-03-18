import express from 'express';
import path from 'path';
import { EventEmitter } from 'events';
import pino from 'pino';
import { WhatsAppClient } from './controllers/whatsapp';
import { setupRoutes } from './controllers/routes';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import fs from 'fs';
import multer from 'multer';

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

export class Server extends EventEmitter {
  private app: express.Express;
  private server: http.Server;
  private io: SocketServer;
  private port: number;
  private whatsappClient: WhatsAppClient;
  private lastQrUpdate: number = 0;

  constructor(whatsappClient: WhatsAppClient) {
    super();
    this.whatsappClient = whatsappClient;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketServer(this.server);
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.setupServer();
    this.setupSocketIO();
    this.setupWhatsAppEvents();
  }

  private setupServer() {
    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const downloadsDir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }
        cb(null, downloadsDir);
      },
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname;
        cb(null, `upload_${timestamp}_${originalName}`);
      }
    });
    
    const upload = multer({ 
      storage,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
      },
      fileFilter: (req, file, cb) => {
        // Accept only text files for chat exports
        if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      }
    });
    
    // Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Serve static files from public directory
    this.app.use(express.static(path.join(process.cwd(), 'public')));
    
    // Redirect root to QR page
    this.app.get('/', (req, res) => {
      res.redirect('/qr');
    });
    
    // QR code page
    this.app.get('/qr', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
    });
    
    // API endpoint to check if QR code has been updated
    this.app.get('/api/qr-updated', (req, res) => {
      res.json({ lastUpdate: this.lastQrUpdate });
    });
    
    // API endpoint for file uploads
    this.app.post('/api/upload-chat', upload.single('chatFile'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ 
            success: false, 
            message: 'No file uploaded or invalid file type. Please upload a text file (.txt).' 
          });
        }
        
        const filePath = req.file.path;
        const chatId = req.body.chatId || 'web-upload';
        
        // Create a mock message for processing
        const mockMessage = {
          key: {
            remoteJid: chatId,
            fromMe: false,
            id: `web-upload-${Date.now()}`
          },
          messageTimestamp: Date.now()
        };
        
        // Process the file
        const response = await this.whatsappClient.processUploadedChatFile(mockMessage, filePath);
        
        res.json({ 
          success: true, 
          message: 'File processed successfully',
          response
        });
      } catch (error) {
        logger.error('Error processing uploaded file:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Error processing file',
          error: (error as Error).message
        });
      }
    });
    
    // Copy QR code from root to public directory if it exists
    const rootQrPath = path.join(process.cwd(), 'qr.png');
    const publicQrPath = path.join(process.cwd(), 'public', 'qr.png');
    if (fs.existsSync(rootQrPath)) {
      fs.copyFileSync(rootQrPath, publicQrPath);
      this.lastQrUpdate = Date.now();
    }
    
    // Setup API routes
    setupRoutes(this.app, this.whatsappClient);
  }

  private setupSocketIO() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected to socket.io');
      
      // Send current QR update timestamp
      socket.emit('qr-updated', { timestamp: this.lastQrUpdate });
      
      socket.on('disconnect', () => {
        logger.info('Client disconnected from socket.io');
      });
    });
  }

  private setupWhatsAppEvents() {
    // Listen for QR code events
    this.whatsappClient.on('qr', (qr) => {
      logger.info('New QR code received, notifying clients');
      this.lastQrUpdate = Date.now();
      
      // Notify clients about the QR code update
      this.io.emit('qr-updated', { 
        timestamp: this.lastQrUpdate,
        message: 'QR code has been updated. Please refresh the page to see the new QR code.'
      });
      
      // Force clients to reload the QR code image by adding a timestamp parameter
      const qrImageUrl = `/qr.png?t=${this.lastQrUpdate}`;
      this.io.emit('qr-image-updated', { 
        url: qrImageUrl,
        timestamp: this.lastQrUpdate
      });
    });
    
    // Listen for connection events
    this.whatsappClient.on('ready', () => {
      logger.info('WhatsApp connected, notifying clients');
      this.io.emit('whatsapp-connected', { connected: true });
    });
  }

  public start() {
    this.server.listen(this.port, () => {
      logger.info(`Server started on http://localhost:${this.port}`);
      logger.info(`QR code available at http://localhost:${this.port}/qr`);
    });
  }
} 