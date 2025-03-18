/**
 * Crypto Polyfill
 * 
 * This file provides a polyfill for the crypto module in environments where it's not globally available,
 * such as in some Node.js environments on cloud platforms like Render.
 */

import crypto from 'crypto';

export function setupCryptoPolyfill() {
  // Check if crypto is already defined globally
  if (typeof global.crypto === 'undefined') {
    console.log('Setting up crypto polyfill');
    // Assign the Node.js crypto module to the global scope
    (global as any).crypto = crypto;
  }
}

export default setupCryptoPolyfill; 