/**
 * Content script for floating chat functionality
 * Handles creation and management of the draggable chat window
 */

console.log('OpenSeseme floating chat content script loaded');

let floatingChat = null;
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;
let chatHistory = [];
let currentChatId = null;
let allChats = {};
let isMinimized = false;
let lastUpdateTimestamp = 0; // Track the timestamp of the last update to prevent race conditions

// Available tools configuration (same as popup.js)
const availableTools = [
  {
    name: 'open_new_tab',
    description: 'Opens a new tab with Google services or any URL',
    examples: ['@open_new_tab sheets', '@open_new_tab gmail', '@open_new_tab new docs']
  },
  {
    name: 'navigate_browser',
    description: 'Navigate to a URL',
    examples: ['@navigate_browser https://example.com']
  },
  {
    name: 'create_calendar_event',
    description: 'Create a Google Calendar event',
    examples: ['@create_calendar_event Meeting tomorrow at 2pm']
  },
  {
    name: 'search',
    description: 'Search Google for anything',
    examples: ['@search pizza recipes', '@search how to bake cookies']
  },
  {
    name: 'take_screenshot',
    description: 'Take a screenshot of current page',
    examples: ['@take_screenshot']
  }
];

// Create floating chat automatically on page load with proper error handling
(async function initializeFloatingChat() {
  try {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeFloatingChat);
      return;
    }
    
    // Check if we're in a valid context (some pages may not allow content scripts)
    if (!document.body || window.location.protocol === 'chrome-extension:' || 
        window.location.protocol === 'chrome:' || window.location.protocol === 'about:') {
      console.log('OpenSeseme: Skipping initialization on special page');
      return;
    }
    
    // Load saved chats and position first
    const result = await chrome.storage.local.get(['chats', 'currentChatId', 'floatingChatPosition', 'lastUpdateTimestamp']);
    if (result.chats) {
      allChats = result.chats;
    }
    if (result.currentChatId) {
      currentChatId = result.currentChatId;
      if (allChats[currentChatId]) {
        chatHistory = allChats[currentChatId].messages || [];
      }
    }
    if (result.lastUpdateTimestamp) {
      lastUpdateTimestamp = result.lastUpdateTimestamp;
    }
    
    // Restore saved position if available
    if (result.floatingChatPosition) {
      xOffset = result.floatingChatPosition.xOffset || 0;
      yOffset = result.floatingChatPosition.yOffset || 0;
    }
    
    // Create floating chat directly (minimized by default)
    createFloatingChat();
    
    // Start in minimized state
    if (floatingChat) {
      floatingChat.classList.add('minimized');
      isMinimized = true;
      
      // Apply saved position
      if (xOffset !== 0 || yOffset !== 0) {
        floatingChat.style.transform = `translate(calc(-50% + ${xOffset}px), ${yOffset}px)`;
      }
    }
  } catch (error) {
    console.error('OpenSeseme: Error initializing floating chat:', error);
  }
})();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'createFloatingChat') {
      // If chat doesn't exist, create it
      if (!floatingChat) {
        createFloatingChat(request.chatData);
      } else {
        // If chat exists, just show it and update data
        floatingChat.style.display = 'block';
        if (floatingChat.classList.contains('minimized')) {
          floatingChat.classList.remove('minimized');
          isMinimized = false;
        }
        
        // Update with provided chat data
        if (request.chatData) {
          updateFloatingChat(request.chatData);
        }
      }
      
      sendResponse({ success: true });
    } else if (request.action === 'hideFloatingChat') {
      if (floatingChat) {
        floatingChat.style.display = 'none';
      }
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error('OpenSeseme: Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true; // Keep message channel open for async response
});

