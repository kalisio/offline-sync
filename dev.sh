#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Cleanup function to stop all processes when script exits
cleanup() {
    echo ""
    echo "Stopping all development services..."
    # Kill all child processes and their descendants
    pkill -P $$ 2>/dev/null
    # Also kill any remaining background jobs
    kill $(jobs -p) 2>/dev/null
    # Give processes a moment to cleanup
    sleep 1
    # Force kill if still running
    pkill -9 -P $$ 2>/dev/null
    exit 0
}

# Set trap for cleanup on script termination
trap cleanup SIGINT SIGTERM

echo "Starting all development services..."
echo "Press Ctrl+C to stop all services"
echo ""

# Start Docker containers
(docker compose up | sed "s/^/$(printf "${BLUE}[Docker]${NC} ")/") &

# Start API Wrangler dev server
(cd example/server && npm run dev | sed "s/^/$(printf "${GREEN}[Server]${NC} ")/") &

# Start Dashboard dev server
(cd example/frontend && npm run dev | sed "s/^/$(printf "${YELLOW}[Frontend]${NC} ")/") &

# Wait for all background processes
wait
