# OpenSesame Chrome Extension

A beautiful Chrome extension I made that leverages GPT-4o and Langchain to help automate browser tasks, send emails, and add events to google calendar. This extension can:

- Create calendar events automatically
- Go to specific webpages (for example specific subreddits, social media accounts)
- Search the web
- Send emails for you
- Create new google docs, sheets, and more
- Take screenshots
- Open new tabs
- ....and much more! 

## Screenshot examples

This extension is a floating chatbar shown on all pages. It can be moved around your browser wherever you like:

<img width="1723" alt="closed" src="https://github.com/user-attachments/assets/637d22a4-3c52-43ec-9aa2-503874caa5d5" />

The chatbar can be expanded to show a chat dialogue, with message history being saved persistently across tabs and chrome sessions. Sending an email or adding a new event to your calendar is automatic and easy:

<img width="1728" alt="open" src="https://github.com/user-attachments/assets/3aa38b2c-4513-49b3-afa7-d8225ccc2520" />

Here are some examples on different webpages, I made the UI and animations look appealing and professional:

<img width="1728" alt="reddit" src="https://github.com/user-attachments/assets/e41215be-89af-4748-a604-510fa8682504" />

<img width="1724" alt="cats" src="https://github.com/user-attachments/assets/392e15c0-836d-4067-ae13-2b54b20075e3" />



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