function createFloatingChat(chatData) {
  // Create container
  floatingChat = document.createElement('div');
  floatingChat.id = 'openseseme-floating-chat';
  floatingChat.innerHTML = `
    <div class="openseseme-chat-header">
      <img src="${chrome.runtime.getURL('Logo.png')}" alt="Logo" class="openseseme-header-logo">
      <span class="openseseme-header-title">OpenSeseme Chat</span>
      <div class="openseseme-header-controls">
        <button class="openseseme-minimize-btn" title="Minimize">−</button>
        <button class="openseseme-close-btn" title="Close">×</button>
      </div>
    </div>
    
    <div class="openseseme-chat-body">
      <!-- Top bar with chats -->
      <div class="openseseme-top-bar">
        <button class="openseseme-new-chat-btn" title="New Chat">+ New chat</button>
        <div class="openseseme-chat-list-horizontal">
          <!-- Previous chats will be listed here -->
        </div>
      </div>
      
      <!-- Main chat area -->
      <div class="openseseme-chat-container">
        <div class="openseseme-chat-messages">
          <!-- Chat messages will be dynamically added here -->
        </div>
        <div class="openseseme-message-assistant">
          <div class="openseseme-loading-indicator">
            <span>🤔 Thinking...</span>
          </div>
        </div>
      </div>
      
      <!-- Bottom input area -->
      <div class="openseseme-bottom-input-container">
        <div class="openseseme-status"></div>
        
        <div class="openseseme-input-wrapper">
          <img src="${chrome.runtime.getURL('Logo.png')}" alt="Logo" class="openseseme-input-logo">
          <div class="openseseme-input-group">
            <textarea 
              class="openseseme-user-input" 
              placeholder="Ask me anything... (type @ for tools)"
            ></textarea>
            <button class="openseseme-submit-btn">⏎</button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="openseseme-minimized-container" style="display: none;">
      <div class="openseseme-minimized-input-wrapper">
        <img src="${chrome.runtime.getURL('Logo.png')}" alt="Logo" class="openseseme-minimized-logo">
        <textarea 
          class="openseseme-minimized-input" 
          placeholder="Ask me anything..."
        ></textarea>
        <button class="openseseme-minimized-submit">⏎</button>
        <button class="openseseme-minimized-expand" title="Expand">↑</button>
      </div>
    </div>
  `;

  // Create tools dropdown
  const toolsDropdown = document.createElement('div');
  toolsDropdown.id = 'openseseme-tools-dropdown';
  toolsDropdown.className = 'openseseme-tools-dropdown';
  toolsDropdown.style.display = 'none';
  floatingChat.appendChild(toolsDropdown);

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    @keyframes expandChat {
      0% {
        height: 56px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      }
      60% {
        height: 570px;
      }
      100% {
        height: 550px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      }
    }
    
    @keyframes minimizeChat {
      0% {
        height: 550px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        background: #ffffff;
      }
      40% {
        height: 40px;
      }
      100% {
        height: 56px;
        box-shadow: none;
        background: transparent;
      }
    }
    
    @keyframes fadeInContent {
      0% {
        opacity: 0;
        transform: translateY(10px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes fadeOutContent {
      0% {
        opacity: 1;
        transform: translateY(0);
      }
      100% {
        opacity: 0;
        transform: translateY(-10px);
      }
    }
    
    @keyframes scaleIn {
      0% {
        transform: translateX(-50%) scale(0.9);
        opacity: 0;
      }
      50% {
        transform: translateX(-50%) scale(1.02);
      }
      100% {
        transform: translateX(-50%) scale(1);
        opacity: 1;
      }
    }
    
    @keyframes buttonPress {
      0% {
        transform: scale(1);
      }
      50% {
        transform: scale(0.95);
      }
      100% {
        transform: scale(1);
      }
    }
    
    @keyframes messageSlideIn {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes scaleOut {
      0% {
        transform: translateX(-50%) scale(1);
        opacity: 1;
      }
      50% {
        transform: translateX(-50%) scale(0.95);
      }
      100% {
        transform: translateX(-50%) scale(0.8);
        opacity: 0;
      }
    }
    
    #openseseme-floating-chat {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 400px;
      height: 550px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      z-index: 999999;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      transition: box-shadow 0.3s ease;
      animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    
    #openseseme-floating-chat.minimized {
      width: 400px;
      height: 56px;
      cursor: default;
      background: transparent;
      box-shadow: none;
      animation: minimizeChat 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    
    .openseseme-chat-header {
      background: #5a3a7e;
      color: white;
      padding: 12px 16px;
      border-radius: 12px 12px 0 0;
      cursor: move;
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
      animation: fadeInContent 0.4s ease 0.2s both;
    }
    
    #openseseme-floating-chat.minimized .openseseme-chat-header {
      display: none;
    }
    
    .openseseme-header-logo {
      width: 24px;
      height: 24px;
      filter: brightness(0) invert(1);
    }
    
    .openseseme-header-title {
      flex: 1;
      font-weight: 500;
    }
    
    .openseseme-header-controls {
      display: flex;
      gap: 8px;
    }
    
    .openseseme-minimize-btn,
    .openseseme-close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s ease;
    }
    
    .openseseme-minimize-btn:hover,
    .openseseme-close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.1);
    }
    
    .openseseme-minimize-btn:active,
    .openseseme-close-btn:active {
      animation: buttonPress 0.2s ease;
    }
    
    .openseseme-chat-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: white;
      border-radius: 0 0 12px 12px;
      animation: fadeInContent 0.4s ease 0.3s both;
    }
    
    #openseseme-floating-chat.minimized .openseseme-chat-body {
      display: none;
      animation: fadeOutContent 0.2s ease forwards;
    }
    
    .openseseme-minimized-container {
      width: 100%;
      padding: 8px;
      opacity: 0;
      animation: fadeInContent 0.3s ease 0.2s forwards;
    }
    
    #openseseme-floating-chat.minimized .openseseme-minimized-container {
      display: block !important;
      opacity: 1;
    }
    
    .openseseme-minimized-input-wrapper {
      display: flex;
      align-items: center;
      background: #5a3a7e;
      border-radius: 20px;
      padding: 6px 10px;
      gap: 6px;
      border: 1px solid #4a2a6e;
      transition: all 0.2s ease;
    }
    
    .openseseme-minimized-input-wrapper:focus-within {
      border-color: #8a6aae;
      background: #6a4a8e;
      box-shadow: 0 0 0 3px rgba(138, 106, 174, 0.3);
    }
    
    .openseseme-minimized-logo {
      width: 24px;
      height: 24px;
      filter: brightness(0) invert(1);
      flex-shrink: 0;
      cursor: move;
      transition: opacity 0.2s;
    }
    
    .openseseme-minimized-logo:hover {
      opacity: 0.8;
    }
    
    .openseseme-minimized-input {
      flex: 1;
      height: 20px;
      padding: 0 8px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      line-height: 20px;
      color: #ffffff;
      overflow: hidden;
      white-space: nowrap;
    }
    
    .openseseme-minimized-input:focus {
      outline: none;
    }
    
    .openseseme-minimized-input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }
    
    .openseseme-minimized-submit {
      width: 28px;
      height: 28px;
      background: #7a5a9e;
      color: #4ade80;
      border: none;
      border-radius: 50%;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .openseseme-minimized-submit:hover:not(:disabled) {
      background: #8a6aae;
      transform: scale(1.05);
    }
    
    .openseseme-minimized-expand {
      width: 28px;
      height: 28px;
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      border: none;
      border-radius: 50%;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
    }
    
    .openseseme-minimized-expand:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }
    
    /* Top bar with chats */
    .openseseme-top-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid #e8eaed;
    }
    
    .openseseme-new-chat-btn {
      padding: 6px 12px;
      background: #5a3a7e;
      color: white;
      border: none;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .openseseme-new-chat-btn:hover {
      background: #6a4a8e;
      transform: scale(1.05);
      box-shadow: 0 2px 8px rgba(90, 58, 126, 0.3);
    }
    
    .openseseme-new-chat-btn:active {
      animation: buttonPress 0.2s ease;
    }
    
    .openseseme-chat-list-horizontal {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      flex: 1;
    }
    
    .openseseme-chat-list-horizontal::-webkit-scrollbar {
      height: 4px;
    }
    
    .openseseme-chat-item {
      padding: 4px 10px;
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      font-size: 12px;
      background: #5a3a7e;
      color: #ffffff;
      border: 1px solid transparent;
      flex-shrink: 0;
      position: relative;
      padding-right: 25px; /* Make room for delete button */
    }
    
    .openseseme-chat-item:hover {
      background: #6a4a8e;
    }
    
    .openseseme-chat-item.active {
      background: #7a5a9e;
      border-color: #8a6aae;
    }
    
    .openseseme-chat-delete {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
      border: none;
      border-radius: 50%;
      font-size: 10px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      line-height: 1;
    }
    
    .openseseme-chat-item:hover .openseseme-chat-delete {
      display: flex;
    }
    
    .openseseme-chat-delete:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-50%) scale(1.1);
    }
    
    /* Main chat area */
    .openseseme-chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 12px;
    }
    
    .openseseme-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 12px;
    }
    
    .openseseme-chat-messages::-webkit-scrollbar {
      width: 6px;
    }
    
    .openseseme-chat-messages::-webkit-scrollbar-thumb {
      background: #dadce0;
      border-radius: 3px;
    }
    
    /* Chat message styles */
    .openseseme-chat-message {
      margin-bottom: 12px;
      animation: messageSlideIn 0.3s ease-out;
    }
    
    @keyframes messageSlideIn {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .openseseme-message-user {
      text-align: right;
    }
    
    .openseseme-message-assistant {
      text-align: left;
    }
    
    .openseseme-message-bubble {
      display: inline-block;
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 13px;
      line-height: 1.4;
      word-wrap: break-word;
    }
    
    .openseseme-message-user .openseseme-message-bubble {
      background: #5a3a7e;
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }
    
    .openseseme-message-assistant .openseseme-message-bubble {
      background: #f1f3f4;
      color: #202124;
      border-bottom-left-radius: 4px;
    }
    
    .openseseme-loading-indicator {
      display: none;
      padding: 10px 14px;
      background: #f1f3f4;
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      color: #5f6368;
      font-size: 13px;
      max-width: 85%;
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    .openseseme-loading-indicator.visible {
      display: inline-block;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    
    /* Bottom input area */
    .openseseme-bottom-input-container {
      padding: 12px;
      border-top: 1px solid #e8eaed;
    }
    
    .openseseme-status {
      padding: 8px 10px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 12px;
      display: none;
      animation: fadeIn 0.3s ease-out;
    }
    
    .openseseme-status.success {
      background: #e6f4ea;
      color: #137333;
      border: 1px solid #c3e6cd;
    }
    
    .openseseme-status.error {
      background: #fce8e6;
      color: #d33b30;
      border: 1px solid #f5c6c2;
    }
    
    .openseseme-status.info {
      background: #e8f0fe;
      color: #1967d2;
      border: 1px solid #d2e3fc;
    }
    
    .openseseme-input-wrapper {
      position: relative;
      background: #5a3a7e;
      border-radius: 20px;
      border: 1px solid #4a2a6e;
      transition: all 0.2s ease;
    }
    
    .openseseme-input-wrapper:focus-within {
      border-color: #8a6aae;
      background: #6a4a8e;
      box-shadow: 0 0 0 3px rgba(138, 106, 174, 0.3);
    }
    
    .openseseme-input-logo {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      opacity: 0.8;
      filter: brightness(0) invert(1);
    }
    
    .openseseme-input-group {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      gap: 6px;
      position: relative;
      z-index: 1;
    }
    
    .openseseme-user-input {
      flex: 1;
      height: 20px;
      padding: 0 0 0 30px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      line-height: 20px;
      color: #ffffff;
      overflow: hidden;
      white-space: nowrap;
    }
    
    .openseseme-user-input:focus {
      outline: none;
    }
    
    .openseseme-user-input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }
    
    .openseseme-submit-btn {
      width: 28px;
      height: 28px;
      background: #7a5a9e;
      color: #4ade80;
      border: none;
      border-radius: 50%;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      position: relative;
      z-index: 2;
    }
    
    .openseseme-submit-btn:hover:not(:disabled) {
      background: #8a6aae;
      transform: scale(1.05);
      box-shadow: 0 2px 8px rgba(138, 106, 174, 0.3);
    }
    
    .openseseme-submit-btn:active:not(:disabled) {
      animation: buttonPress 0.2s ease;
    }
    
    .openseseme-submit-btn:disabled {
      background: #4a3a5e;
      cursor: not-allowed;
      opacity: 0.6;
    }
    
    /* Tools dropdown styles */
    .openseseme-tools-dropdown {
      position: absolute;
      background: white;
      border: 1px solid #e8eaed;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      max-height: 300px;
      overflow-y: auto;
      z-index: 10000;
      width: 380px;
      bottom: 100%;
      left: 10px;
      right: 10px;
      margin-bottom: 8px;
    }
    
    .openseseme-tools-dropdown-header {
      padding: 12px;
      border-bottom: 1px solid #e8eaed;
    }
    
    .openseseme-tools-dropdown-title {
      font-size: 14px;
      font-weight: 600;
      color: #202124;
      margin-bottom: 4px;
    }
    
    .openseseme-tools-dropdown-subtitle {
      font-size: 12px;
      color: #5f6368;
    }
    
    .openseseme-tool-item {
      padding: 12px;
      cursor: pointer;
      border-bottom: 1px solid #f8f9fa;
      transition: background-color 0.2s;
    }
    
    .openseseme-tool-item:hover {
      background-color: #f8f9fa;
    }
    
    .openseseme-tool-item:last-of-type {
      border-bottom: none;
    }
    
    .openseseme-tool-name {
      font-size: 14px;
      font-weight: 500;
      color: #1a73e8;
      margin-bottom: 4px;
    }
    
    .openseseme-tool-description {
      font-size: 12px;
      color: #5f6368;
      margin-bottom: 6px;
    }
    
    .openseseme-tool-examples {
      font-size: 11px;
      color: #80868b;
    }
    
    .openseseme-tool-examples code {
      background: #f8f9fa;
      padding: 2px 4px;
      border-radius: 3px;
      margin-right: 6px;
    }
    
    .openseseme-tools-dropdown-footer {
      padding: 8px 12px;
      background: #f8f9fa;
      border-radius: 0 0 8px 8px;
      font-size: 11px;
      color: #5f6368;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(floatingChat);
  
  // Initialize event handlers
  initializeEventHandlers();
  
  // Load saved chats from storage
  loadSavedChats().then(() => {
    // Update with provided chat data if newer
    if (chatData) {
      updateFloatingChat(chatData);
    }
  });
  
  // Make draggable
  makeDraggable();
}

function initializeEventHandlers() {
  console.log('OpenSeseme: Initializing event handlers');
  
  // Close button
  const closeBtn = floatingChat.querySelector('.openseseme-close-btn');
  if (!closeBtn) {
    console.error('OpenSeseme: Close button not found');
    return;
  }
  closeBtn.addEventListener('click', () => {
    // Add close animation
    floatingChat.style.animation = 'none';
    floatingChat.offsetHeight; // Force reflow
    floatingChat.style.animation = 'scaleOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    
    // Hide after animation completes
    setTimeout(() => {
      floatingChat.style.display = 'none';
      // Reset animation for next opening
      floatingChat.style.animation = '';
    }, 300);
    
    // Notify popup that chat was closed
    chrome.runtime.sendMessage({ action: 'floatingChatClosed' });
  });
  
  // Minimize button
  const minimizeBtn = floatingChat.querySelector('.openseseme-minimize-btn');
  minimizeBtn.addEventListener('click', toggleMinimize);
  
  // Minimized expand button
  const expandBtn = floatingChat.querySelector('.openseseme-minimized-expand');
  expandBtn.addEventListener('click', toggleMinimize);
  
  // Minimized input and submit
  const minimizedInput = floatingChat.querySelector('.openseseme-minimized-input');
  const minimizedSubmit = floatingChat.querySelector('.openseseme-minimized-submit');
  
  minimizedInput.addEventListener('input', () => {
    // Check for @ symbol to show tools dropdown
    const value = minimizedInput.value;
    const cursorPosition = minimizedInput.selectionStart;
    
    if (value[cursorPosition - 1] === '@') {
      showToolsDropdown(minimizedInput);
    } else {
      const beforeCursor = value.substring(0, cursorPosition);
      const lastAtIndex = beforeCursor.lastIndexOf('@');
      const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
      
      if (lastAtIndex === -1 || (lastSpaceIndex > lastAtIndex)) {
        hideToolsDropdown();
      }
    }
  });
  
  minimizedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      minimizedSubmit.click();
    } else if (event.key === 'Escape') {
      hideToolsDropdown();
    }
  });
  
  minimizedSubmit.addEventListener('click', async () => {
    const input = minimizedInput.value.trim();
    if (!input) return;
    
    // Expand the window first
    toggleMinimize();
    
    // Copy the input to the main input field and submit
    const mainInput = floatingChat.querySelector('.openseseme-user-input');
    mainInput.value = input;
    minimizedInput.value = '';
    
    // Trigger submit after a short delay to ensure UI is updated
    setTimeout(() => {
      handleSubmit();
    }, 100);
  });
  
  // Input and submit button
  const userInput = floatingChat.querySelector('.openseseme-user-input');
  const submitBtn = floatingChat.querySelector('.openseseme-submit-btn');
  
  if (!userInput || !submitBtn) {
    console.error('OpenSeseme: Input elements not found', { userInput, submitBtn });
    return;
  }
  
  console.log('OpenSeseme: Setting up input handlers');
  
  // Handle input changes
  userInput.addEventListener('input', () => {
    // Update submit button appearance
    if (userInput.value.trim().length > 0) {
      submitBtn.style.background = '#8a6aae';
      submitBtn.disabled = false;
    } else {
      submitBtn.style.background = '#7a5a9e';
    }
    
    // Check for @ symbol to show tools dropdown
    const value = userInput.value;
    const cursorPosition = userInput.selectionStart;
    
    if (value[cursorPosition - 1] === '@') {
      showToolsDropdown(userInput);
    } else {
      const beforeCursor = value.substring(0, cursorPosition);
      const lastAtIndex = beforeCursor.lastIndexOf('@');
      const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
      
      if (lastAtIndex === -1 || (lastSpaceIndex > lastAtIndex)) {
        hideToolsDropdown();
      }
    }
  });
  
  userInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      handleSubmit();
    } else if (event.key === 'Escape') {
      hideToolsDropdown();
    }
  });
  
  submitBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleSubmit();
  });
  
  // New chat button
  const newChatBtn = floatingChat.querySelector('.openseseme-new-chat-btn');
  newChatBtn.addEventListener('click', createNewChat);
  
  // Click outside to close tools dropdown
  document.addEventListener('click', (event) => {
    const toolsDropdown = floatingChat?.querySelector('#openseseme-tools-dropdown');
    if (toolsDropdown && toolsDropdown.style.display !== 'none') {
      if (!toolsDropdown.contains(event.target) && 
          !event.target.classList.contains('openseseme-user-input') &&
          !event.target.classList.contains('openseseme-minimized-input')) {
        hideToolsDropdown();
      }
    }
  });
}

