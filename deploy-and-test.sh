#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
URL="https://www.grue.is/v2-debug"
TEST_FILE="public/v2-index-debug.html"
TIMESTAMP=$(date +%s)

echo -e "${YELLOW}Starting deployment and test process...${NC}"

# Step 1: Check current page status
echo -e "\n${YELLOW}Step 1: Checking current page status...${NC}"
INITIAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
echo "Initial HTTP status: $INITIAL_STATUS"

if [ "$INITIAL_STATUS" = "200" ]; then
    echo -e "${GREEN}Page is currently accessible${NC}"
else
    echo -e "${RED}Page returned status $INITIAL_STATUS${NC}"
fi

# Step 2: Make a small change to the code
echo -e "\n${YELLOW}Step 2: Modifying code...${NC}"
if [ -f "$TEST_FILE" ]; then
    # Add a comment with timestamp to the HTML file
    sed -i '' "1s/^/<!-- Deployment test: $TIMESTAMP -->\n/" "$TEST_FILE"
    echo -e "${GREEN}Added timestamp comment to $TEST_FILE${NC}"
else
    echo -e "${RED}Error: $TEST_FILE not found${NC}"
    exit 1
fi

# Step 3: Commit changes
echo -e "\n${YELLOW}Step 3: Committing changes...${NC}"
git add "$TEST_FILE"
git commit -m "Deployment test: Update v2-debug page with timestamp $TIMESTAMP"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Changes committed successfully${NC}"
else
    echo -e "${RED}No changes to commit or commit failed${NC}"
fi

# Step 4: Push to GitHub
echo -e "\n${YELLOW}Step 4: Pushing to GitHub...${NC}"
CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Pushed to branch: $CURRENT_BRANCH${NC}"
else
    echo -e "${RED}Push failed${NC}"
    exit 1
fi

# Step 5: Wait for Vercel deployment
echo -e "\n${YELLOW}Step 5: Waiting for Vercel deployment...${NC}"
echo "Waiting 30 seconds for deployment to start..."
sleep 30

# Step 6: Poll for deployment completion (max 5 minutes)
echo -e "\n${YELLOW}Step 6: Checking deployment status...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=0
DEPLOYED=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo -n "Attempt $ATTEMPT/$MAX_ATTEMPTS: "
    
    # Check if the page is accessible and contains our timestamp
    RESPONSE=$(curl -s "$URL")
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    
    if [ "$STATUS_CODE" = "200" ]; then
        if echo "$RESPONSE" | grep -q "$TIMESTAMP"; then
            echo -e "${GREEN}Deployment successful! Timestamp found in response.${NC}"
            DEPLOYED=true
            break
        else
            echo "Page accessible but changes not yet deployed..."
        fi
    else
        echo "Page returned status $STATUS_CODE"
    fi
    
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        echo "Waiting 10 seconds before next check..."
        sleep 10
    fi
done

# Step 7: Final result
echo -e "\n${YELLOW}Step 7: Final status...${NC}"
if [ "$DEPLOYED" = true ]; then
    echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
    echo -e "${GREEN}✓ Page is live at: $URL${NC}"
    
    # Optional: Show page content preview
    echo -e "\n${YELLOW}Page preview (first 5 lines):${NC}"
    curl -s "$URL" | head -5
else
    echo -e "${RED}✗ Deployment may have failed or is still in progress${NC}"
    echo -e "${RED}✗ Please check manually at: $URL${NC}"
    exit 1
fi

echo -e "\n${GREEN}Script completed!${NC}"