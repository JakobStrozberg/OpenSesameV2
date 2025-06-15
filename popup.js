/**
 * 
 * This script is for the main user interface of the extension popup.
 * 
 * Key Features:
 * 
 * Tool Discovery System displays available tools when users type '@', including:
 *    - open_new_tab: Opens Google services or any URL
 *    - navigate_browser: Navigate to specific URLs
 *    - create_calendar_event: Create Google Calendar events
 *    - search: Search Google
 *    - take_screenshot: Capture the current page
 * 
 * Authentication Management gandles Google login flow for Calendar access,
 *    showing login button when needed and tracking authentication status.
 * 
 * Helper Service Integration monitors connection to the local helper service
 *    and displays appropriate warnings if the service is not running.
 * 
 * Chat Interface maintains conversation history and sends user requests to
 *    the background script for processing by the LLM agent. Features an
 *    expanding dialogue area that shows the full conversation.
 * 
 * Status Feedback provides visual feedback for success, errors, loading states,
 *    and informational messages with appropriate styling and auto-dismiss behavior.
 * 
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initial state elements
  const userInput = document.getElementById('userInput');
  const submitBtn = document.getElementById('submitBtn');
  const status = document.getElementById('status');
  
  // Expanded state elements
  const userInputExpanded = document.getElementById('userInputExpanded');
  const submitBtnExpanded = document.getElementById('submitBtnExpanded');
  const statusExpanded = document.getElementById('statusExpanded');
  
  // Chat elements
  const chatContainer = document.getElementById('chatContainer');
  const chatMessages = document.getElementById('chatMessages');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const newChatBtn = document.getElementById('newChatBtn');
  const chatList = document.getElementById('chatList');
  const minimizeBtn = document.getElementById('minimizeBtn');
  
  let chatHistory = [];
  let isLoggedIn = false;
  let currentChatId = null;
  let allChats = {};
  let currentInputElement = userInput; // Track which input is active
  let currentSubmitBtn = submitBtn;
  let currentStatus = status;

  // Initialize and load saved chats
  loadSavedChats();

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'syncChatData') {
      // Sync chat data from floating chat
      if (request.chatData) {
        chatHistory = request.chatData.chatHistory || [];
        currentChatId = request.chatData.currentChatId;
        allChats = request.chatData.allChats || {};
        updateChatList();
        saveChats();
      }
      sendResponse({ success: true });
    } else if (request.action === 'floatingChatClosed') {
      // Floating chat was closed, user might reopen popup
      sendResponse({ success: true });
    }
    return true;
  });

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

  const toolsDropdown = document.createElement('div');
  toolsDropdown.id = 'toolsDropdown';
  toolsDropdown.style.cssText = `
    position: absolute;
    background: white;
    border: 1px solid #e8eaed;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    max-height: 300px;
    overflow-y: auto;
    display: none;
    z-index: 1000;
    width: 450px;
  `;
  document.body.appendChild(toolsDropdown);

  function showToolsDropdown() {
    // Find the active input wrapper
    const activeInputWrapper = currentInputElement.closest('.input-wrapper');
    const rect = activeInputWrapper.getBoundingClientRect();
    
    // Position dropdown based on whether we're in expanded view
    if (document.body.classList.contains('expanded')) {
      // In expanded view, show above the input
      toolsDropdown.style.bottom = `${window.innerHeight - rect.top + 5}px`;
      toolsDropdown.style.top = 'auto';
    } else {
      // In initial view, show below the input
      toolsDropdown.style.top = `${rect.bottom + 5}px`;
      toolsDropdown.style.bottom = 'auto';
    }
    toolsDropdown.style.left = `${rect.left}px`;
    
    toolsDropdown.innerHTML = `
      <div style="padding: 12px; border-bottom: 1px solid #e8eaed;">
        <div style="font-size: 14px; font-weight: 600; color: #202124; margin-bottom: 4px;">Available Tools</div>
        <div style="font-size: 12px; color: #5f6368;">Type @ followed by a tool name</div>
      </div>
      ${availableTools.map(tool => `
        <div class="tool-item" data-tool="${tool.name}" style="
          padding: 12px;
          cursor: pointer;
          border-bottom: 1px solid #f8f9fa;
          transition: background-color 0.2s;
        " onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='white'">
          <div style="font-size: 14px; font-weight: 500; color: #1a73e8; margin-bottom: 4px;">@${tool.name}</div>
          <div style="font-size: 12px; color: #5f6368; margin-bottom: 6px;">${tool.description}</div>
          <div style="font-size: 11px; color: #80868b;">
            ${tool.examples.map(ex => `<code style="background: #f8f9fa; padding: 2px 4px; border-radius: 3px; margin-right: 6px;">${ex}</code>`).join('')}
          </div>
        </div>
      `).join('')}
      <div style="padding: 8px 12px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
        <div style="font-size: 11px; color: #5f6368;">💡 Or just describe what you want to do in plain English!</div>
      </div>
    `;
    
    toolsDropdown.style.display = 'block';
    
    const toolItems = toolsDropdown.querySelectorAll('.tool-item');
    toolItems.forEach(item => {
      item.addEventListener('click', function() {
        const toolName = this.getAttribute('data-tool');
        const currentValue = currentInputElement.value;
        const lastAtIndex = currentValue.lastIndexOf('@');
        
        if (lastAtIndex !== -1) {
          currentInputElement.value = currentValue.substring(0, lastAtIndex) + '@' + toolName + ' ';
        } else {
          currentInputElement.value += '@' + toolName + ' ';
        }
        
        currentInputElement.focus();
        hideToolsDropdown();
      });
    });
  }

  function hideToolsDropdown() {
    toolsDropdown.style.display = 'none';
  }

  // Set up input handling for both inputs
  function setupInputHandlers(inputElement, submitButton) {
    inputElement.addEventListener('input', function(event) {
      const value = inputElement.value;
      const cursorPosition = inputElement.selectionStart;
      
      if (value.trim().length > 0) {
        submitButton.classList.add('active');
      } else {
        submitButton.classList.remove('active');
      }
      
      currentInputElement = inputElement;
      
      if (value[cursorPosition - 1] === '@') {
        showToolsDropdown();
      } else {
        const beforeCursor = value.substring(0, cursorPosition);
        const lastAtIndex = beforeCursor.lastIndexOf('@');
        const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
        
        if (lastAtIndex === -1 || (lastSpaceIndex > lastAtIndex)) {
          hideToolsDropdown();
        }
      }
    });

    inputElement.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        if (toolsDropdown.style.display !== 'none') {
          event.preventDefault();
          hideToolsDropdown();
          return;
        }
        event.preventDefault();
        submitButton.click();
      } else if (event.key === 'Escape') {
        hideToolsDropdown();
      }
    });
    
    inputElement.addEventListener('focus', function() {
      currentInputElement = inputElement;
      currentSubmitBtn = submitButton;
      currentStatus = inputElement === userInput ? status : statusExpanded;
    });
  }

  // Set up handlers for both input areas
  setupInputHandlers(userInput, submitBtn);
  setupInputHandlers(userInputExpanded, submitBtnExpanded);

  document.addEventListener('click', function(event) {
    if (!toolsDropdown.contains(event.target) && event.target !== userInput && event.target !== userInputExpanded) {
      hideToolsDropdown();
    }
  });

  checkHelperService();

  async function checkHelperService() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkHelperService' });
      
      if (!response) {
        showStatus('⚠️ Helper service is not running. Please start it with: cd helper && npm start', 'error');
        submitBtn.disabled = true;
        submitBtnExpanded.disabled = true;
      } else {
        submitBtn.disabled = false;
        submitBtnExpanded.disabled = false;
        
        await checkAuthStatus();
      }
    } catch (error) {
      showStatus('⚠️ Cannot connect to helper service', 'error');
      submitBtn.disabled = true;
      submitBtnExpanded.disabled = true;
    }
  }

  async function checkAuthStatus() {
    try {
      const response = await fetch('http://localhost:5185/auth/status');
      const data = await response.json();
      
      isLoggedIn = data.loggedIn;
      updateLoginUI(isLoggedIn);
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  }

  function updateLoginUI(loggedIn) {
    const existingLoginBtn = document.getElementById('loginBtn');
    
    if (!loggedIn && !existingLoginBtn) {
      const loginContainer = document.createElement('div');
      loginContainer.id = 'loginContainer';
      loginContainer.style.marginBottom = '10px';
      loginContainer.style.textAlign = 'center';
      
      const loginBtn = document.createElement('button');
      loginBtn.id = 'loginBtn';
      loginBtn.textContent = '🔐 Login to Google';
      loginBtn.style.backgroundColor = '#4285f4';
      loginBtn.style.color = 'white';
      loginBtn.style.border = 'none';
      loginBtn.style.padding = '10px 20px';
      loginBtn.style.borderRadius = '4px';
      loginBtn.style.cursor = 'pointer';
      loginBtn.style.fontSize = '14px';
      
      loginBtn.addEventListener('click', async () => {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ Opening login...';
        
        try {
          const response = await fetch('http://localhost:5185/auth/google-login', { 
            method: 'POST' 
          });
          const data = await response.json();
          
          if (data.success) {
            showStatus('Please complete Google login in the Playwright browser window', 'info');
            
            const checkInterval = setInterval(async () => {
              const statusResponse = await fetch('http://localhost:5185/auth/status');
              const statusData = await statusResponse.json();
              
              if (statusData.loggedIn) {
                clearInterval(checkInterval);
                isLoggedIn = true;
                updateLoginUI(true);
                showStatus('✅ Successfully logged into Google Calendar!', 'success');
                submitBtn.disabled = false;
                submitBtnExpanded.disabled = false;
              }
            }, 2000);
            
            setTimeout(() => clearInterval(checkInterval), 300000);
          }
        } catch (error) {
          showStatus('Failed to initiate login', 'error');
          loginBtn.disabled = false;
          loginBtn.textContent = '🔐 Login to Google';
        }
      });
      
      loginContainer.appendChild(loginBtn);
      
      // Add login button to the appropriate container based on current state
      const targetContainer = document.querySelector('.initial-input-container');
      const inputWrapper = targetContainer.querySelector('.input-wrapper');
      inputWrapper.parentNode.insertBefore(loginContainer, inputWrapper);
      
    } else if (loggedIn && existingLoginBtn) {
      document.getElementById('loginContainer')?.remove();
    }
    
    if (!loggedIn) {
      submitBtn.title = 'Please log in to use calendar features';
      submitBtnExpanded.title = 'Please log in to use calendar features';
    } else {
      submitBtn.title = '';
      submitBtnExpanded.title = '';
    }
  }

  // Unified submit handler
  async function handleSubmit() {
    const input = currentInputElement.value.trim();
    if (!input) {
      showStatus('Please enter a request', 'error');
      return;
    }

    // Create new chat if needed
    if (!currentChatId) {
      currentChatId = Date.now().toString();
    }

    // If this is the first message in this chat, create the chat entry
    if (chatHistory.length === 0) {
      expandPopup();
      allChats[currentChatId] = {
        id: currentChatId,
        title: generateChatTitle(input),
        timestamp: Date.now(),
        messages: []
      };
      updateChatList();
      // Save immediately after creating new chat
      await saveChats();
    }

    // Update chat history with user message BEFORE displaying
    chatHistory.push({ role: 'user', content: input });
    allChats[currentChatId].messages = chatHistory;
    
    // Add user message to chat display
    addChatMessage(input, true, false); // Don't save again, we'll save after updating
    
    // Save after adding user message
    await saveChats();
    
    // Clear input and show loading
    currentInputElement.value = '';
    currentSubmitBtn.classList.remove('active');
    currentSubmitBtn.disabled = true;
    showLoadingIndicator();

    try {
      console.log('Sending request to agent:', input);
      
      const response = await chrome.runtime.sendMessage({
        action: 'invokeAgent',
        prompt: input,
        chatHistory: chatHistory
      });

      console.log('Response from agent:', response);
      hideLoadingIndicator();

      if (response && response.success) {
        // Update chat history with assistant response
        chatHistory.push({ role: 'assistant', content: response.result });
        allChats[currentChatId].messages = chatHistory;
        
        // Add assistant response to chat display
        addChatMessage(response.result, false, false); // Don't save in addChatMessage
        
        // Save the updated chat
        await saveChats();
        
        // Show brief success status
        showStatus('✅ Response received', 'success');
        
        if (response.intermediateSteps && response.intermediateSteps.length > 0) {
          console.log('Agent steps:', response.intermediateSteps);
        }
        
      } else if (response && response.needsLogin) {
        const errorMsg = '❌ Please log into Google Calendar first to use calendar features.';
        chatHistory.push({ role: 'assistant', content: errorMsg });
        allChats[currentChatId].messages = chatHistory;
        addChatMessage(errorMsg, false, false);
        await saveChats();
        showStatus('❌ Please log into Google Calendar first', 'error');
        await checkAuthStatus();
      } else {
        const errorMessage = response?.error || 'Failed to process request';
        console.error('Agent request failed:', errorMessage);
        const errorMsg = `❌ Error: ${errorMessage}`;
        chatHistory.push({ role: 'assistant', content: errorMsg });
        allChats[currentChatId].messages = chatHistory;
        addChatMessage(errorMsg, false, false);
        await saveChats();
        showStatus(`❌ ${errorMessage}`, 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      hideLoadingIndicator();
      const errorMsg = `❌ Error: ${error.message}`;
      chatHistory.push({ role: 'assistant', content: errorMsg });
      allChats[currentChatId].messages = chatHistory;
      addChatMessage(errorMsg, false, false);
      await saveChats();
      showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
      currentSubmitBtn.disabled = false;
      // Focus the expanded input if we're in expanded mode
      if (document.body.classList.contains('expanded')) {
        userInputExpanded.focus();
      } else {
        userInput.focus();
      }
    }
  }

  // Set up submit handlers for both buttons
  submitBtn.addEventListener('click', handleSubmit);
  submitBtnExpanded.addEventListener('click', handleSubmit);

  function showStatus(message, type) {
    // Show in both status areas
    [status, statusExpanded].forEach(statusEl => {
      statusEl.textContent = message;
      statusEl.className = `status ${type}`;
      statusEl.style.display = 'block';
    });
    
    if (type === 'success' && message.includes('✅')) {
      setTimeout(() => {
        status.style.display = 'none';
        statusExpanded.style.display = 'none';
      }, 8000);
    }
  }

  function showIntermediateSteps(steps) {
    const stepsDiv = document.getElementById('intermediateSteps');
    if (!stepsDiv) {
      const container = document.querySelector('.container');
      const newStepsDiv = document.createElement('div');
      newStepsDiv.id = 'intermediateSteps';
      newStepsDiv.style.marginTop = '10px';
      newStepsDiv.style.fontSize = '12px';
      newStepsDiv.style.opacity = '0.8';
      container.appendChild(newStepsDiv);
    }
    
    const stepsHTML = steps.map(step => `
      <div style="margin: 5px 0;">
        🔧 ${step.action || 'Action'}: ${step.tool || 'Tool'}
      </div>
    `).join('');
    
    document.getElementById('intermediateSteps').innerHTML = stepsHTML;
  }

  // Chat dialogue functions
  async function expandPopup() {
    // Original behavior - expand the popup window
    document.body.classList.add('expanded');
    // Transfer any text from initial input to expanded input
    if (userInput.value && !userInputExpanded.value) {
      userInputExpanded.value = userInput.value;
    }
    // Clear initial input
    userInput.value = '';
    // Focus expanded input
    setTimeout(() => {
      userInputExpanded.focus();
    }, 100);
  }

  function addChatMessage(content, isUser = false, save = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'message-user' : 'message-assistant'}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = content;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.appendChild(bubbleDiv);
    messageDiv.appendChild(timeDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Always save chat after adding message if we're saving
    if (save && currentChatId && allChats[currentChatId]) {
      // Update the messages in allChats before saving
      allChats[currentChatId].messages = chatHistory;
      saveChats();
    }
  }

  function showLoadingIndicator() {
    loadingIndicator.classList.add('visible');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideLoadingIndicator() {
    loadingIndicator.classList.remove('visible');
  }

  // Chat persistence functions
  async function loadSavedChats() {
    try {
      const result = await chrome.storage.local.get(['chats', 'currentChatId']);
      console.log('Loading saved chats:', result);
      
      if (result.chats) {
        allChats = result.chats;
        updateChatList();
      }
      
      if (result.currentChatId && result.chats && result.chats[result.currentChatId]) {
        currentChatId = result.currentChatId;
        await loadChat(currentChatId);
      }
    } catch (error) {
      console.error('Error loading saved chats:', error);
    }
  }

  async function saveChats() {
    try {
      console.log('Saving chats:', { chats: allChats, currentChatId: currentChatId });
      await chrome.storage.local.set({ 
        chats: allChats,
        currentChatId: currentChatId 
      });
      console.log('Chats saved successfully');
    } catch (error) {
      console.error('Error saving chats:', error);
    }
  }

  function generateChatTitle(firstMessage) {
    // Generate a title from the first message (max 30 chars)
    const title = firstMessage.length > 30 
      ? firstMessage.substring(0, 27) + '...' 
      : firstMessage;
    return title;
  }

  async function createNewChat() {
    // Save current chat if it exists
    if (currentChatId && chatHistory.length > 0 && allChats[currentChatId]) {
      allChats[currentChatId].messages = chatHistory;
      await saveChats();
    }

    // Create new chat
    currentChatId = Date.now().toString();
    chatHistory = [];
    chatMessages.innerHTML = '';
    
    // Save the new currentChatId
    await saveChats();
    
    // Don't add to allChats yet - wait for first message
    updateChatList();
  }

  async function loadChat(chatId) {
    if (!allChats[chatId]) return;

    // Save current chat before switching
    if (currentChatId && currentChatId !== chatId && chatHistory.length > 0 && allChats[currentChatId]) {
      allChats[currentChatId].messages = chatHistory;
      await saveChats();
    }

    currentChatId = chatId;
    chatHistory = allChats[chatId].messages || [];
    
    // Clear and repopulate messages
    chatMessages.innerHTML = '';
    chatHistory.forEach(msg => {
      addChatMessage(msg.content, msg.role === 'user', false);
    });

    // Update active state in sidebar
    updateChatList();
    
    // Save the new current chat ID
    await saveChats();
    
    // Don't automatically expand - let user decide
  }

  async function deleteChat(chatId) {
    delete allChats[chatId];
    
    if (currentChatId === chatId) {
      // If deleting current chat, create new one
      await createNewChat();
    }
    
    await saveChats();
    updateChatList();
  }

  function updateChatList() {
    chatList.innerHTML = '';
    
    // Sort chats by timestamp (newest first)
    const sortedChats = Object.entries(allChats)
      .sort(([, a], [, b]) => b.timestamp - a.timestamp);
    
    sortedChats.forEach(([chatId, chat]) => {
      const chatItem = document.createElement('div');
      chatItem.className = 'chat-item';
      if (chatId === currentChatId) {
        chatItem.classList.add('active');
      }
      
      // For horizontal layout, just show the title
      chatItem.textContent = chat.title;
      
      // Add delete button as a span
      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'chat-item-delete';
      deleteBtn.textContent = ' ×';
      deleteBtn.title = 'Delete chat';
      
      chatItem.appendChild(deleteBtn);
      
      // Click to load chat
      chatItem.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('chat-item-delete')) {
          await loadChat(chatId);
        }
      });
      
      // Click to delete
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this chat?')) {
          await deleteChat(chatId);
        }
      });
      
      chatList.appendChild(chatItem);
    });
  }

  // Event listeners
  newChatBtn.addEventListener('click', createNewChat);
  
  // Minimize button functionality
  minimizeBtn.addEventListener('click', function() {
    // Simply minimize back to the original state
    document.body.classList.remove('expanded');
    // Clear the initial input to avoid duplicate text
    userInput.value = '';
    // Focus back on the initial input
    userInput.focus();
  });
}); 