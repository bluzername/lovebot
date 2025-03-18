#!/bin/bash

# Define variables
SSH_USER="srv-cv8n6m52ng1s73caf1n0"  # Replace with your Render user if different
SSH_HOST="ssh.frankfurt.render.com"  # Replace with your Render service hostname
SSH_KEY="$HOME/.ssh/id_ed25519"  # Your new SSH key

# Connect to Render via SSH
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST"