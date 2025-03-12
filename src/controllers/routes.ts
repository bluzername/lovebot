import { Express, Request, Response } from 'express';
import { join } from 'path';
import { WhatsAppClient } from './whatsapp';
import fs from 'fs';

export function setupRoutes(app: Express, whatsappClient: WhatsAppClient) {
  // Home route
  app.get('/', (req: Request, res: Response) => {
    res.sendFile(join(__dirname, '../../src/public/index.html'));
  });

  // QR code page
  app.get('/qr', (req: Request, res: Response) => {
    res.sendFile(join(__dirname, '../../src/public/qr.html'));
  });

  // API route to get QR code
  app.get('/api/qr', (req: Request, res: Response) => {
    const qrCode = whatsappClient.getQRCode();
    if (qrCode) {
      res.json({ success: true, qrCode });
    } else {
      res.json({ success: false, message: 'QR code not available yet' });
    }
  });

  // API route to check connection status
  app.get('/api/status', (req: Request, res: Response) => {
    res.json({ 
      success: true, 
      connected: whatsappClient.isReady(),
      qrAvailable: !!whatsappClient.getQRCode()
    });
  });

  // API route to send a message
  app.post('/api/send', async (req: Request, res: Response) => {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }
    
    if (!whatsappClient.isReady()) {
      return res.status(503).json({ success: false, message: 'WhatsApp client not connected' });
    }
    
    try {
      await whatsappClient.sendMessage(to, message);
      res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error sending message', error: (error as Error).message });
    }
  });

  // API route to get QR code image
  app.get('/api/qr-image', (req: Request, res: Response) => {
    const qrImagePath = join(__dirname, '../../qr.png');
    
    if (fs.existsSync(qrImagePath)) {
      res.sendFile(qrImagePath);
    } else {
      res.status(404).json({ success: false, message: 'QR image not available yet' });
    }
  });
} 