function toggleMinimize() {
  isMinimized = !isMinimized;
  
  if (isMinimized) {
    // When minimizing, ensure smooth transition
    floatingChat.style.animation = 'none';
    floatingChat.offsetHeight; // Force reflow
    floatingChat.style.animation = 'minimizeChat 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    
    // Add class after a slight delay to ensure animation starts
    requestAnimationFrame(() => {
      floatingChat.classList.add('minimized');
    });
    
    // Animate minimized container appearance
    const minimizedContainer = floatingChat.querySelector('.openseseme-minimized-container');
    if (minimizedContainer) {
      minimizedContainer.style.animation = 'none';
      minimizedContainer.offsetHeight; // Force reflow
      minimizedContainer.style.animation = 'fadeInContent 0.3s ease 0.2s forwards';
    }
  } else {
    // When expanding, ensure smooth transition
    floatingChat.style.animation = 'none';
    floatingChat.offsetHeight; // Force reflow
    floatingChat.style.animation = 'expandChat 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
    
    floatingChat.classList.remove('minimized');
    
    // Animate header and body appearance
    const header = floatingChat.querySelector('.openseseme-chat-header');
    const body = floatingChat.querySelector('.openseseme-chat-body');
    
    if (header) {
      header.style.animation = 'none';
      header.offsetHeight; // Force reflow
      header.style.animation = 'fadeInContent 0.4s ease 0.2s both';
    }
    
    if (body) {
      body.style.animation = 'none';
      body.offsetHeight; // Force reflow
      body.style.animation = 'fadeInContent 0.4s ease 0.3s both';
    }
  }
}

