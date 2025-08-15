#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}   V2 Game Engine Test Suite    ${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "test-game-engine.js" ]; then
    echo -e "${RED}Error: test-game-engine.js not found${NC}"
    echo "Please run this script from the v2 directory"
    exit 1
fi

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Set environment variables for testing
export NODE_ENV=test
export OPENAI_API_KEY=${OPENAI_API_KEY:-"test-key-for-testing"}

echo -e "${YELLOW}Running Game Engine Tests...${NC}"
echo ""

# Run the tests
node test-game-engine.js

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed successfully!${NC}"
else
    echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
fi

echo -e "${BLUE}================================${NC}"

exit $EXIT_CODE