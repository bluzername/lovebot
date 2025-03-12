#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Build the project
npm run build

# Create a directory for auth data if it doesn't exist
mkdir -p auth_info_lovebot
mkdir -p data/contexts 