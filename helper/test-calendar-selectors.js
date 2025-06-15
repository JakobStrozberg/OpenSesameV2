/**
 * 
 * This is a utility script for testing and debugging Google Calendar DOM selectors
 * used by the OpenSesame browser automation.
 * 
 * The script tests 3 main areas:
 * 
 * 1. Date Button Selection checks ability to find calendar date cells using
 *    data-date attributes (format: YYYYMMDD) 
 * 
 * 2. Event Creation Flow Tests the Create button interaction and checks for
 *    the presence of date/time input fields in the event creation dialog
 * 
 * 3. Interactive Debugging Keeps the browser open after tests complete,
 *    allowing manual inspection of DOM elements for troubleshooting
 */

import { chromium } from 'playwright';

async function testCalendarSelectors() {
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome'
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Opening Google Calendar...');
  await page.goto('https://calendar.google.com');
  
  // Wait for calendar to load
  await page.waitForTimeout(3000);
  
  console.log('\n--- Testing Date Selectors ---');
  
  // Test 1: Find date buttons by data-date
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dataDateValue = `${year}${month}${day}`;
    
    const dateButton = await page.locator(`td[data-date="${dataDateValue}"] button`);
    const count = await dateButton.count();
    console.log(`✓ Found ${count} date button(s) with data-date="${dataDateValue}"`);
  } catch (e) {
    console.log('✗ Could not find date buttons by data-date');
  }
  
  // Test 2: Find date buttons by aria-label
  try {
    const buttons = await page.getByRole('button').all();
    const dateButtons = [];
    for (const button of buttons) {
      const label = await button.getAttribute('aria-label');
      if (label && label.match(/^\d+, \w+day$/)) {
        dateButtons.push(label);
      }
    }
    console.log(`✓ Found ${dateButtons.length} date buttons by aria-label`);
    if (dateButtons.length > 0) {
      console.log('  Examples:', dateButtons.slice(0, 3).join(', '));
    }
  } catch (e) {
    console.log('✗ Could not find date buttons by aria-label');
  }
  
  // Test 3: Create event and check for date/time inputs
  console.log('\n--- Testing Create Event Flow ---');
  
  try {
    // Click Create button
    await page.getByRole('button', { name: 'Create' }).click();
    console.log('✓ Clicked Create button');
    await page.waitForTimeout(2000);
    
    // Try to find Event option
    try {
      await page.getByRole('menuitem', { name: 'Event' }).click();
      console.log('✓ Clicked Event option');
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('  Event option not needed');
    }
    
    // Check for date/time fields
    const dateFields = await page.getByRole('textbox', { name: /date|when/i }).all();
    console.log(`✓ Found ${dateFields.length} date textbox field(s)`);
    
    const timeFields = await page.getByRole('textbox', { name: /time|start time/i }).all();
    console.log(`✓ Found ${timeFields.length} time textbox field(s)`);
    
    // Check for alternative time selectors
    const timeInputs = await page.locator('input[aria-label*="Time"], input[aria-label*="Start time"]').all();
    console.log(`✓ Found ${timeInputs.length} time input(s) by CSS selector`);
    
  } catch (e) {
    console.log('✗ Error in create event flow:', e.message);
  }
  
  console.log('\n--- Test Complete ---');
  console.log('Keep the browser open to inspect elements manually.');
  console.log('Press Ctrl+C to close.');
  
  // Keep browser open
  await new Promise(() => {});
}

testCalendarSelectors().catch(console.error); 