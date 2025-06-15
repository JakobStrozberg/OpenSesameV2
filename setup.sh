#!/bin/bash

# OpenSesame Extension Setup Script
# 
# This script automates the initial setup process for the OpenSesame Chrome extension
# and its helper service. It performs the following:
# 
# 1. Verifies that Node.js is installed (required for the helper service)
# 2. Navigates to the helper directory and installs all npm dependencies
# 3. Installs Playwright browsers needed for browser automation
# 4. Checks for a .env file and creates one if missing, prompting for the OpenAI API key
# 5. Provides clear instructions for loading the extension and starting the helper service
# 

echo "🚀 LLM Agent Setup"
echo "=========================="

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v20+) first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

echo ""
echo "📦 Installing helper service dependencies..."
cd helper

npm install

echo ""
echo "🌐 Installing Playwright browsers..."
npx playwright install

echo ""
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating one..."
    echo ""
    echo "Please enter your OpenAI API key:"
    read -r api_key
    echo "OPENAI_API_KEY=$api_key" > .env
    echo "PORT=5185" >> .env
    echo ".env file created"
else
    echo ".env file already exists"
fi

cd ..

echo ""
echo "Setup complete"
echo ""
echo "Next steps:"
echo "1. Load the extension in Chrome:"
echo "   - Open chrome://extensions/"
echo "   - Enable Developer mode"
echo "   - Click 'Load unpacked' and select this directory"
echo ""
echo "2. Start the helper service:"
echo "   cd helper && npm start"
echo ""
echo "3. Click the extension icon and start using it!"
echo ""
echo "Happy automating" 