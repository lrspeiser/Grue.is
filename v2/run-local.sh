#!/bin/bash

echo "==================================="
echo "Grue v2 - Local Testing Setup"
echo "==================================="

# Check if we're in the v2 directory
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the v2 directory"
    exit 1
fi

# Check for .env file
if [ ! -f "../.env" ]; then
    echo "Error: No .env file found in parent directory"
    echo "Please ensure you have a .env file with:"
    echo "  - OPENAI_API_KEY"
    echo "  - GOOGLE_SERVICE_ACCOUNT (Firebase credentials JSON)"
    echo "  - Other Firebase config variables"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo ""
echo "Choose an option:"
echo "1) Test AI game planning only (fast, minimal API cost)"
echo "2) Test full world generation (slower, includes images, higher cost)"
echo "3) Start the game server (port 3001)"
echo "4) Run both servers (v1 on 3000, v2 on 3001) for comparison"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "Running planning test..."
        node test-local.js
        ;;
    2)
        echo "Running full generation test (this will cost money for images)..."
        node test-local.js --full
        ;;
    3)
        echo "Starting v2 server on port 3001..."
        echo "Open http://localhost:3001 in your browser"
        npm start
        ;;
    4)
        echo "Starting both servers..."
        echo "v1 will run on http://localhost:3000"
        echo "v2 will run on http://localhost:3001"
        
        # Start v1 in background
        cd ..
        npm start &
        V1_PID=$!
        
        # Start v2
        cd v2
        npm start &
        V2_PID=$!
        
        echo "Both servers running. Press Ctrl+C to stop both."
        
        # Wait for interrupt
        trap "kill $V1_PID $V2_PID; exit" INT
        wait
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac