# Calendar Usage Guide

## Overview

The Calendar Assistant uses Playwright's recommended locator methods for reliable interaction with Google Calendar's UI. This approach uses semantic locators that are stable and maintainable.

## Implementation with Playwright Locators

The calendar automation uses Playwright's best practices:

### Locator Methods Used
- **`getByRole()`**: For buttons and interactive elements
- **`getByPlaceholder()`**: For input fields with placeholder text
- **`getByLabel()`**: For form inputs with labels (with regex support)

### Key Interactions
- **Create Button**: `page.getByRole('button', { name: 'Create' })`
- **Title Input**: `page.getByPlaceholder('Add title')`
- **Date Input**: `page.getByLabel(/date|when/i)`
- **Time Input**: `page.getByLabel(/time|from/i)`
- **Save Button**: `page.getByRole('button', { name: 'Save' })`

## Supported Date Formats

The system can understand and parse various date expressions:

### Relative Dates
- `"tomorrow"` - The next day
- `"today"` - Current day
- `"next week"` - 7 days from today
- `"in 3 days"` - Specific number of days from today

### Day Names
- `"Monday"` - The upcoming Monday (or next Monday if today is Monday)
- `"next Tuesday"` - The Tuesday of next week
- `"Friday"` - The upcoming Friday

### Specific Dates
- `"June 10th"` - June 10th (with ordinal suffix)
- `"Dec 25"` - December 25th
- `"12/25"` - December 25th (MM/DD format)

### Time Formats
- `"at 12"` - 12:00 PM (noon)
- `"at 2pm"` - 2:00 PM
- `"at 3:30pm"` - 3:30 PM
- `"at noon"` - 12:00 PM
- `"at 10:00 AM"` - 10:00 AM

## Example Commands

```
"Create calendar event 'Lunch with girlfriend' on June 10th at 12"
"Schedule 'Team Meeting' tomorrow at 2pm"
"Add event 'Birthday Party' on Dec 25 at 6pm"
"Create meeting 'Project Review' in 3 days at noon"
```

## How It Works

1. **Create Button**: Uses `getByRole('button')` to find and click the Create button
2. **Event Selection**: Selects "Event" from the dropdown menu using `getByRole('menuitem')`
3. **Title Input**: Uses `getByPlaceholder('Add title')` with fallback to `getByRole('textbox')`
4. **Date Selection**: Uses `getByLabel(/date|when/i)` for date fields
5. **Time Input**: Uses `getByLabel(/time|from/i)` for time fields
6. **Save**: Uses `getByRole('button', { name: 'Save' })` or Enter key fallback

## Stack

The implementation uses Playwright's recommended practices:
- **Semantic locators** over CSS selectors for better stability
- **Simple fallback strategies** for critical interactions
- **Clean, maintainable code** without complex selector arrays

This approach is stable and resilient to UI changes compared to using brittle CSS selectors or XPath. 