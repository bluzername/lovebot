import qrcode from 'qrcode';
import fs from 'fs';
import { join } from 'path';
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
 * Generate a QR code image from a string
 * @param qrString The string to encode in the QR code
 * @returns Promise that resolves when the QR code is generated
 */
export async function generateQR(qrString: string): Promise<void> {
  try {
    // Ensure public directory exists
    const publicDir = join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Generate QR code options
    const qrOptions = {
      errorCorrectionLevel: 'H' as const,
      type: 'png' as const,
      margin: 1,
      scale: 8,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    };
    
    // Save to root directory (for backward compatibility)
    const rootQrPath = join(process.cwd(), 'qr.png');
    await qrcode.toFile(rootQrPath, qrString, qrOptions);
    
    // Save to public directory (for web access)
    const publicQrPath = join(publicDir, 'qr.png');
    await qrcode.toFile(publicQrPath, qrString, qrOptions);
    
    logger.info(`QR code generated and saved to ${rootQrPath} and ${publicQrPath}`);
  } catch (error) {
    logger.error('Error generating QR code:', error);
    throw error;
  }
} 