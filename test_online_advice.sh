#!/bin/bash

# Kill any existing bot processes
pkill -f "node --require ts-node/register src/cli.ts" || true

# Wait for processes to terminate
sleep 1

# Run the online test
node --require ts-node/register src/test_online_advice.ts 