// This file is required before the application starts to ensure crypto is available globally
const crypto = require('crypto');

// Check if crypto is already defined globally
if (typeof global.crypto === 'undefined') {
  console.log('Setting up crypto polyfill');
  // Assign the Node.js crypto module to the global scope
  global.crypto = crypto;
}

// Export the crypto module
module.exports = crypto; 