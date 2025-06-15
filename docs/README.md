# OpenSesame Chrome Extension

A Chrome extension that uses an GPT-4 to automate browser tasks.


## Setup

### 1. Install Dependencies

```bash
# Install helper service dependencies
cd helper
npm install
```

### 2. Configure Environment

Create a `.env` file in the `helper` directory:

```
OPENAI_API_KEY=your_openai_api_key_here
PORT=5185
```

### 3. Load Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project root directory (containing `manifest.json`)

### 4. Start Helper Service

```bash
cd helper
npm start
```

This will:
Launch a Playwright browser window with persistent data storage, start the helper service on port 5185, and preserve login sessions between restarts


Tech Stack:
- Manifest V3 for the Chrome extension
- Express.js for the helper service
- Playwright for browser automation
- LangChain for LLM integration
- Persistent browser contexts for session management

file details:
- `manifest.json` - Extension configuration
- `background.js` - Service worker for message handling
- `popup.html/js` - User interface
- `content.js` - Injected scripts for calendar.google.com
- `helper/index.js` - Express server with LangChain agent
- `helper/package.json` - Node.js dependencies
- Playwright browser instance (headed mode)
- LangChain agent with browser toolkit

Overall archeicture:
1. User enters prompt in extension popup
2. Extension sends request to `http://localhost:5185/invoke`
3. Helper service processes with LangChain agent
4. Agent uses Playwright tools to control browser
5. Results sent back to extension
6. User sees feedback and automation
