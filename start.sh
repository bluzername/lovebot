#!/usr/bin/env bash
# exit on error
set -o errexit

# Start the application with crypto polyfill
node -r ./crypto-polyfill.js dist/index.js 