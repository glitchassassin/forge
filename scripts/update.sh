#!/bin/bash

# Get the current timestamp for the log file
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="logs/update-$TIMESTAMP.log"

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to log messages
log() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1" | tee -a "$LOG_FILE"
}

# Check if PID was provided
if [ -z "$1" ]; then
    log "Error: No PID provided"
    exit 1
fi

TARGET_PID=$1

# Kill the Node process
log "Stopping Node process (PID: $TARGET_PID)..."
if kill $TARGET_PID 2>/dev/null; then
    log "Successfully sent termination signal to process $TARGET_PID"
else
    log "Error: Failed to kill process $TARGET_PID"
    exit 1
fi

# Pull latest changes
log "Pulling latest changes..."
git pull >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "Error: Git pull failed"
    exit 1
fi

# Install dependencies
log "Installing dependencies..."
npm install >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "Error: npm install failed"
    exit 1
fi

# Generate Prisma client
log "Generating Prisma client..."
npx prisma generate >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "Error: Prisma generate failed"
    exit 1
fi

# Run migrations
log "Running migrations..."
npx prisma migrate deploy >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "Error: Prisma migrate deploy failed"
    exit 1
fi

# Start the Node process in the background
log "Starting Node process..."
nohup npm start >> "$LOG_FILE" 2>&1 &

log "Update completed successfully" 