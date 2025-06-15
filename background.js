/**
 * Background Service Worker for OpenSesame Extension
 * 
 * This file acts as a connection between the Chrome extension UI and the helper service
 * running on localhost:5185. It manages the following:
 * 
 * 1. Tab Request Polling (it continuously polls the helper service for pending tab
 *    operations (opening new tabs, taking screenshots) and executes them.)
 * 
 * 2. Screenshot Management handles screenshot capture requests with rate limiting
 *     and saves them to the Downloads folder with timestamped filenames.
 * 
 * 3. Agent Communication forwards LLM agent requests from the popup
 *    to the helper service and returns responses.
 * 
 * 4. Service Health Monitoring checks if the helper service is running and
 *    manages the polling lifecycle
 * 
 * 5. API Key Storage manages OpenAI API key storage in Chrome's local storage
 *    for use by the extension.
 * 
 * The service worker automatically starts polling when the helper service is
 * healthy and stops when the extension is suspended or the helper is unavailable.
 */

const HELPER_SERVICE_URL = 'http://localhost:5185';

let tabPollingInterval = null;

let lastScreenshotTime = null;

async function startTabRequestPolling() {
  if (tabPollingInterval) return;
  
  tabPollingInterval = setInterval(async () => {
    try {
      const response = await fetch(`${HELPER_SERVICE_URL}/tab-requests`);
      if (!response.ok) return;
      
      const data = await response.json();
      if (data.requests && data.requests.length > 0) {
        for (const request of data.requests) {
          if (request.status === 'pending') {
            if (request.action === 'screenshot') {
              try {
                const now = Date.now();
                if (lastScreenshotTime && (now - lastScreenshotTime) < 500) {
                  throw new Error('Screenshot rate limit exceeded. Please wait before taking another screenshot.');
                }
                lastScreenshotTime = now;
                
                const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { 
                  format: 'png' 
                });
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const filename = `screenshot-${timestamp}.png`;
                
                const downloadId = await chrome.downloads.download({
                  url: dataUrl,
                  filename: filename,
                  saveAs: false
                });
                
                await fetch(`${HELPER_SERVICE_URL}/tab-requests/${request.id}/complete`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ 
                    success: true, 
                    filename: filename,
                    downloadId: downloadId 
                  })
                });
                
                console.log(`Screenshot saved to Downloads as ${filename}`);
              } catch (error) {
                console.error('Failed to capture screenshot:', error);
                
                await fetch(`${HELPER_SERVICE_URL}/tab-requests/${request.id}/complete`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ error: error.message })
                });
              }
            } else {
              const tab = await chrome.tabs.create({ 
                url: request.url, 
                active: true 
              });
              
              await fetch(`${HELPER_SERVICE_URL}/tab-requests/${request.id}/complete`, {
                method: 'POST'
              });
              
              console.log(`Opened tab for ${request.serviceName || request.url}`);
            }
          }
        }
      }
    } catch (error) {
    }
  }, 500);
}

function stopTabRequestPolling() {
  if (tabPollingInterval) {
    clearInterval(tabPollingInterval);
    tabPollingInterval = null;
  }
}

async function checkHelperService() {
  try {
    const response = await fetch(`${HELPER_SERVICE_URL}/health`);
    const data = await response.json();
    const isHealthy = data.status === 'healthy';
    
    if (isHealthy) {
      startTabRequestPolling();
    } else {
      stopTabRequestPolling();
    }
    
    return isHealthy;
  } catch (error) {
    console.error('Helper service not available:', error);
    stopTabRequestPolling();
    return false;
  }
}

async function invokeAgent(prompt, chatHistory = []) {
  try {
    const response = await fetch(`${HELPER_SERVICE_URL}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        chatHistory
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error invoking agent:', error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkHelperService') {
    checkHelperService().then(sendResponse);
    return true;
  }

  if (request.action === 'invokeAgent') {
    const { prompt, chatHistory } = request;
    
    invokeAgent(prompt, chatHistory)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      });
    
    return true;
  }

  if (request.action === 'navigateBrowser') {
    const { url } = request;
    
    fetch(`${HELPER_SERVICE_URL}/browser/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url })
    })
    .then(response => response.json())
    .then(result => sendResponse(result))
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ needsSetup: true });
  }
});

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openaiApiKey'], (result) => {
      resolve(result.openaiApiKey);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveApiKey') {
    chrome.storage.local.set({ openaiApiKey: request.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getApiKey') {
    getApiKey().then(apiKey => {
      sendResponse({ apiKey });
    });
    return true;
  }
});

chrome.runtime.onSuspend.addListener(() => {
  stopTabRequestPolling();
}); 