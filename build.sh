#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Build the project
npm run build

# Create directories for auth data if they don't exist
mkdir -p auth_info_lovebot
mkdir -p data/contexts

# Copy public directory to dist for serving static files
mkdir -p dist/public
cp -r public/* dist/public/ 