function makeDraggable() {
  const header = floatingChat.querySelector('.openseseme-chat-header');
  const minimizedLogo = floatingChat.querySelector('.openseseme-minimized-logo');
  
  // Make both header and minimized logo draggable
  [header, minimizedLogo].forEach(element => {
    element.addEventListener('mousedown', dragMouseDown);
    element.style.cursor = 'move';
  });
  
  function dragMouseDown(e) {
    e.preventDefault();
    // Get the mouse cursor position at startup
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    
    isDragging = true;
    
    document.addEventListener('mousemove', elementDrag);
    document.addEventListener('mouseup', closeDragElement);
  }
  
  function elementDrag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    xOffset = currentX;
    yOffset = currentY;
    
    // Apply both the centering transform and the drag offset
    floatingChat.style.transform = `translate(calc(-50% + ${currentX}px), ${currentY}px)`;
  }
  
  async function closeDragElement() {
    isDragging = false;
    document.removeEventListener('mousemove', elementDrag);
    document.removeEventListener('mouseup', closeDragElement);
    
    // Save the position
    try {
      await chrome.storage.local.set({
        floatingChatPosition: { xOffset, yOffset }
      });
    } catch (error) {
      console.error('OpenSeseme: Error saving position:', error);
    }
  }
}

function updateFloatingChat(chatData) {
  if (chatData.chatHistory) {
    chatHistory = chatData.chatHistory;
    currentChatId = chatData.currentChatId;
    allChats = chatData.allChats || {};
    
    // Update messages
    const messagesContainer = floatingChat.querySelector('.openseseme-chat-messages');
    messagesContainer.innerHTML = '';
    
    chatHistory.forEach(message => {
      addChatMessage(message.content, message.role === 'user');
    });
    
    // Update chat list
    updateChatList();
  }
}

