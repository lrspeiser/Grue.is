#!/bin/bash

# Advanced deployment script with Vercel CLI integration
# Requires: vercel CLI installed (npm i -g vercel)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
URL="https://www.grue.is/v2-debug"
TEST_FILE="public/v2-index-debug.html"
TIMESTAMP=$(date +%s)
LOG_FILE="deployment-log-$TIMESTAMP.txt"

# Function to log messages
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Function to check if Vercel CLI is installed
check_vercel_cli() {
    if ! command -v vercel &> /dev/null; then
        log "${RED}Vercel CLI not found. Installing...${NC}"
        npm i -g vercel
        if [ $? -ne 0 ]; then
            log "${RED}Failed to install Vercel CLI. Please install manually: npm i -g vercel${NC}"
            exit 1
        fi
    else
        log "${GREEN}Vercel CLI found${NC}"
    fi
}

# Start script
log "${BLUE}=== Deployment and Test Script ===${NC}"
log "Timestamp: $(date)"
log "Target URL: $URL"

# Step 1: Check current page status
log "\n${YELLOW}Step 1: Checking current page status...${NC}"
INITIAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
INITIAL_CONTENT=$(curl -s "$URL" | head -20)
log "Initial HTTP status: $INITIAL_STATUS"

# Step 2: Make a change to the code
log "\n${YELLOW}Step 2: Modifying code...${NC}"
if [ -f "$TEST_FILE" ]; then
    # Create backup
    cp "$TEST_FILE" "$TEST_FILE.backup"
    
    # Add a visible change to the HTML
    MARKER="<!-- Deployment $TIMESTAMP -->"
    sed -i '' "s/<body>/<body>\n$MARKER\n<div style=\"background: #4CAF50; color: white; padding: 10px; text-align: center;\">Deployment Test: $TIMESTAMP<\/div>/" "$TEST_FILE"
    
    log "${GREEN}Modified $TEST_FILE with deployment marker${NC}"
else
    log "${RED}Error: $TEST_FILE not found${NC}"
    exit 1
fi

# Step 3: Commit changes
log "\n${YELLOW}Step 3: Committing changes...${NC}"
git add "$TEST_FILE"
git commit -m "Automated deployment test: $TIMESTAMP

- Added deployment marker to v2-debug page
- Testing CI/CD pipeline"

if [ $? -eq 0 ]; then
    log "${GREEN}Changes committed successfully${NC}"
    COMMIT_HASH=$(git rev-parse HEAD)
    log "Commit hash: $COMMIT_HASH"
else
    log "${RED}Commit failed${NC}"
    exit 1
fi

# Step 4: Push to GitHub
log "\n${YELLOW}Step 4: Pushing to GitHub...${NC}"
CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH" --force-with-lease
if [ $? -eq 0 ]; then
    log "${GREEN}Pushed to branch: $CURRENT_BRANCH${NC}"
else
    log "${RED}Push failed. Trying regular push...${NC}"
    git push origin "$CURRENT_BRANCH"
    if [ $? -ne 0 ]; then
        log "${RED}Push failed completely${NC}"
        exit 1
    fi
fi

# Step 5: Trigger Vercel deployment (if CLI available)
log "\n${YELLOW}Step 5: Checking for Vercel CLI...${NC}"
if command -v vercel &> /dev/null; then
    log "${GREEN}Vercel CLI found. You can manually trigger deployment with: vercel --prod${NC}"
    log "Or link your project first with: vercel link"
else
    log "${YELLOW}Vercel CLI not found. Deployment will trigger automatically via GitHub integration${NC}"
fi

# Step 6: Monitor deployment
log "\n${YELLOW}Step 6: Monitoring deployment...${NC}"
log "Waiting initial 20 seconds for deployment to start..."
sleep 20

# Poll for changes
MAX_ATTEMPTS=40  # 40 * 10 seconds = ~6.5 minutes max
ATTEMPT=0
DEPLOYED=false
LAST_STATUS=""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    # Check status
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    RESPONSE=$(curl -s "$URL" 2>/dev/null)
    
    # Progress indicator
    printf "\rAttempt %2d/%2d: " $ATTEMPT $MAX_ATTEMPTS
    
    if [ "$STATUS_CODE" = "200" ]; then
        if echo "$RESPONSE" | grep -q "$TIMESTAMP"; then
            printf "${GREEN}✓ Deployment successful!${NC}\n"
            DEPLOYED=true
            break
        else
            printf "Page accessible, awaiting changes..."
        fi
    else
        printf "HTTP $STATUS_CODE"
    fi
    
    if [ "$ATTEMPT" -lt $MAX_ATTEMPTS ]; then
        sleep 10
    fi
done

echo ""  # New line after progress indicator

# Step 7: Verification
log "\n${YELLOW}Step 7: Final verification...${NC}"
if [ "$DEPLOYED" = true ]; then
    log "${GREEN}✅ Deployment completed successfully!${NC}"
    log "${GREEN}✅ Changes are live at: $URL${NC}"
    
    # Show deployment info
    log "\n${BLUE}Deployment Summary:${NC}"
    log "- Timestamp: $TIMESTAMP"
    log "- Commit: $COMMIT_HASH"
    log "- Branch: $CURRENT_BRANCH"
    log "- URL: $URL"
    
    # Test the page
    log "\n${YELLOW}Running page tests...${NC}"
    FINAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    if [ "$FINAL_STATUS" = "200" ]; then
        log "${GREEN}✓ Page returns 200 OK${NC}"
    fi
    
    # Check for our marker in the response
    if curl -s "$URL" | grep -q "$TIMESTAMP"; then
        log "${GREEN}✓ Deployment marker found in HTML${NC}"
    fi
    
    log "\n${GREEN}All checks passed! 🎉${NC}"
else
    log "${RED}⚠️ Deployment verification failed${NC}"
    log "${YELLOW}Possible reasons:${NC}"
    log "- Deployment is still in progress (try again in a few minutes)"
    log "- Build failed on Vercel (check Vercel dashboard)"
    log "- GitHub webhook not configured properly"
    log "\n${YELLOW}Manual verification steps:${NC}"
    log "1. Check Vercel dashboard: https://vercel.com/dashboard"
    log "2. Check GitHub Actions (if configured)"
    log "3. Verify the page manually: $URL"
    
    # Restore backup
    if [ -f "$TEST_FILE.backup" ]; then
        log "\n${YELLOW}Restoring backup...${NC}"
        mv "$TEST_FILE.backup" "$TEST_FILE"
        log "Original file restored"
    fi
    
    exit 1
fi

# Cleanup
if [ -f "$TEST_FILE.backup" ]; then
    rm "$TEST_FILE.backup"
fi

log "\n${BLUE}Log saved to: $LOG_FILE${NC}"
log "${GREEN}Script completed successfully!${NC}"