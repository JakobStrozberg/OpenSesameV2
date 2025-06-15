/**
 * 
 * This express server us the backend for the OpenSesame browser automation extension,
 * it provides browser control through LangChain and Playwright.
 * 
 * the Components:
 * 
 * Environment Settup: Loads environment variables and configures the Express app with
 *    CORS support for cross-origin requests from the Chrome extension.
 * 
 * Uses Playwright with Chrome to maintain a persistent browser
 *    context that preserves login sessions. The browser runs in non-headless mode so
 *    users can see automation in progress. Special configurations remove automation
 *    indicators to avoid detection.
 * 
 * Google Services Integration provides mappings for all major Google services
 *    (Sheets, Docs, Calendar, Gmail, etc.) and handles creating new documents.
 * 
 * Date/Time Parsing handles natural language date/time
 *    inputs like "tomorrow at 2pm", "next Monday", or specific dates. Supports 
 *    dates + day names + and various time formats with intelligent AM/PM detection.
 * 
 * LangChain Tools used:
 *    - open_new_tab: opens new tabs for Google services, URLs, and search queries
 *    - navigate_browser: opens URLs in new tabs in the user's Chrome browser
 *    - create_calendar_event: automates Google Calendar event creation with keyboard navigation
 *    - take_screenshot: captures browser screenshots via Chrome Extension API
 *    - wait: utility tool for adding delays in automation sequences
 * 
 * Agent Configuration creates a structured chat agent with specific instructions
 *    for handling user requests, detecting search queries, and choosing appropriate tools.
 *    Includes safeguards against infinite loops and proper task completion detection.
 * 
 * API Endpoints:
 *    - POST /invoke: Main endpoint for processing natural language commands
 *    - GET /tab-requests: Polling endpoint for Chrome extension to check pending actions
 *    - POST /tab-requests/:id/complete: Marks tab requests as completed
 *    - POST /auth/google-login: Initiates Google login flow
 *    - GET /auth/status: Checks authentication status
 *    - POST /auth/logout: Logs out of Google services
 *    - POST /browser/navigate: Direct browser navigation
 *    - GET /health: Service health check
 * 
 * Session Persistence - Stores browser data in a local directory to maintain login
 *    sessions across restarts, avoiding repeated authentication.
 * 
 */

import express from "express";
import cors from "cors";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { chromium } from "playwright";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
import fs from 'fs';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { initializeAgentExecutorWithOptions } from "langchain/agents";


dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
app.use(express.json());
app.use(cors());
const llm = new ChatOpenAI({ 
  model: "gpt-4o-mini", 
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY 
});


const userDataDir = path.join(__dirname, 'browser-data');
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}
let browser;
let browserContext;
let page;
let pendingTabRequests = new Map();


const GOOGLE_SERVICES = {
  'sheets': 'https://sheets.google.com',
  'docs': 'https://docs.google.com',
  'slides': 'https://slides.google.com',
  'forms': 'https://forms.google.com',
  'drive': 'https://drive.google.com',
  'calendar': 'https://calendar.google.com',
  'gmail': 'https://mail.google.com',
  'mail': 'https://mail.google.com',
  'maps': 'https://maps.google.com',
  'meet': 'https://meet.google.com',
  'keep': 'https://keep.google.com',
  'photos': 'https://photos.google.com',
  'contacts': 'https://contacts.google.com',
  'tasks': 'https://tasks.google.com',
  'translate': 'https://translate.google.com',
  'news': 'https://news.google.com',
  'youtube': 'https://youtube.com',
  'scholar': 'https://scholar.google.com',
  'books': 'https://books.google.com',
  'earth': 'https://earth.google.com'
};
const CREATE_NEW_URLS = {
  'sheets': 'https://sheets.google.com/create',
  'docs': 'https://docs.google.com/create',
  'slides': 'https://slides.google.com/create',
  'forms': 'https://forms.google.com/create'
};