function addChatMessage(content, isUser = false) {
  try {
    const messagesContainer = floatingChat?.querySelector('.openseseme-chat-messages');
    if (!messagesContainer) {
      console.error('OpenSeseme: Messages container not found');
      return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `openseseme-chat-message ${isUser ? 'openseseme-message-user' : 'openseseme-message-assistant'}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'openseseme-message-bubble';
    bubble.textContent = content;
    
    messageDiv.appendChild(bubble);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom with a small delay to ensure rendering
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
  } catch (error) {
    console.error('OpenSeseme: Error adding chat message:', error);
  }
}

async function handleSubmit() {
  try {
    const userInput = floatingChat.querySelector('.openseseme-user-input');
    const submitBtn = floatingChat.querySelector('.openseseme-submit-btn');
    
    if (!userInput || !submitBtn) {
      console.error('OpenSeseme: Could not find input elements');
      return;
    }
    
    const input = userInput.value.trim();
    
    if (!input) {
      showStatus('Please enter a request', 'error');
      return;
    }
    
    // Hide tools dropdown when submitting
    hideToolsDropdown();
  
    // Create new chat if needed
    if (!currentChatId || !allChats[currentChatId]) {
      currentChatId = Date.now().toString();
      allChats[currentChatId] = {
        id: currentChatId,
        title: generateChatTitle(input),
        timestamp: Date.now(),
        messages: []
      };
      updateChatList();
      await saveChats(); // Save after creating new chat
    } else if (allChats[currentChatId].messages.length === 0 && allChats[currentChatId].title === 'New Chat') {
      // Update title if this is the first message in a chat created with "New Chat" button
      allChats[currentChatId].title = generateChatTitle(input);
      updateChatList();
    }
    
    // Add user message
    chatHistory.push({ role: 'user', content: input });
    allChats[currentChatId].messages = chatHistory;
    addChatMessage(input, true);
    
    // Save after adding user message
    await saveChats();
    
    // Clear input and show loading
    userInput.value = '';
    submitBtn.disabled = true;
    showLoadingIndicator();
    
    try {
      // Send message to background script via runtime message
      const response = await chrome.runtime.sendMessage({
        action: 'invokeAgent',
        prompt: input,
        chatHistory: chatHistory
      });
      
      hideLoadingIndicator();
      
      if (response && response.success) {
        chatHistory.push({ role: 'assistant', content: response.result });
        allChats[currentChatId].messages = chatHistory;
        addChatMessage(response.result, false);
        showStatus('✅ Response received', 'success');
        
        // Save after adding assistant response
        await saveChats();
        
        // Sync with popup
        chrome.runtime.sendMessage({
          action: 'syncChatData',
          chatData: {
            chatHistory,
            currentChatId,
            allChats
          }
        });
      } else {
        const errorMessage = response?.error || 'Failed to process request';
        const errorMsg = `❌ Error: ${errorMessage}`;
        chatHistory.push({ role: 'assistant', content: errorMsg });
        addChatMessage(errorMsg, false);
        showStatus(`❌ ${errorMessage}`, 'error');
        
        // Save even on error
        await saveChats();
      }
    } catch (error) {
      hideLoadingIndicator();
      const errorMsg = `❌ Error: ${error.message}`;
      chatHistory.push({ role: 'assistant', content: errorMsg });
      addChatMessage(errorMsg, false);
      showStatus(`❌ Error: ${error.message}`, 'error');
      
      // Save even on error
      await saveChats();
    } finally {
      submitBtn.disabled = false;
      userInput.focus();
    }
  } catch (error) {
    console.error('OpenSeseme: Error in handleSubmit:', error);
    showStatus(`Error: ${error.message}`, 'error');
    
    // Re-enable submit button
    const submitBtn = floatingChat.querySelector('.openseseme-submit-btn');
    if (submitBtn) submitBtn.disabled = false;
  }
}

function showStatus(message, type) {
  const status = floatingChat.querySelector('.openseseme-status');
  status.textContent = message;
  status.className = `openseseme-status ${type}`;
  status.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      status.style.display = 'none';
    }, 5000);
  }
}

function showLoadingIndicator() {
  const indicator = floatingChat.querySelector('.openseseme-loading-indicator');
  indicator.classList.add('visible');
}

function hideLoadingIndicator() {
  const indicator = floatingChat.querySelector('.openseseme-loading-indicator');
  indicator.classList.remove('visible');
}

function generateChatTitle(firstMessage) {
  const words = firstMessage.split(' ').slice(0, 4);
  return words.join(' ') + (words.length < firstMessage.split(' ').length ? '...' : '');
}

async function createNewChat() {
  try {
    // Save current chat before creating new one
    if (currentChatId && chatHistory.length > 0 && allChats[currentChatId]) {
      allChats[currentChatId].messages = chatHistory;
      await saveChats();
    }
    
    // Generate new chat ID
    currentChatId = Date.now().toString();
    chatHistory = [];
    
    // Initialize the new chat in allChats
    allChats[currentChatId] = {
      id: currentChatId,
      title: 'New Chat',
      timestamp: Date.now(),
      messages: []
    };
    
    // Clear messages
    const messagesContainer = floatingChat?.querySelector('.openseseme-chat-messages');
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }
    
    // Clear input field
    const userInput = floatingChat?.querySelector('.openseseme-user-input');
    if (userInput) {
      userInput.value = '';
    }
    
    // Update chat list
    updateChatList();
    
    // Save the new state
    await saveChats();
    
    // Focus input
    if (userInput) {
      userInput.focus();
    }
    
    // Sync with popup
    chrome.runtime.sendMessage({
      action: 'syncChatData',
      chatData: {
        chatHistory: [],
        currentChatId,
        allChats
      }
    }).catch(error => {
      // Ignore errors if popup is not open
      console.log('OpenSeseme: Could not sync with popup (normal if popup is closed)');
    });
  } catch (error) {
    console.error('OpenSeseme: Error creating new chat:', error);
    showStatus('Error creating new chat', 'error');
  }
}

function updateChatList() {
  try {
    const chatList = floatingChat?.querySelector('.openseseme-chat-list-horizontal');
    if (!chatList) {
      console.error('OpenSeseme: Chat list container not found');
      return;
    }
    
    // Clear existing items
    chatList.innerHTML = '';
    
    const sortedChats = Object.values(allChats).sort((a, b) => b.timestamp - a.timestamp);
    
    sortedChats.forEach(chat => {
      const chatItem = document.createElement('div');
      chatItem.className = 'openseseme-chat-item';
      if (chat.id === currentChatId) {
        chatItem.classList.add('active');
      }
      chatItem.textContent = chat.title || 'Untitled Chat';
      
      // Add delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'openseseme-chat-delete';
      deleteBtn.innerHTML = '×';
      deleteBtn.title = 'Delete chat';
      
      // Delete button click handler
      deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await deleteChat(chat.id);
      };
      
      chatItem.appendChild(deleteBtn);
      
      // Chat item click handler
      chatItem.onclick = async (e) => {
        // Ignore clicks on the delete button
        if (e.target.classList.contains('openseseme-chat-delete')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (chat.id !== currentChatId) {
          await loadChat(chat.id);
        }
      };
      
      chatList.appendChild(chatItem);
    });
  } catch (error) {
    console.error('OpenSeseme: Error updating chat list:', error);
  }
}

async function loadChat(chatId) {
  try {
    // Prevent loading if chat doesn't exist
    if (!allChats[chatId]) {
      console.error('OpenSeseme: Chat not found:', chatId);
      return;
    }

    // Generate a timestamp for this update
    const updateTimestamp = Date.now();
    lastUpdateTimestamp = updateTimestamp;

    // Save current chat before switching
    if (currentChatId && currentChatId !== chatId && chatHistory.length > 0 && allChats[currentChatId]) {
      allChats[currentChatId].messages = chatHistory;
    }
    
    // Get the messages container early
    const messagesContainer = floatingChat.querySelector('.openseseme-chat-messages');
    if (!messagesContainer) {
      console.error('OpenSeseme: Messages container not found');
      return;
    }
    
    // Update current chat
    currentChatId = chatId;
    const chat = allChats[chatId];
    chatHistory = chat.messages || [];
    
    // Clear messages first to prevent UI jumping
    messagesContainer.innerHTML = '';
    
    // Small delay to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Add messages one by one
    for (const message of chatHistory) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `openseseme-chat-message ${message.role === 'user' ? 'openseseme-message-user' : 'openseseme-message-assistant'}`;
      
      const bubble = document.createElement('div');
      bubble.className = 'openseseme-message-bubble';
      bubble.textContent = message.content;
      
      messageDiv.appendChild(bubble);
      messagesContainer.appendChild(messageDiv);
    }
    
    // Scroll to bottom after all messages are added
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update chat list UI
    updateChatList();
    
    // Save the new current chat ID with timestamp
    await chrome.storage.local.set({ 
      chats: allChats,
      currentChatId: currentChatId,
      lastUpdateTimestamp: updateTimestamp
    });
  } catch (error) {
    console.error('OpenSeseme: Error loading chat:', error);
    showStatus('Error loading chat', 'error');
  }
}

async function deleteChat(chatId) {
  try {
    // Delete the chat
    delete allChats[chatId];
    
    // If we deleted the current chat, switch to another or create new
    if (chatId === currentChatId) {
      // Get remaining chats sorted by timestamp
      const remainingChats = Object.values(allChats).sort((a, b) => b.timestamp - a.timestamp);
      
      if (remainingChats.length > 0) {
        // Switch to the most recent chat
        await loadChat(remainingChats[0].id);
      } else {
        // No chats left, create a new one
        await createNewChat();
      }
    }
    
    // Update the chat list UI
    updateChatList();
    
    // Save to storage
    await saveChats();
    
    // Show confirmation
    showStatus('Chat deleted', 'success');
    
    // Sync with popup if it's open
    chrome.runtime.sendMessage({
      action: 'syncChatData',
      chatData: {
        chatHistory,
        currentChatId,
        allChats
      }
    }).catch(error => {
      // Ignore errors if popup is not open
      console.log('OpenSeseme: Could not sync with popup (normal if popup is closed)');
    });
  } catch (error) {
    console.error('OpenSeseme: Error deleting chat:', error);
    showStatus('Error deleting chat', 'error');
  }
}

// Add function to load saved chats from Chrome storage
async function loadSavedChats() {
  try {
    const result = await chrome.storage.local.get(['chats', 'currentChatId', 'lastUpdateTimestamp']);
    console.log('OpenSeseme: Loading saved chats from storage:', result);
    
    if (result.chats) {
      allChats = result.chats;
      updateChatList();
    }
    
    if (result.currentChatId && result.chats && result.chats[result.currentChatId]) {
      currentChatId = result.currentChatId;
      const chat = allChats[currentChatId];
      if (chat) {
        chatHistory = chat.messages || [];
        
        // Clear and reload messages
        const messagesContainer = floatingChat.querySelector('.openseseme-chat-messages');
        if (messagesContainer) {
          messagesContainer.innerHTML = '';
          chatHistory.forEach(message => {
            addChatMessage(message.content, message.role === 'user');
          });
        }
      }
    }
    
    if (result.lastUpdateTimestamp) {
      lastUpdateTimestamp = result.lastUpdateTimestamp;
    }
  } catch (error) {
    console.error('OpenSeseme: Error loading saved chats:', error);
  }
}

// Add function to save chats to Chrome storage
async function saveChats() {
  try {
    const updateTimestamp = Date.now();
    lastUpdateTimestamp = updateTimestamp;
    
    console.log('OpenSeseme: Saving chats to storage:', { chats: allChats, currentChatId: currentChatId });
    await chrome.storage.local.set({ 
      chats: allChats,
      currentChatId: currentChatId,
      lastUpdateTimestamp: updateTimestamp
    });
    console.log('OpenSeseme: Chats saved successfully');
  } catch (error) {
    console.error('OpenSeseme: Error saving chats:', error);
  }
}

// Add storage change listener to sync with other tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && floatingChat) {
    try {
      // Check if this is a newer update than what we've processed
      if (changes.lastUpdateTimestamp && changes.lastUpdateTimestamp.newValue) {
        const newTimestamp = changes.lastUpdateTimestamp.newValue;
        
        // Only process if this is a newer update
        if (newTimestamp <= lastUpdateTimestamp) {
          return; // Skip this update as we've already processed it or a newer one
        }
        
        lastUpdateTimestamp = newTimestamp;
      }
      
      // Debounce storage changes to prevent rapid updates
      if (updateChatList.timeout) {
        clearTimeout(updateChatList.timeout);
      }
      
      updateChatList.timeout = setTimeout(() => {
        // Check if chats were updated
        if (changes.chats || changes.currentChatId || changes.lastUpdateTimestamp) {
          console.log('OpenSeseme: Storage changed, syncing with other tabs');
          
          // Reload chats from storage
          chrome.storage.local.get(['chats', 'currentChatId', 'lastUpdateTimestamp'], (result) => {
            if (chrome.runtime.lastError) {
              console.error('OpenSeseme: Storage error:', chrome.runtime.lastError);
              return;
            }
            
            // Update timestamp tracking
            if (result.lastUpdateTimestamp) {
              lastUpdateTimestamp = result.lastUpdateTimestamp;
            }
            
            if (result.chats) {
              allChats = result.chats;
              updateChatList();
              
              // If current chat was updated, check if we need to reload messages
              if (currentChatId && allChats[currentChatId]) {
                const currentChat = allChats[currentChatId];
                // Only reload if messages have actually changed
                if (currentChat.messages && 
                    JSON.stringify(currentChat.messages) !== JSON.stringify(chatHistory)) {
                  chatHistory = currentChat.messages;
                  
                  // Reload messages display
                  const messagesContainer = floatingChat.querySelector('.openseseme-chat-messages');
                  if (messagesContainer) {
                    messagesContainer.innerHTML = '';
                    chatHistory.forEach(message => {
                      addChatMessage(message.content, message.role === 'user');
                    });
                  }
                }
              }
              
              // If a different chat is now current, switch to it
              if (result.currentChatId && result.currentChatId !== currentChatId) {
                // Update our local state without triggering another save
                currentChatId = result.currentChatId;
                const chat = allChats[currentChatId];
                if (chat) {
                  chatHistory = chat.messages || [];
                  
                  // Reload messages display
                  const messagesContainer = floatingChat.querySelector('.openseseme-chat-messages');
                  if (messagesContainer) {
                    messagesContainer.innerHTML = '';
                    chatHistory.forEach(message => {
                      addChatMessage(message.content, message.role === 'user');
                    });
                  }
                  
                  // Update chat list to show active state
                  updateChatList();
                }
              }
            }
          });
        }
      }, 100); // Debounce for 100ms
    } catch (error) {
      console.error('OpenSeseme: Error in storage listener:', error);
    }
  }
});

// Save state when page is being unloaded
window.addEventListener('beforeunload', async () => {
  try {
    if (currentChatId && chatHistory.length > 0 && allChats[currentChatId]) {
      allChats[currentChatId].messages = chatHistory;
      await saveChats();
    }
  } catch (error) {
    // Ignore errors during unload
  }
});

// Also save periodically to prevent data loss
setInterval(async () => {
  try {
    if (currentChatId && chatHistory.length > 0 && allChats[currentChatId]) {
      allChats[currentChatId].messages = chatHistory;
      await saveChats();
    }
  } catch (error) {
    // Ignore periodic save errors
  }
}, 30000); // Save every 30 seconds

function showToolsDropdown(inputElement) {
  const toolsDropdown = floatingChat.querySelector('#openseseme-tools-dropdown');
  if (!toolsDropdown) return;
  
  // Build dropdown content
  toolsDropdown.innerHTML = `
    <div class="openseseme-tools-dropdown-header">
      <div class="openseseme-tools-dropdown-title">Available Tools</div>
      <div class="openseseme-tools-dropdown-subtitle">Type @ followed by a tool name</div>
    </div>
    ${availableTools.map(tool => `
      <div class="openseseme-tool-item" data-tool="${tool.name}">
        <div class="openseseme-tool-name">@${tool.name}</div>
        <div class="openseseme-tool-description">${tool.description}</div>
        <div class="openseseme-tool-examples">
          ${tool.examples.map(ex => `<code>${ex}</code>`).join('')}
        </div>
      </div>
    `).join('')}
    <div class="openseseme-tools-dropdown-footer">
      💡 Or just describe what you want to do in plain English!
    </div>
  `;
  
  // Position dropdown based on which input is active
  if (isMinimized) {
    // Position for minimized input
    const minimizedContainer = floatingChat.querySelector('.openseseme-minimized-container');
    toolsDropdown.style.bottom = minimizedContainer.offsetHeight + 8 + 'px';
  } else {
    // Position for main input
    const bottomContainer = floatingChat.querySelector('.openseseme-bottom-input-container');
    toolsDropdown.style.bottom = bottomContainer.offsetHeight + 8 + 'px';
  }
  
  toolsDropdown.style.display = 'block';
  
  // Add click handlers to tool items
  const toolItems = toolsDropdown.querySelectorAll('.openseseme-tool-item');
  toolItems.forEach(item => {
    item.addEventListener('click', function() {
      const toolName = this.getAttribute('data-tool');
      const currentValue = inputElement.value;
      const lastAtIndex = currentValue.lastIndexOf('@');
      
      if (lastAtIndex !== -1) {
        inputElement.value = currentValue.substring(0, lastAtIndex) + '@' + toolName + ' ';
      } else {
        inputElement.value += '@' + toolName + ' ';
      }
      
      inputElement.focus();
      hideToolsDropdown();
    });
  });
}

function hideToolsDropdown() {
  const toolsDropdown = floatingChat.querySelector('#openseseme-tools-dropdown');
  if (toolsDropdown) {
    toolsDropdown.style.display = 'none';
  }
} 