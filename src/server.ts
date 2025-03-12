import express from 'express';
import path from 'path';
import { EventEmitter } from 'events';
import pino from 'pino';
import { WhatsAppClient } from './controllers/whatsapp';
import { setupRoutes } from './controllers/routes';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import fs from 'fs';

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
      this.io.emit('qr-updated', { timestamp: this.lastQrUpdate });
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