function parseDateTimeString(dateTimeStr) {
  const now = new Date();
  let targetDate = new Date();
  let targetTime = null;
  
  const lowerDateTime = dateTimeStr.toLowerCase();
  
  // Parse relative dates
  if (lowerDateTime.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lowerDateTime.includes('today')) {

  } else if (lowerDateTime.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  } else if (lowerDateTime.includes('next monday')) {
    targetDate.setDate(targetDate.getDate() + ((1 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('next tuesday')) {
    targetDate.setDate(targetDate.getDate() + ((2 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('next wednesday')) {
    targetDate.setDate(targetDate.getDate() + ((3 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('next thursday')) {
    targetDate.setDate(targetDate.getDate() + ((4 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('next friday')) {
    targetDate.setDate(targetDate.getDate() + ((5 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('next saturday')) {
    targetDate.setDate(targetDate.getDate() + ((6 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('next sunday')) {
    targetDate.setDate(targetDate.getDate() + ((0 + 7 - targetDate.getDay()) % 7 || 7));
  } else if (lowerDateTime.includes('monday')) {
    const daysUntilMonday = (1 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilMonday || 7));
  } else if (lowerDateTime.includes('tuesday')) {
    const daysUntilTuesday = (2 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilTuesday || 7));
  } else if (lowerDateTime.includes('wednesday')) {
    const daysUntilWednesday = (3 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilWednesday || 7));
  } else if (lowerDateTime.includes('thursday')) {
    const daysUntilThursday = (4 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilThursday || 7));
  } else if (lowerDateTime.includes('friday')) {
    const daysUntilFriday = (5 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilFriday || 7));
  } else if (lowerDateTime.includes('saturday')) {
    const daysUntilSaturday = (6 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilSaturday || 7));
  } else if (lowerDateTime.includes('sunday')) {
    const daysUntilSunday = (0 - targetDate.getDay() + 7) % 7;
    targetDate.setDate(targetDate.getDate() + (daysUntilSunday || 7));
  } else {
    // Check for "in X days" pattern
    const inDaysMatch = lowerDateTime.match(/in\s+(\d+)\s+days?/);
    if (inDaysMatch) {
      targetDate.setDate(targetDate.getDate() + parseInt(inDaysMatch[1]));
    } else {
      // Check for specific date formats like "June 10th", "Dec 25" or "12/25"
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const shortMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      // Try to match "June 10th" or "June 10" format
      const monthDayMatch = dateTimeStr.match(/(\w+)\s+(\d+)(?:st|nd|rd|th)?/i);
      if (monthDayMatch) {
        const monthStr = monthDayMatch[1].toLowerCase();
        const day = parseInt(monthDayMatch[2]);
        
        // Check full month names
        let monthIndex = monthNames.findIndex(m => m.startsWith(monthStr));
        if (monthIndex === -1) {
          // Check short month names
          monthIndex = shortMonthNames.findIndex(m => m === monthStr.substring(0, 3));
        }
        
        if (monthIndex !== -1) {
          targetDate.setMonth(monthIndex);
          targetDate.setDate(day);
          // If the date is in the past, assume next year
          if (targetDate < now) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
        }
      } else {
        // Check for MM/DD format
        const slashDateMatch = dateTimeStr.match(/(\d{1,2})\/(\d{1,2})/);
        if (slashDateMatch) {
          targetDate.setMonth(parseInt(slashDateMatch[1]) - 1);
          targetDate.setDate(parseInt(slashDateMatch[2]));
          // If the date is in the past, assume next year
          if (targetDate < now) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
        }
      }
    }
  }
  
  // Extract time if present - improved regex
  const timeMatch = dateTimeStr.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)|(?:at\s+)?noon|(?:at\s+)?midnight/i);
  if (timeMatch) {
    const fullMatch = timeMatch[0].toLowerCase();
    
    if (fullMatch.includes('noon')) {
      targetTime = { hour: 12, minute: 0, period: 'PM' };
    } else if (fullMatch.includes('midnight')) {
      targetTime = { hour: 12, minute: 0, period: 'AM' };
    } else {
      // Extract hour, minute, and period
      const hour = parseInt(timeMatch[1] || '12');
      const minute = parseInt(timeMatch[2] || '0');
      const period = (timeMatch[3] || '').toUpperCase();
      
      // If no period specified, make reasonable assumptions
      let finalPeriod = period;
      if (!period) {
        if (hour === 12) {
          finalPeriod = 'PM'; // 12 without AM/PM = noon (PM)
        } else if (hour >= 1 && hour <= 6) {
          finalPeriod = 'PM'; // 1-6 without AM/PM likely PM
        } else if (hour >= 7 && hour <= 11) {
          finalPeriod = 'AM'; // 7-11 without AM/PM likely AM
        } else {
          finalPeriod = 'PM'; // Default to PM
        }
      }
      
      targetTime = {
        hour: hour,
        minute: minute,
        period: finalPeriod
      };
    }
  }
  
  return { targetDate, targetTime };
}

async function initializeBrowser() {
  console.log("Initializing Chrome browser with persistent context...");
  
  try {

    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome', 
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      viewport: null,

      ignoreDefaultArgs: ['--enable-automation'],
    });
    

    const pages = browserContext.pages();
    page = pages.length > 0 ? pages[0] : await browserContext.newPage();
    

    await page.addInitScript(() => {

      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      

      window.chrome = {
        runtime: {},
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
    
    console.log("Chrome browser initialized with persistent context");
    console.log("User data saved in:", userDataDir);
    

    
  } catch (error) {
    console.error("Failed to initialize browser:", error);
    throw error;
  }
}

async function closeBrowser() {
  console.log("Closing browser...");
  try {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
      page = null;
    }
    console.log("Browser closed successfully");
  } catch (error) {
    console.error("Error closing browser:", error);
  }
}

async function ensureBrowserOpen() {
  try {

    if (browserContext && !browserContext.isConnected?.()) {
      console.log('Browser context disconnected, reinitializing...');
      browserContext = null;
      page = null;
    }
    

    if (page && page.isClosed?.()) {
      console.log('Page was closed, creating new page...');
      page = null;
    }
    
    if (!browserContext || !page) {
      await initializeBrowser();
    }
    

    if (page) {
      try {
        await page.evaluate(() => document.readyState);
      } catch (e) {
        console.log('Page not responsive, creating new page...');
        page = await browserContext.newPage();
        
        // Re-add init script to new page
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
          });
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
          });
          window.chrome = { runtime: {} };
        });
      }
    }
  } catch (error) {
    console.error('Error ensuring browser is open:', error);
   
    browserContext = null;
    page = null;
    await initializeBrowser();
  }
}

// Create LangChain tools
const tools = [
 
  new DynamicStructuredTool({
    name: "open_new_tab",
    description: "Opens a new tab in the user's Chrome browser with the specified URL. Use this for opening Google services like Sheets, Docs, Gmail, etc., any URL, or Google searches.",
    schema: z.object({
      service: z.string().optional().describe("The Google service name (e.g., 'sheets', 'docs', 'gmail') or 'new docs', 'new sheets' to create new documents"),
      url: z.string().optional().describe("Direct URL to open (if not a Google service)"),
      search: z.string().optional().describe("Search query to google (will be automatically formatted into a Google search URL)")
    }),
    func: async ({ service, url, search }) => {
      let finalUrl = url;
      let serviceName = service;
      

      if (search && !url && !service) {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(search)}`;
        serviceName = `Google Search: ${search}`;
      }
      
  
      if (service && !url && !search) {
        const lowerService = service.toLowerCase();
        
     
        if (lowerService.startsWith('new ')) {
          const docType = lowerService.replace('new ', '');
          if (CREATE_NEW_URLS[docType]) {
            finalUrl = CREATE_NEW_URLS[docType];
            serviceName = `New ${docType.charAt(0).toUpperCase() + docType.slice(1)}`;
          }
        } else if (GOOGLE_SERVICES[lowerService]) {
          finalUrl = GOOGLE_SERVICES[lowerService];
          serviceName = lowerService.charAt(0).toUpperCase() + lowerService.slice(1);
        } else if (lowerService === 'google') {
          finalUrl = 'https://www.google.com';
          serviceName = 'Google';
        }
      }
      
      if (!finalUrl) {
        throw new Error("Please provide either a service name, URL, or search query");
      }
      
      // Create a unique request ID
      const requestId = Date.now().toString();
      
      
      pendingTabRequests.set(requestId, {
        url: finalUrl,
        serviceName,
        status: 'pending'
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      

      const request = pendingTabRequests.get(requestId);
      if (request && request.status === 'completed') {
        pendingTabRequests.delete(requestId);
        return `Task completed successfully! I have opened ${serviceName || finalUrl} in a new tab for you.`;
      }
      
      return `Task completed! I have requested to open ${serviceName || finalUrl} in a new tab.`;
    }
  }),

 
  new DynamicStructuredTool({
    name: "navigate_browser",
    description: "Open a URL in a new tab in the current browser window. Use this to navigate to any website in your actual Chrome browser.",
    schema: z.object({
      url: z.string().describe("The URL to navigate to")
    }),
    func: async ({ url }) => {
    
      const requestId = Date.now().toString();
      
 
      pendingTabRequests.set(requestId, {
        url: url,
        serviceName: url,
        status: 'pending'
      });
      
 
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      
      const request = pendingTabRequests.get(requestId);
      if (request && request.status === 'completed') {
        pendingTabRequests.delete(requestId);
        return `Successfully opened ${url} in a new tab in your current browser window.`;
      }
      
      return `Requested to open ${url} in a new tab in your current browser window.`;
    }
  }),

  //Tool for creating calendar events
  new DynamicStructuredTool({
    name: "create_calendar_event",
    description: "Create a Google Calendar event with title and optional date/time. This requires browser automation.",
    schema: z.object({
      title: z.string().describe("The title of the calendar event"),
      dateTime: z.string().optional().describe("The date and time of the event (e.g., 'tomorrow at 2pm', 'next Monday at noon')")
    }),
    func: async ({ title, dateTime }) => {
      await ensureBrowserOpen();
      if (!page) throw new Error("Browser not initialized");
      
      try {
        console.log(`Creating calendar event: "${title}"${dateTime ? ` at ${dateTime}` : ''}`);
        
        // Navigate to Google Calendar
        await page.goto('https://calendar.google.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 1000 // CHANGE THIS
        });
        console.log('Navigated to Google Calendar');
        
        // Wait for page to load - reduced wait time
        await page.waitForTimeout(1000);
        await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {
          console.log('Network idle timeout - proceeding anyway');
        });
        
        // Step 1: Select Create (same way its being done now)
        try {
          await page.getByRole('button', { name: 'Create' }).click();
          console.log('✓ Clicked Create button');
        } catch (e) {
          // Fallback to keyboard shortcut
          console.log('Using keyboard shortcut "c"');
          await page.keyboard.press('c');
        }
        
        await page.waitForTimeout(500); 
        
        // Step 2: Select Event (same way its being done now)
        try {
          await page.getByRole('menuitem', { name: 'Event' }).click();
          console.log('✓ Selected Event option');
          await page.waitForTimeout(500); 
        } catch (e) {
          console.log('Event option not needed or already selected');
        }
        
        await page.waitForTimeout(500); 
        
        // Step 3: Type the event title immediately after selecting Event
        await page.keyboard.type(title);
        console.log(`✓ Typed event title: "${title}"`);
        await page.waitForTimeout(500); 
        
        // Step 4: Type tab
        await page.keyboard.press('Tab');
        console.log('✓ Pressed Tab (1)');
        await page.waitForTimeout(500); 
        
        // Step 5: Type tab
        await page.keyboard.press('Tab');
        console.log('✓ Pressed Tab (2)');
        await page.waitForTimeout(500); 
        
        // Step 6: Type enter (take advantage of Google's built-in language processing)
        await page.keyboard.press('Enter');
        console.log('✓ Pressed Enter (activating natural language processing)');
        await page.waitForTimeout(500); 
        
        // Step 7: Type the date in "MONTH, DAY, YEAR" format
        if (dateTime) {
          const { targetDate } = parseDateTimeString(dateTime);
          
          if (targetDate) {
            // Format date as "MONTH, DAY, YEAR" as specified
            const monthName = targetDate.toLocaleDateString('en-US', { month: 'long' });
            const day = targetDate.getDate();
            const year = targetDate.getFullYear();
            const formattedDate = `${monthName}, ${day}, ${year}`;
            
            await page.keyboard.type(formattedDate);
            console.log(`✓ Typed date: "${formattedDate}"`);
          }
        }
        await page.waitForTimeout(500); 
        
      
        await page.keyboard.press('Tab');
        console.log('✓ Pressed Tab (3) - moving to start time field');
        await page.waitForTimeout(500); 
        
 
        if (dateTime) {
          const { targetTime } = parseDateTimeString(dateTime);
          if (targetTime) {
            const startTimeString = `${targetTime.hour}:${targetTime.minute.toString().padStart(2, '0')} ${targetTime.period}`;
            await page.keyboard.type(startTimeString);
            console.log(`✓ Typed start time: "${startTimeString}"`);
          }
        }
        await page.waitForTimeout(500);
        
      
        await page.keyboard.press('Tab');
        console.log('✓ Pressed Tab (4) - moving to end time field');
        await page.waitForTimeout(500); 
        

        if (dateTime) {
          const { targetTime } = parseDateTimeString(dateTime);
          if (targetTime) {

            let endHour = targetTime.hour;
            let endPeriod = targetTime.period;
            
            if (endHour === 12 && targetTime.period === 'AM') {
              endHour = 1;
              endPeriod = 'AM';
            } else if (endHour === 11 && targetTime.period === 'AM') {
              endHour = 12;
              endPeriod = 'PM';
            } else if (endHour === 12 && targetTime.period === 'PM') {
              endHour = 1;
              endPeriod = 'PM';
            } else if (endHour === 11 && targetTime.period === 'PM') {
              endHour = 12;
              endPeriod = 'AM';
            } else if (targetTime.period === 'AM') {
              endHour = endHour + 1;
            } else {
              endHour = endHour + 1;
            }
            
            const endTimeString = `${endHour}:${targetTime.minute.toString().padStart(2, '0')} ${endPeriod}`;
            await page.keyboard.type(endTimeString);
            console.log(`✓ Typed end time: "${endTimeString}"`);
          }
        }
        await page.waitForTimeout(500); 
        

        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          console.log(`✓ Pressed Tab (${5 + i})`);
          await page.waitForTimeout(500); 
        }
        

        await page.keyboard.press('Enter');
        console.log('✓ Pressed Enter (adding the event)');
        

        await page.waitForTimeout(1000); 

 
        await closeBrowser();
        console.log('✓ Browser closed after event creation');
        
        return `Successfully created calendar event: "${title}"${dateTime ? ` at ${dateTime}` : ''}`;
        
      } catch (error) {
        console.error('Error creating calendar event:', error);

        await closeBrowser();
        throw error;
      }
    }
  }),

  // Additional browser automation tools

  new DynamicStructuredTool({
    name: "take_screenshot",
    description: "Take a screenshot of the current browser tab using Chrome Extension API",
    schema: z.object({}),
    func: async () => {
      try {
  
        const requestId = Date.now().toString();
        

        pendingTabRequests.set(requestId, {
          action: 'screenshot',
          status: 'pending'
        });
        

        let attempts = 0;
        const maxAttempts = 10; 
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const request = pendingTabRequests.get(requestId);
          if (request && request.status === 'completed') {
            pendingTabRequests.delete(requestId);
            
            if (request.error) {
              throw new Error(request.error);
            }
            
            if (request.success && request.filename) {
              return `Screenshot taken successfully and saved to Downloads folder as "${request.filename}"`;
            }
            
            return `Screenshot taken successfully using Chrome Extension API`;
          }
          attempts++;
        }
        

        pendingTabRequests.delete(requestId);
        throw new Error('Screenshot request timed out - make sure the Chrome extension is active');
        
      } catch (error) {
        console.error('Error taking screenshot:', error);
        throw new Error(`Failed to take screenshot: ${error.message}`);
      }
    }
  }),

  new DynamicStructuredTool({
    name: "wait",
    description: "Wait for a specified number of milliseconds",
    schema: z.object({
      milliseconds: z.number().describe("Number of milliseconds to wait")
    }),
    func: async ({ milliseconds }) => {
      await new Promise(resolve => setTimeout(resolve, milliseconds));
      return `Waited for ${milliseconds}ms`;
    }
  }),






  // Tool for sending emails via Gmail
  new DynamicStructuredTool({
    name: "send_email",
    description: "Send an email through Gmail using browser automation. This tool will open Gmail, compose an email with the specified recipient and request, generate an appropriate subject and body, and send it.",
    schema: z.object({
      recipientEmail: z.string().describe("The email address to send to (e.g., 'example@gmail.com')"),
      request: z.string().describe("What the email is requesting or about (e.g., 'requesting a meeting next week', 'asking for project update')")
    }),
    func: async ({ recipientEmail, request }) => {
      await ensureBrowserOpen();
      if (!page) throw new Error("Browser not initialized");
      
      try {
        console.log(`Sending email to: ${recipientEmail} about: ${request}`);
        
        // Check if logged into Gmail
        const hasStoredSession = fs.existsSync(path.join(userDataDir, 'Default'));
        if (!hasStoredSession) {
          throw new Error("Not logged into Gmail. Please log in first using the Google login tool.");
        }
        
        // Navigate to Gmail
        await page.goto('https://mail.google.com/mail/', { 
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Wait for Gmail to load - wait for compose button
        await page.waitForTimeout(3000);
        
        // Click compose button - try multiple selectors
        try {
          // Try the common compose button selectors
          const composeClicked = await page.evaluate(() => {
            // Look for compose button by text content
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
            const composeButton = buttons.find(btn => {
              const text = btn.textContent?.toLowerCase() || '';
              return text.includes('compose') || text.includes('new');
            });
            
            if (composeButton) {
              composeButton.click();
              return true;
            }
            
            // Try common Gmail compose button classes/attributes
            const selectors = [
              '[gh="cm"]', // Gmail's compose button attribute
              '.T-I.T-I-KE.L3', // Common compose button class
              '.T-I.J-J5-Ji.T-I-KE.L3', // Another common class
              'div[jsaction*="compose"]' // Action-based selector
            ];
            
            for (const selector of selectors) {
              const el = document.querySelector(selector);
              if (el) {
                el.click();
                return true;
              }
            }
            
            return false;
          });
          
          if (!composeClicked) {
            // Fallback to keyboard shortcut
            console.log('Using keyboard shortcut "c" for compose');
            await page.keyboard.press('c');
          }
          
          console.log('✓ Opened compose window');
        } catch (e) {
          console.log('Using keyboard shortcut for compose');
          await page.keyboard.press('c');
        }
        
        // Wait for compose window to open
        await page.waitForTimeout(2000);
        
        // Fill in the recipient - the To field should be focused
        await page.keyboard.type(recipientEmail);
        console.log(`✓ Entered recipient: ${recipientEmail}`);
        
        // Press Enter to confirm the email address in Gmail
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        
        // Now Tab to subject field
        await page.keyboard.press('Tab');
        await page.waitForTimeout(500);
        
        // Generate subject using LLM
        const subjectPrompt = `Generate a concise, professional email subject line for an email that is ${request}. Keep it under 10 words. Only return the subject line, nothing else.`;
        const subjectResponse = await llm.invoke([
          new SystemMessage("You are a helpful assistant that generates email subject lines."),
          new HumanMessage(subjectPrompt)
        ]);
        const subject = subjectResponse.content.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
        
        await page.keyboard.type(subject);
        console.log(`✓ Entered subject: ${subject}`);
        
        // Tab to body field
        await page.keyboard.press('Tab');
        await page.waitForTimeout(500);
        
        // Generate email body using LLM
        const bodyPrompt = `Write a professional email body for ${request}. 
        Keep it concise, polite, and to the point. 
        Include a proper greeting and sign-off.
        Do not include a subject line or email headers.
        Keep it under 150 words.`;
        
        const bodyResponse = await llm.invoke([
          new SystemMessage("You are a helpful assistant that writes professional emails."),
          new HumanMessage(bodyPrompt)
        ]);
        const emailBody = bodyResponse.content.trim();
        
        // Type the email body
        await page.keyboard.type(emailBody);
        console.log('✓ Entered email body');
        
        // Wait a moment before sending
        await page.waitForTimeout(1000);
        
        // Send the email using Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac)
        const isMac = process.platform === 'darwin';
        if (isMac) {
          await page.keyboard.down('Meta');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Meta');
        } else {
          await page.keyboard.down('Control');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Control');
        }
        
        console.log('✓ Email sent successfully');
        
        // Wait for confirmation
        await page.waitForTimeout(2000);
        
        // Close the browser
        await closeBrowser();
        console.log('✓ Browser closed after sending email');
        
        return `Successfully sent email to ${recipientEmail} with subject "${subject}" regarding: ${request}`;
        
      } catch (error) {
        console.error('Error sending email:', error);
        await closeBrowser();
        throw new Error(`Failed to send email: ${error.message}`);
      }
    }
  })
];





// LLM PROMPT HERE
async function createAgent() {
  const systemMessage = `You are a helpful assistant that can interact with web browsers and Google services.

When the user asks to open a Google service, website, or search for something, use the open_new_tab tool. Examples:
- "open google sheets" → use open_new_tab with service: "sheets"
- "open gmail" → use open_new_tab with service: "gmail"
- "create new google doc" → use open_new_tab with service: "new docs"
- "go to youtube" → use open_new_tab with service: "youtube"
- "google pictures of cats" → use open_new_tab with search: "pictures of cats"
- "search for pizza recipes" → use open_new_tab with search: "pizza recipes"
- "look up how to bake cookies" → use open_new_tab with search: "how to bake cookies"

IMPORTANT SEARCH DETECTION: If the user's request contains words like "google", "search", "look up", "find", or asks about something they want to search for, use the 'search' parameter in open_new_tab tool.

When the user asks to send an email, use the send_email tool. Examples:
- "Send an email to example@gmail.com requesting a meeting" → use send_email with recipientEmail: "example@gmail.com" and request: "requesting a meeting"
- "Email john@company.com asking for the project update" → use send_email with recipientEmail: "john@company.com" and request: "asking for the project update"
- "Send a message to alice@example.com about the deadline extension" → use send_email with recipientEmail: "alice@example.com" and request: "about the deadline extension"

The send_email tool will automatically:
1. Open Gmail in the browser
2. Compose a new email
3. Generate an appropriate subject line based on the request
4. Generate a professional email body
5. Send the email
6. Close the browser

When the user asks to create calendar events or perform complex automation, use the browser automation tools like create_calendar_event.

For ANY search queries or requests to "google" something, always use the open_new_tab tool with the search parameter.

Always prefer opening a new tab for navigation and search requests. Only use browser automation when you need to interact with page elements or fill forms.

CRITICAL: When any tool returns a message containing "Task completed successfully!" or "Successfully", you MUST IMMEDIATELY stop and provide a Final Answer. Do NOT repeat the same action. Do NOT continue thinking about alternative approaches. The task is DONE.`;

  const agent = await initializeAgentExecutorWithOptions(tools, llm, {
    agentType: "structured-chat-zero-shot-react-description",
    verbose: true,
    maxIterations: 2, // Reduced from 5 to prevent loops
    returnIntermediateSteps: true,
    earlyStoppingMethod: "force", // Changed from "generate" to "force"
    handleParsingErrors: true,
    agentArgs: {
      prefix: systemMessage,
      suffix: `REMEMBER: If a tool returns "Task completed successfully!" or any success message, you MUST immediately respond with a Final Answer confirming the task is done. Do NOT repeat the action.`
    }
  });
  
  // Custom wrapper to detect successful completions and force stop
  const originalCall = agent.call.bind(agent);
  agent.call = async function(inputs, ...args) {
    let result = await originalCall(inputs, ...args);
    
    // Check if any intermediate step contains a successful completion
    if (result.intermediateSteps && result.intermediateSteps.length > 0) {
      const successfulSteps = result.intermediateSteps.filter(step => 
        step.observation && (
          step.observation.includes("Task completed successfully") ||
          step.observation.includes("Successfully opened") ||
          step.observation.includes("Successfully created") ||
          step.observation.includes("Successfully sent")
        )
      );
      
      // If we found a successful step, use its observation as the output
      if (successfulSteps.length > 0) {
        const firstSuccess = successfulSteps[0];
        result.output = firstSuccess.observation;
        
        // Remove any duplicate steps after the first success
        const firstSuccessIndex = result.intermediateSteps.indexOf(firstSuccess);
        result.intermediateSteps = result.intermediateSteps.slice(0, firstSuccessIndex + 1);
      }
    }
    
    // Handle max iterations error
    if (result.output && result.output.includes("Agent stopped due to max iterations") && 
        result.intermediateSteps && result.intermediateSteps.length > 0) {
      const lastStep = result.intermediateSteps[result.intermediateSteps.length - 1];
      if (lastStep.observation && lastStep.observation.includes("Task completed")) {
        result.output = lastStep.observation;
      }
    }
    
    return result;
  };
  
  return agent;
}


app.post("/invoke", async (req, res) => {
  try {
    const { prompt, debug = false } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    
    console.log(`\nReceived prompt: ${prompt}`);
    if (debug) console.log('Debug mode enabled');
    

    if (prompt.toLowerCase().includes('calendar') || prompt.toLowerCase().includes('event')) {

      const hasStoredSession = fs.existsSync(path.join(userDataDir, 'Default'));
      if (!hasStoredSession) {
        return res.json({
          success: false,
          error: "Not logged into Google Calendar. Please log in first.",
          needsLogin: true
        });
      }
    }
    

    const agent = await createAgent();
    const result = await agent.call({ input: prompt });
    
    console.log("Agent execution completed");
    

    await closeBrowser();
    
    res.json({
      success: true,
      result: result.output,
      intermediateSteps: result.intermediateSteps || [],
      output: result.output
    });
    
  } catch (error) {
    console.error("Error executing agent:", error);

    await closeBrowser();
    res.status(500).json({ 
      error: "Failed to execute agent",
      details: error.message 
    });
  }
});


app.get("/tab-requests", (req, res) => {
  const requests = Array.from(pendingTabRequests.entries()).map(([id, data]) => ({
    id,
    ...data
  }));
  
  res.json({ requests });
});


app.post("/tab-requests/:id/complete", (req, res) => {
  const { id } = req.params;
  const { dataUrl, error, success, filename, downloadId } = req.body;
  
  if (pendingTabRequests.has(id)) {
    const request = pendingTabRequests.get(id);
    request.status = 'completed';
    

    if (dataUrl) {
      request.dataUrl = dataUrl;
    }
    

    if (success && filename) {
      request.success = true;
      request.filename = filename;
      request.downloadId = downloadId;
    }
    
 
    if (error) {
      request.error = error;
    }
    
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Request not found" });
  }
});


app.post("/auth/google-login", async (req, res) => {
  try {
    await ensureBrowserOpen();
    
    if (!page) {
      return res.status(500).json({ error: "Browser not initialized" });
    }
    
    console.log("Initiating Google login flow...");

    await page.goto('https://accounts.google.com');
    

    res.json({ 
      success: true, 
      message: "Please complete Google login in the browser window. Check status with /auth/status endpoint." 
    });
    

    monitorLoginCompletion();
    
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function monitorLoginCompletion() {
  try {

    await page.waitForFunction(() => {
      return window.location.href.includes('myaccount.google.com') || 
             window.location.href.includes('calendar.google.com') ||
             (window.location.href.includes('google.com') && !window.location.href.includes('accounts'));
    }, { timeout: 300000 });
    
    console.log("✅ Google login successful!");

    await page.goto('https://calendar.google.com');
    

    setTimeout(async () => {
      await closeBrowser();
    }, 5000); 
    
  } catch (error) {
    console.log("Login monitoring stopped:", error.message);

    await closeBrowser();
  }
}

app.get("/auth/status", async (req, res) => {
  try {
    const hasStoredSession = fs.existsSync(path.join(userDataDir, 'Default'));
    
    res.json({ 
      loggedIn: hasStoredSession, 
      currentUrl: page ? page.url() : null,
      browserDataDir: userDataDir,
      browserOpen: !!page
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message, loggedIn: false });
  }
});

app.post("/auth/logout", async (req, res) => {
  try {
    await ensureBrowserOpen();
    
    if (!page) {
      return res.status(500).json({ error: "Browser not initialized" });
    }
    
    await page.goto('https://accounts.google.com/Logout');
    
    setTimeout(async () => {
      await closeBrowser();
    }, 3000);
    
    res.json({ 
      success: true, 
      message: "Logged out of Google" 
    });
    
  } catch (error) {
    await closeBrowser();
    res.status(500).json({ error: error.message });
  }
});

app.post("/browser/navigate", async (req, res) => {
  try {
    const { url } = req.body;
    
    await ensureBrowserOpen();
    
    if (!page) {
      return res.status(500).json({ error: "Browser not initialized" });
    }
    
    await page.goto(url);
    
    setTimeout(async () => {
      await closeBrowser();
    }, 3000);
    
    res.json({ success: true, url });
  } catch (error) {
    console.error("Navigation error:", error);
    await closeBrowser();
    res.status(500).json({ error: error.message });
  }
});



app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    browserInitialized: !!browserContext
  });
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  if (browserContext) {
    await closeBrowser();
  }
  process.exit(0);
});

const PORT = process.env.PORT || 5185;
app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log("Browser will open on-demand when commands are executed");
}); 